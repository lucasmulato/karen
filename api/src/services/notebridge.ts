/**
 * Bridge between plain markdown notes and the structured Postgres graph.
 *
 * A note opts in with `graph_id: <uuid>` in its frontmatter. The bridge upserts
 * that node and mirrors wikilinks to other opted-in notes as `relates_to` edges.
 * The markdown file remains the source of truth.
 */
import type { Client } from "pg";
import type { VaultFsService } from "./vaultfs.js";
import type { NoteLinksService } from "./notelinks.js";
import { parseFrontmatter } from "./notelinks.js";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const KNOWN_TYPES = new Set([
  "idea", "project", "task", "label", "note", "finding", "technique",
  "cve", "tool", "writeup", "target", "fix",
]);

function mapType(value: string): string {
  const t = value.toLowerCase();
  if (KNOWN_TYPES.has(t)) return t;
  return "note";
}

function parseTags(value: string): string[] {
  if (!value) return [];
  const inner = value.startsWith("[") ? value.slice(1, -1) : value;
  return inner
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
}

export interface SyncResult {
  synced: boolean;
  nodeId?: string;
  edges: number;
  reason?: string;
}

export class NoteGraphBridge {
  constructor(
    private readonly client: Client,
    private readonly vault: VaultFsService,
    private readonly links: NoteLinksService
  ) {}

  private async upsertNode(path: string): Promise<string | null> {
    const body = await this.vault.read(path).catch(() => null);
    if (!body) return null;
    const meta = parseFrontmatter(body);
    const graphId = (meta.graph_id ?? "").trim();
    if (!UUID.test(graphId)) return null;
    const name =
      meta.title ||
      body.split("\n").find((l) => l.startsWith("# "))?.replace(/^#\s*/, "").trim() ||
      path.split("/").pop()!.replace(/\.md$/i, "");
    const description = body.replace(/^---\n[\s\S]*?\n---\n?/, "").trim().slice(0, 10_000);
    const properties = {
      note_path: path,
      tags: parseTags(meta.tags ?? ""),
      maturity: (meta.maturity || "seedling").toLowerCase(),
      source: "markdown-vault",
    };
    await this.client.query(
      `INSERT INTO nodes (id, type, name, description, properties, source)
       VALUES ($1,$2,$3,$4,$5,'note:bridge')
       ON CONFLICT (id) DO UPDATE SET
         type = EXCLUDED.type, name = EXCLUDED.name,
         description = EXCLUDED.description, properties = EXCLUDED.properties,
         updated_at = CURRENT_TIMESTAMP`,
      [graphId, mapType(meta.type ?? "note"), name, description, JSON.stringify(properties)]
    );
    return graphId;
  }

  private async syncEdges(path: string, graphId: string): Promise<number> {
    const graph = await this.links.graph();
    const idsByPath = new Map(
      graph.nodes
        .filter((n) => n.graphId && UUID.test(n.graphId))
        .map((n) => [n.path, n.graphId!])
    );
    let edges = 0;
    for (const edge of graph.edges.filter((e) => e.source === path)) {
      const targetId = idsByPath.get(edge.target);
      if (!targetId || targetId === graphId) continue;
      // The target node may not exist yet when saving a single note.
      const exists = await this.client.query("SELECT 1 FROM nodes WHERE id = $1", [targetId]);
      if (!exists.rowCount) continue;
      const res = await this.client.query(
        `INSERT INTO edges (source_id, target_id, label)
         VALUES ($1,$2,'relates_to')
         ON CONFLICT (source_id, target_id, label) DO NOTHING`,
        [graphId, targetId]
      );
      edges += res.rowCount ?? 0;
    }
    return edges;
  }

  async syncPath(path: string): Promise<SyncResult> {
    const graphId = await this.upsertNode(path);
    if (!graphId) {
      const body = await this.vault.read(path).catch(() => null);
      return {
        synced: false,
        edges: 0,
        reason: !body ? "nota não encontrada" : "sem graph_id válido",
      };
    }
    return { synced: true, nodeId: graphId, edges: await this.syncEdges(path, graphId) };
  }

  async syncAll(): Promise<{ notes: number; edges: number }> {
    const graph = await this.links.graph();
    const opted = graph.nodes.filter((n) => n.graphId && UUID.test(n.graphId));
    // Two passes: create every node first, then wire edges between them.
    let notes = 0;
    for (const n of opted) if (await this.upsertNode(n.path)) notes++;
    let edges = 0;
    for (const n of opted) if (n.graphId) edges += await this.syncEdges(n.path, n.graphId);
    return { notes, edges };
  }
}
