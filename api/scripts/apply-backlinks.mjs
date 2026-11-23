#!/usr/bin/env node
/**
 * Applies vault-garden backlink suggestions to the graph — never to note files.
 *
 * Safety gates: requires `--approve`; the report must be at least 7 days old
 * (shadow period) unless `--force`; at most 20 notes per run. Every edge gets
 * an audit record so the whole run can be undone with `--revert`.
 *
 *   node scripts/apply-backlinks.mjs --dry-run
 *   node scripts/apply-backlinks.mjs --approve            # after shadow period
 *   node scripts/apply-backlinks.mjs --revert             # undo last run
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { VaultService } from "../build/services/vault.js";

const DATA = "/home/admin/karen/api/data";
const SUGGESTIONS = resolve(`${DATA}/vault-maintenance.json`);
const AUDIT = resolve(`${DATA}/backlinks-applied.json`);
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const SHADOW_DAYS = 7;
const MAX_NOTES = 20;

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const APPROVE = args.has("--approve");
const FORCE = args.has("--force");
const REVERT = args.has("--revert");

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
  const vault = new VaultService(client, null);
  try {
    if (REVERT) {
      const audit = await readJson(AUDIT);
      if (!audit) { console.log("Nada para reverter."); return; }
      let removed = 0;
      for (const edge of audit.edges ?? []) {
        try {
          await client.query("DELETE FROM edges WHERE id = $1::uuid", [edge.id]);
          removed++;
        } catch { /* already gone */ }
      }
      console.log(`[apply-backlinks] revert: ${removed} aresta(s) removida(s)`);
      return;
    }

    const report = await readJson(SUGGESTIONS);
    if (!report?.suggestions?.length) { console.log("Sem sugestões disponíveis."); return; }
    const age = Math.floor((Date.now() - Date.parse(report.generated_at)) / 86_400_000);
    if (!APPROVE && !DRY) throw new Error("Use --approve para aplicar sugestões.");
    if (age < SHADOW_DAYS && !FORCE && !DRY) {
      throw new Error(`Período shadow: ${age}/${SHADOW_DAYS} dias. Use --force se já revisou.`);
    }

    const edges = [];
    for (const suggestion of report.suggestions.slice(0, MAX_NOTES)) {
      for (const candidate of suggestion.candidates ?? []) {
        if (DRY) {
          edges.push({ source: suggestion.orphan.name, target: candidate.name, score: candidate.score });
          continue;
        }
        try {
          const edge = await vault.addEdge({
            source_id: suggestion.orphan.id,
            target_id: candidate.id,
            label: "relates_to",
          });
          edges.push({ id: edge.id, source: suggestion.orphan.name, target: candidate.name, score: candidate.score });
        } catch { /* duplicate or missing node — skip */ }
      }
    }
    const audit = {
      applied_at: new Date().toISOString(),
      source_report: report.generated_at,
      shadow_days: age,
      forced: FORCE,
      count: edges.length,
      edges,
      revert: "node scripts/apply-backlinks.mjs --revert",
    };
    if (DRY) { console.log(JSON.stringify(audit, null, 2)); return; }
    await writeAtomic(AUDIT, `${JSON.stringify(audit, null, 2)}\n`);
    console.log(`[apply-backlinks] ${edges.length} aresta(s) aplicada(s) → ${AUDIT}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
