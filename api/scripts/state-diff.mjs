#!/usr/bin/env node
/**
 * Deterministic "what changed since yesterday" for the graph. Compares current
 * nodes/edges with the previous daily snapshot and writes a small diff report.
 * Read-only against the graph; only the local snapshot file is replaced.
 *
 *   node scripts/state-diff.mjs --dry-run
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

const DATA = "/home/admin/karen/api/data";
const SNAPSHOT = resolve(`${DATA}/state-snapshot.json`);
const REPORT = resolve(`${DATA}/state-diff.json`);
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const DRY = process.argv.includes("--dry-run");

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}
async function writeAtomic(path, payload) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, path);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  let snapshot;
  try {
    const nodes = await client.query("SELECT id::text, content_hash, name FROM nodes");
    const edges = await client.query("SELECT id::text FROM edges");
    const current = {
      generated_at: new Date().toISOString(),
      nodes: Object.fromEntries(nodes.rows.map((r) => [r.id, { hash: r.content_hash, name: r.name }])),
      edges: edges.rows.map((r) => r.id),
    };
    const previous = await readJson(SNAPSHOT);
    const prevNodes = previous?.nodes ?? {};
    const prevEdges = new Set(previous?.edges ?? []);
    const nowEdges = new Set(current.edges);

    const added = Object.keys(current.nodes).filter((id) => !prevNodes[id]);
    const removed = Object.keys(prevNodes).filter((id) => !current.nodes[id]);
    const changed = Object.keys(current.nodes).filter(
      (id) => prevNodes[id] && prevNodes[id].hash !== current.nodes[id].hash
    );
    const diff = {
      generated_at: current.generated_at,
      since: previous?.generated_at ?? null,
      first_run: !previous,
      nodes_added: added.map((id) => ({ id, name: current.nodes[id].name })),
      nodes_removed: removed.map((id) => ({ id, name: prevNodes[id].name })),
      nodes_changed: changed.map((id) => ({ id, name: current.nodes[id].name })),
      edges_added: current.edges.filter((id) => !prevEdges.has(id)).length,
      edges_removed: [...prevEdges].filter((id) => !nowEdges.has(id)).length,
      counts: {
        nodes: Object.keys(current.nodes).length,
        edges: current.edges.length,
      },
    };
    const payload = `${JSON.stringify(diff, null, 2)}\n`;
    if (DRY) { console.log(payload); return; }
    await writeAtomic(REPORT, payload);
    await writeAtomic(SNAPSHOT, `${JSON.stringify(current)}\n`);
    console.log(
      `[state-diff] +${diff.nodes_added.length} -${diff.nodes_removed.length} ~${diff.nodes_changed.length} nós · ` +
        `+${diff.edges_added} -${diff.edges_removed} arestas → ${REPORT}`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
