/**
 * JSON Canvas 1.0 export/import for the SynapseVault graph.
 *
 * Spec: https://github.com/obsidianmd/jsoncanvas (MIT). The graph stays yours:
 * a .canvas file is plain JSON that Obsidian can open without any plugin.
 */
import type { Client } from "pg";
import { NODE_TYPES, type VaultService } from "./vault.js";

const COLOR_BY_TYPE: Record<string, string> = {
  finding: "1",
  cve: "2",
  task: "2",
  idea: "3",
  label: "3",
  fix: "4",
  project: "4",
  tool: "5",
  writeup: "5",
  note: "6",
  technique: "6",
  target: "6",
};

const TYPE_SET = new Set<string>(NODE_TYPES);
const MAX_NODES = 1000;
const MAX_EDGES = 4000;

export interface CanvasNode {
  id: string;
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text: string;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide: "right";
  toSide: "left";
  toEnd: "arrow";
  label?: string;
}

export interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

function textFor(name: string, type: string, description: string | null, properties: Record<string, unknown>): string {
  const extras = Object.entries(properties)
    .filter(([k]) => !k.startsWith("_"))
    .slice(0, 8)
    .map(([k, v]) => `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("\n");
  return [`# ${name}`, "", `[${type}]`, "", description?.trim() || "(sem descrição)", ...(extras ? ["", extras] : [])].join("\n");
}

function parseText(text: string): { name: string; type: string; description: string } {
  const lines = text.split("\n");
  const name = (lines.find((l) => l.startsWith("# ")) ?? "").replace(/^#\s*/, "").trim() || "Sem título";
  const typeLine = lines.find((l) => /^\[[a-z_]+\]$/.test(l.trim())) ?? "";
  const rawType = typeLine.replace(/^\[|\]$/g, "").trim();
  const type = TYPE_SET.has(rawType) ? rawType : "note";
  const description = lines
    .filter((l) => !l.startsWith("# ") && l.trim() !== `[${type}]`)
    .join("\n")
    .trim();
  return { name, type, description };
}

export class CanvasService {
  constructor(private readonly client: Client, private readonly vault: VaultService) {}

  async export(): Promise<Canvas> {
    const graph = await this.vault.getGraph();
    const nodes: CanvasNode[] = graph.nodes.map((node, index) => {
      const props = node.properties ?? {};
      const savedX = props._x;
      const savedY = props._y;
      const x = Number.isFinite(savedX) ? Math.round(Number(savedX)) : (index % 6) * 260;
      const y = Number.isFinite(savedY) ? Math.round(Number(savedY)) : Math.floor(index / 6) * 180;
      return {
        id: node.id,
        type: "text",
        x,
        y,
        width: 220,
        height: 120,
        color: COLOR_BY_TYPE[node.type] ?? "6",
        text: textFor(node.name, node.type, node.description, props),
      };
    });
    const idSet = new Set(nodes.map((n) => n.id));
    const edges: CanvasEdge[] = graph.edges
      .filter((e) => idSet.has(e.source_id) && idSet.has(e.target_id))
      .map((e) => ({
        id: e.id,
        fromNode: e.source_id,
        toNode: e.target_id,
        fromSide: "right",
        toSide: "left",
        toEnd: "arrow",
        label: e.label,
      }));
    return { nodes, edges };
  }

  async import(canvas: Canvas): Promise<{ imported: number; edges: number; skipped: number }> {
    const nodes = canvas.nodes ?? [];
    const edges = canvas.edges ?? [];
    if (nodes.length > MAX_NODES) throw new Error(`Too many nodes (max ${MAX_NODES})`);
    if (edges.length > MAX_EDGES) throw new Error(`Too many edges (max ${MAX_EDGES})`);

    const idMap = new Map<string, string>();
    let imported = 0;
    for (const canvasNode of nodes) {
      if (canvasNode.type !== "text" || !canvasNode.id) continue;
      const { name, type, description } = parseText(String(canvasNode.text ?? ""));
      let existing = await this.client.query(
        `SELECT id FROM nodes WHERE properties->>'_canvas_id' = $1 LIMIT 1`,
        [canvasNode.id]
      );
      // Exported canvases use DB UUIDs as canvas IDs — match those too so a
      // round-trip update positions instead of creating duplicates.
      if (!existing.rowCount && /^[\da-f-]{36}$/i.test(canvasNode.id)) {
        existing = await this.client.query(
          `SELECT id FROM nodes WHERE id = $1::uuid LIMIT 1`,
          [canvasNode.id]
        );
      }
      let dbId: string;
      if (existing.rowCount) {
        dbId = existing.rows[0].id;
        await this.vault.updateNodeProperties(dbId, {
          _canvas_id: canvasNode.id,
          _x: Math.round(canvasNode.x ?? 0),
          _y: Math.round(canvasNode.y ?? 0),
        });
      } else {
        const row = await this.vault.addNode({
          type,
          name: name.slice(0, 500),
          description: description.slice(0, 10000),
          properties: {
            _canvas_id: canvasNode.id,
            _x: Math.round(canvasNode.x ?? 0),
            _y: Math.round(canvasNode.y ?? 0),
          },
          source: "canvas:import",
        });
        dbId = row.id;
        imported++;
      }
      idMap.set(canvasNode.id, dbId);
    }

    let createdEdges = 0;
    for (const edge of edges) {
      const source = idMap.get(edge.fromNode);
      const target = idMap.get(edge.toNode);
      if (!source || !target || source === target) continue;
      const label = String(edge.label ?? "relates_to").slice(0, 50);
      const exists = await this.client.query(
        `SELECT 1 FROM edges WHERE source_id = $1 AND target_id = $2 AND label = $3 LIMIT 1`,
        [source, target, label]
      );
      if (exists.rowCount) continue;
      await this.vault.addEdge({ source_id: source, target_id: target, label });
      createdEdges++;
    }

    return { imported, edges: createdEdges, skipped: nodes.length - imported };
  }
}
