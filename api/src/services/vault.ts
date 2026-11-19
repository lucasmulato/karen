import { createHash } from "node:crypto";
import { Client } from "pg";
import type { EmbeddingService } from "./embeddings.js";

/** Node types — original four plus the cyber-investigation taxonomy. */
export const NODE_TYPES = [
  "idea",
  "project",
  "task",
  "label",
  "note",
  "finding",
  "technique",
  "cve",
  "tool",
  "writeup",
  "target",
  "fix",
] as const;

/** Relationship labels understood by the graph and the agent. */
export const EDGE_LABELS = [
  "relates_to",
  "contains",
  "depends_on",
  "tagged_with",
  "exploits",
  "observed_in",
  "mitigated_by",
] as const;

const NODE_COLUMNS =
  "id, type, name, description, properties, created_at, updated_at, content_hash, source";

export interface NodeRow {
  id: string;
  type: string;
  name: string;
  description: string | null;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  content_hash?: string | null;
  source?: string | null;
}

export interface EdgeRow {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
  properties: Record<string, unknown>;
  created_at: string;
}

export interface GraphData {
  nodes: NodeRow[];
  edges: EdgeRow[];
}

export interface AddNodeInput {
  type: string;
  name: string;
  description?: string;
  properties?: Record<string, unknown>;
  source?: string;
  embedding?: number[];
}

export interface AddEdgeInput {
  source_id: string;
  target_id: string;
  label: string;
  properties?: Record<string, unknown>;
}

/**
 * VaultService wraps all read/write access to the SynapseVault graph.
 *
 * Shared by both the MCP stdio server (agent tools) and the HTTP REST
 * surface (UI) so the two interfaces can never drift apart.
 */
export class VaultService {
  constructor(
    private readonly client: Client,
    private readonly embeddings?: EmbeddingService | null
  ) {}

  private hash(name: string, description: string): string {
    return createHash("sha256").update(`${name}\n${description}`).digest("hex");
  }

  async addNode(input: AddNodeInput): Promise<NodeRow> {
    const description = input.description ?? "";
    const fields = [
      "type",
      "name",
      "description",
      "properties",
      "content_hash",
      "source",
    ];
    const values: unknown[] = [
      input.type,
      input.name,
      description,
      JSON.stringify(input.properties ?? {}),
      this.hash(input.name, description),
      input.source ?? null,
    ];
    if (input.embedding && this.embeddings) {
      fields.push("embedding");
      values.push(this.embeddings.toPgVector(input.embedding));
    }
    const placeholders = fields.map(
      (field, i) => `$${i + 1}${field === "embedding" ? "::vector" : ""}`
    );
    const res = await this.client.query(
      `INSERT INTO nodes (${fields.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING ${NODE_COLUMNS}`,
      values
    );
    return res.rows[0];
  }

  async addEdge(input: AddEdgeInput): Promise<EdgeRow> {
    const res = await this.client.query(
      "INSERT INTO edges (source_id, target_id, label, properties) VALUES ($1, $2, $3, $4) RETURNING *",
      [
        input.source_id,
        input.target_id,
        input.label,
        JSON.stringify(input.properties ?? {}),
      ]
    );
    return res.rows[0];
  }

  async updateNodeProperties(
    id: string,
    patch: Record<string, unknown>
  ): Promise<NodeRow | undefined> {
    const res = await this.client.query(
      `UPDATE nodes SET properties = properties || $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid RETURNING ${NODE_COLUMNS}`,
      [JSON.stringify(patch), id]
    );
    return res.rows[0];
  }

  async findByContentHash(hash: string): Promise<NodeRow | undefined> {
    const res = await this.client.query(
      `SELECT ${NODE_COLUMNS} FROM nodes WHERE content_hash = $1 LIMIT 1`,
      [hash]
    );
    return res.rows[0];
  }

  /** Nodes created/updated before vector indexing was available. */
  async getNodesWithoutEmbedding(limit = 100): Promise<NodeRow[]> {
    const res = await this.client.query(
      `SELECT ${NODE_COLUMNS} FROM nodes WHERE embedding IS NULL ORDER BY created_at ASC LIMIT $1`,
      [limit]
    );
    return res.rows;
  }

  async setEmbedding(id: string, vector: number[], model: string): Promise<void> {
    if (!this.embeddings) throw new Error("Embeddings are not configured");
    await this.client.query(
      `UPDATE nodes SET embedding = $1::vector, embedding_model = $2, embedding_updated_at = CURRENT_TIMESTAMP WHERE id = $3::uuid`,
      [this.embeddings.toPgVector(vector), model, id]
    );
  }

