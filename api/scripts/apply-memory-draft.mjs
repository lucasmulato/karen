#!/usr/bin/env node
/**
 * Promotes approved MEMORY.md drafts from the vault garden into persistent
 * memory using the same append-only path as the `remember` tool.
 *
 * MEMORY.md is append-only by design: this action is NOT mechanically
 * reversible. Requiring --approve is the gate. No other vault file is touched.
 *
 *   node scripts/apply-memory-draft.mjs --dry-run
 *   node scripts/apply-memory-draft.mjs --approve
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { VaultFsService } from "../build/services/vaultfs.js";

const DATA = "/home/admin/karen/api/data";
const GARDEN = resolve(`${DATA}/vault-maintenance.json`);
const AUDIT = resolve(`${DATA}/memory-applied.json`);
const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const APPROVE = args.has("--approve");

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

async function main() {
  const garden = await readJson(GARDEN);
  const lines = Array.isArray(garden?.memory_draft) ? garden.memory_draft.filter((l) => typeof l === "string" && l.trim()) : [];
  if (!lines.length) { console.log("Sem rascunhos de MEMORY.md."); return; }
  const previous = (await readJson(AUDIT))?.entries ?? [];
  const already = new Set(previous.map((e) => e.line));
  const fresh = lines.filter((line) => !already.has(line));
  if (!fresh.length) { console.log("Rascunhos já aplicados."); return; }
  if (!APPROVE && !DRY) throw new Error("MEMORY.md é append-only — use --approve para confirmar.");

  if (!DRY) {
    const vault = new VaultFsService();
    await vault.appendMemory(
      "Decisões",
      fresh.map((line) => line.replace(/^-\s*/, "")).join("\n")
    );
  }
  const entries = [
    ...previous,
    ...fresh.map((line) => ({ line, applied_at: new Date().toISOString(), source: garden.generated_at })),
  ];
  const report = {
    generated_at: new Date().toISOString(),
    count: entries.length,
    entries,
    reversible: false,
    note: "MEMORY.md é append-only; reverter exige edição manual do arquivo.",
  };
  if (DRY) { console.log(JSON.stringify(report, null, 2)); return; }
  const tmp = `${AUDIT}.tmp`;
  await writeFile(tmp, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(tmp, AUDIT);
  console.log(`[apply-memory-draft] ${fresh.length} linha(s) acrescentada(s) ao MEMORY.md (append-only) → ${AUDIT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
