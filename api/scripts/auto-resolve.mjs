#!/usr/bin/env node
/**
 * Closes the triage loop: informational `auto` items are marked as handled in
 * an audited file, then filtered out of the queue/attention. Nothing is
 * executed and no source file is modified. Fully reversible.
 *
 *   node scripts/auto-resolve.mjs --dry-run
 *   node scripts/auto-resolve.mjs --revert
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { autoResolvable, summarizeResolutions } from "./lib/auto-resolve.mjs";

const DATA = "/home/admin/karen/api/data";
const TRIAGE = resolve(process.env.KAREN_TRIAGE_JSON ?? `${DATA}/eva-triage.json`);
const RESOLVED = resolve(`${DATA}/auto-resolved.json`);
const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
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
  if (REVERT) {
    await writeAtomic(RESOLVED, `${JSON.stringify({ entries: [] }, null, 2)}\n`);
    console.log("[auto-resolve] resoluções revertidas — itens voltam à fila");
    return;
  }
  const triage = await readJson(TRIAGE);
  if (!triage?.generated_at) { console.log("Sem triagem para resolver."); return; }
  const previous = await readJson(RESOLVED);
  const existing = new Set((previous?.entries ?? []).map((e) => e.id));
  const entries = [];
  for (const item of triage.items ?? []) {
    if (!autoResolvable(item) || existing.has(item.id)) continue;
    entries.push({
      id: item.id,
      source: item.source,
      title: item.title,
      policy: item.policy,
      reason: item.reason,
      resolved_at: new Date().toISOString(),
      triage_generated_at: triage.generated_at,
    });
  }
  const all = [...(previous?.entries ?? []), ...entries];
  const report = {
    generated_at: new Date().toISOString(),
    summary: summarizeResolutions(all),
    entries: all,
    revert: "node scripts/auto-resolve.mjs --revert",
  };
  if (DRY) { console.log(JSON.stringify(report, null, 2)); return; }
  await writeAtomic(RESOLVED, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[auto-resolve] ${entries.length} novo(s) item(ns) resolvido(s) · total ${all.length} → ${RESOLVED}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