  private async keywordSearch(
    query: string,
    type: string | undefined,
    limit: number
  ): Promise<NodeRow[]> {
    const params: unknown[] = [`%${query}%`];
    let sql = `SELECT ${NODE_COLUMNS} FROM nodes WHERE (name ILIKE $1 OR description ILIKE $1)`;
    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }
    sql += " ORDER BY created_at DESC LIMIT $" + (params.length + 1);
    params.push(limit);
    const res = await this.client.query(sql, params);
    return res.rows;
  }

  private async semanticSearch(
    vector: number[],
    type: string | undefined,
    limit: number
  ): Promise<NodeRow[]> {
    if (!this.embeddings) return [];
    const params: unknown[] = [this.embeddings.toPgVector(vector)];
    let sql = `SELECT ${NODE_COLUMNS} FROM nodes WHERE embedding IS NOT NULL`;
    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }
    sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
    params.push(limit);
    const res = await this.client.query(sql, params);
    return res.rows;
  }

  /** Search only the ingested security knowledge base. */
  async searchKb(query: string, limit = 10): Promise<NodeRow[]> {
    const res = await this.client.query(
      `SELECT ${NODE_COLUMNS} FROM nodes
        WHERE source LIKE 'kb:%' AND (name ILIKE $1 OR description ILIKE $1)
        ORDER BY name LIMIT $2`,
      [`%${query}%`, Math.min(Math.trunc(limit) || 10, 30)]
    );
    return res.rows;
  }

  /** Reciprocal rank fusion keeps both lexical and semantic hits. */
  private rrfMerge(
    keyword: NodeRow[],
    semantic: NodeRow[],
    limit: number
  ): NodeRow[] {
    const scores = new Map<string, number>();
    const byId = new Map<string, NodeRow>();
    const k = 60;
    const add = (rows: NodeRow[]) => {
      rows.forEach((row, index) => {
        byId.set(row.id, row);
        scores.set(row.id, (scores.get(row.id) ?? 0) + 1 / (k + index + 1));
      });
    };
    add(keyword);
    add(semantic);
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => byId.get(id)!);
  }

  /**
   * Hybrid search. Falls back to ILIKE when Cloudflare credentials are absent
   * or the embedding API is unavailable — the vault never depends on it.
   */
  async searchNodes(
    query?: string,
    type?: string,
    limit = 20
  ): Promise<NodeRow[]> {
    if (!query) {
      const params: unknown[] = [];
      let sql = `SELECT ${NODE_COLUMNS} FROM nodes WHERE 1=1`;
      if (type) {
        params.push(type);
        sql += ` AND type = $${params.length}`;
      }
      sql += " ORDER BY created_at DESC LIMIT $" + (params.length + 1);
      params.push(limit);
      const res = await this.client.query(sql, params);
      return res.rows;
    }

    const keyword = await this.keywordSearch(query, type, limit);
    if (!this.embeddings) return keyword;
    try {
      const vector = await this.embeddings.embedOne(query);
      const semantic = await this.semanticSearch(vector, type, limit);
      return this.rrfMerge(keyword, semantic, limit);
    } catch (err: any) {
      console.error("Semantic search failed, using keyword only:", err.message);
      return keyword;
    }
  }

  /**
   * Compiles a token-budgeted context block from the top matching nodes and
   * their 1-hop relationships. Keeps the local model's prompt small.
   */
  async contextForQuestion(question: string, maxChars = 6000): Promise<string> {
    const all = await this.searchNodes(question, undefined, 12);
    // KB chunks belong to search_kb, not to the ambient context — otherwise
    // the local model's prompt explodes and generation takes minutes.
    const nodes = all
      .filter((n) => !String(n.source ?? "").startsWith("kb:"))
      .slice(0, 6);
    if (nodes.length === 0) return "";
    let output = "";
    for (const node of nodes) {
      const rel = await this.client.query(
        `SELECT e.label, n.name AS neighbor
           FROM edges e JOIN nodes n ON n.id = e.target_id
          WHERE e.source_id = $1 LIMIT 8`,
        [node.id]
      );
      const relations = rel.rows.length
        ? rel.rows
            .map((r: any) => `-[${r.label}]-> ${r.neighbor}`)
            .join("; ")
        : "sem relações registradas";
      const block =
        `[${node.type}] ${node.name}\n` +
        `${(node.description ?? "").slice(0, 900)}\n` +
        `Relações: ${relations}\n\n`;
      if (output.length + block.length > maxChars) break;
      output += block;
    }
    return output.trim();
  }

  async getGraph(): Promise<GraphData> {
    const [nodes, edges] = await Promise.all([
      this.client.query(`SELECT ${NODE_COLUMNS} FROM nodes ORDER BY created_at DESC`),
      this.client.query("SELECT * FROM edges"),
    ]);
    return { nodes: nodes.rows, edges: edges.rows };
  }
}
