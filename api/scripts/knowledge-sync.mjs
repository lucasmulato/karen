#!/usr/bin/env node
/**
 * Knowledge sync — two cheap, reversible automations:
 *  1. embed nodes created/edited since the last backfill (no note is missed);
 *  2. extract CVE/tool entities from fresh vault notes and link them in the graph.
 * Deterministic, idempotent, no LLM involved.
 *
 *   node scripts/knowledge-sync.mjs --dry-run
 */
import { readFile, readdir, stat, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { VaultService } from "../build/services/vault.js";
import { EmbeddingService, embeddingConfigFromEnv } from "../build/services/embeddings.js";
import { extractEntities } from "./lib/entities.mjs";

const DATA = "/home/admin/karen/api/data";
const REPORT = resolve(`${DATA}/knowledge-sync.json`);
const VAULT = process.env.KAREN_VAULT_DIR || "/home/admin/models/karen-vault";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const DRY = process.argv.includes("--dry-run");
const MAX_EMBED = 100;
const FRESH_MS = 48 * 60 * 60 * 1000;

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

async function freshNotes() {
  const out = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      try {
        const info = await stat(full);
        if (Date.now() - info.mtimeMs > FRESH_MS) continue;
        out.push({ path: full, name: entry.name.replace(/\.md$/i, ""), body: await readFile(full, "utf8") });
      } catch { /* skip */ }
    }
  }
  await walk(VAULT);
  return out;
}

async function main() {
  const config = embeddingConfigFromEnv();
  const embeddings = config ? new EmbeddingService(config) : null;
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const vault = new VaultService(client, embeddings);
  const report = {
    generated_at: new Date().toISOString(),
    embedded: 0,
    entities: { cves: [], tools: [] },
    linked: 0,
    issues: [],
  };
  try {
    if (embeddings) {
      const pending = await vault.getNodesWithoutEmbedding(MAX_EMBED);
      for (const node of pending) {
        try {
          if (!DRY) {
            const vector = await embeddings.embedOne(`${node.name}\n${node.description ?? ""}`);
            await vault.setEmbedding(node.id, vector, embeddings.model);
          }
          report.embedded++;
        } catch (err) {
          report.issues.push(`embed ${node.name}: ${String(err?.message ?? "").slice(0, 80)}`);
        }
      }
    } else {
      report.issues.push("embeddings não configurados");
    }

    const toolConfig = (await readJson("/home/admin/karen/api/config/entity-tools.json")) ?? { tools: [] };
    for (const note of await freshNotes()) {
      const found = extractEntities(note.body, toolConfig.tools);
      for (const [kind, names] of [["cve", found.cves], ["tool", found.tools]]) {
        for (const name of names) {
          report.entities[kind === "cve" ? "cves" : "tools"].push(name);
          if (DRY) continue; // dry-run must never write to the graph
          let node;
          try {
            node = await vault.addNode({
              type: kind,
              name,
              description: `Entidade extraída automaticamente de ${note.name}.`,
              source: "entity:extract",
            });
          } catch { /* already exists — look it up */ }
          const target = node ?? (await vault.searchNodes(name, kind, 1))[0];
          const sourceNote = (await vault.searchNodes(note.name, undefined, 1))[0];
          if (target && sourceNote && target.id !== sourceNote.id) {
            try {
              await vault.addEdge({ source_id: sourceNote.id, target_id: target.id, label: "relates_to" });
              report.linked++;
            } catch { /* edge already exists */ }
          }
        }
      }
    }
    report.entities.cves = [...new Set(report.entities.cves)];
    report.entities.tools = [...new Set(report.entities.tools)];
  } finally {
    await client.end();
  }

  const payload = `${JSON.stringify(report, null, 2)}\n`;
  if (DRY) { console.log(payload); return; }
  const tmp = `${REPORT}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, REPORT);
  console.log(
    `[knowledge-sync] ${report.embedded} embeddings · ${report.entities.cves.length} CVE(s) · ` +
      `${report.entities.tools.length} tool(s) · ${report.linked} aresta(s) → ${REPORT}`
  );
}

main().catch((err) => { console.error(err); process.exit(1); });
