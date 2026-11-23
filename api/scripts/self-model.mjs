#!/usr/bin/env node
/**
 * Builds KAREN's compact self-model and a unified action log from the reports
 * the nightly jobs already produce. Everything is deterministic — the model
 * only narrates this data in chat.
 *
 *   node scripts/self-model.mjs --dry-run
 */
import { readFile, readdir, stat, writeFile, rename, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const DATA = "/home/admin/karen/api/data";
const VAULT = process.env.KAREN_VAULT_DIR || "/home/admin/models/karen-vault";
const SELF = resolve(`${DATA}/self-model.json`);
const INDEX = resolve(`${DATA}/note-index.json`);
const LOG = resolve(`${DATA}/action-log.jsonl`);
const DRY = process.argv.includes("--dry-run");

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}
async function writeAtomic(path, payload) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, path);
}
function clamp(text, max) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

async function noteIndex() {
  const notes = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      try {
        const info = await stat(full);
        notes.push({ name: entry.name.replace(/\.md$/i, ""), mtime: info.mtimeMs });
      } catch { /* skip */ }
    }
  }
  await walk(VAULT);
  notes.sort((a, b) => b.mtime - a.mtime);
  const names = notes.slice(0, 25).map((n) => n.name);
  return {
    generated_at: new Date().toISOString(),
    total: notes.length,
    recent: names,
    prompt: clamp(`Notas do vault (${notes.length} no total; ${names.length} recentes): ${names.join(", ")}.`, 700),
  };
}

async function main() {
  const [resolved, backlinks, proposals, sync, drafts, diff, secrets, triage, memory] = await Promise.all([
    readJson(`${DATA}/auto-resolved.json`),
    readJson(`${DATA}/backlinks-applied.json`),
    readJson(`${DATA}/proposals-applied.json`),
    readJson(`${DATA}/knowledge-sync.json`),
    readJson(`${DATA}/lead-drafts.json`),
    readJson(`${DATA}/state-diff.json`),
    readJson(`${DATA}/secret-scan.json`),
    readJson(`${DATA}/eva-triage.json`),
    readJson(`${DATA}/memory-applied.json`),
  ]);

  let benchLast = {};
  try {
    const lines = (await readFile(`${DATA}/llama-bench.jsonl`, "utf8")).trim().split("\n").filter(Boolean);
    benchLast = JSON.parse(lines[lines.length - 1] ?? "{}");
  } catch { /* optional */ }

  const candidates = [
    { source: "auto-resolve", at: resolved?.generated_at, count: resolved?.summary?.total ?? 0, detail: "itens informativos resolvidos" },
    { source: "backlinks", at: backlinks?.applied_at, count: backlinks?.count ?? 0, detail: "backlinks aplicadas" },
    { source: "hygiene", at: proposals?.applied_at, count: proposals?.count ?? 0, detail: "propostas de higiene aplicadas" },
    { source: "knowledge-sync", at: sync?.generated_at, count: sync?.embedded ?? 0, detail: "embeddings gerados" },
    { source: "lead-drafts", at: drafts?.generated_at, count: drafts?.count ?? 0, detail: "rascunhos de lead" },
    { source: "state-diff", at: diff?.generated_at, count: (diff?.nodes_added?.length ?? 0) + (diff?.nodes_changed?.length ?? 0), detail: "alterações no grafo" },
    { source: "secret-scan", at: secrets?.generated_at, count: secrets?.count ?? 0, detail: "achados de segredo" },
    { source: "eva-triage", at: triage?.generated_at, count: triage?.summary?.total ?? 0, detail: "itens triados" },
    { source: "memory", at: memory?.generated_at, count: memory?.count ?? 0, detail: "linhas de MEMORY.md aprovadas" },
  ].filter((a) => a.at);

  let existingLog = "";
  try { existingLog = await readFile(LOG, "utf8"); } catch { /* first run */ }
  const known = new Set(
    existingLog.split("\n").filter(Boolean).map((line) => {
      try { const e = JSON.parse(line); return `${e.source}:${e.at}`; } catch { return ""; }
    })
  );
  const fresh = candidates.filter((a) => !known.has(`${a.source}:${a.at}`));
  const lines = [
    ...existingLog.split("\n").filter(Boolean),
    ...fresh.map((a) => JSON.stringify({ ...a, logged_at: new Date().toISOString() })),
  ].slice(-200);
  const recent = lines.slice(-10).map((line) => JSON.parse(line));

  const totalActions = fresh.reduce((sum, a) => sum + a.count, 0);
  const prompt = clamp(
    `KAREN — eu mesma: ${recent.length} ações registradas; nas últimas execuções ${totalActions} itens tratados. ` +
      `Resolvi ${resolved?.summary?.total ?? 0} itens informativos, apliquei ${backlinks?.count ?? 0} backlinks e ` +
      `${proposals?.count ?? 0} propostas, redigi ${drafts?.count ?? 0} mensagens. ` +
      `Modelo ${benchLast.label ?? "local"}, RSS ~${Math.round((benchLast.median_rss_kb ?? 0) / 1024)} MiB.`,
    750
  );
  const selfModel = {
    generated_at: new Date().toISOString(),
    prompt,
    last_24h: {
      resolved: resolved?.summary?.total ?? 0,
      backlinks: backlinks?.count ?? 0,
      hygiene: proposals?.count ?? 0,
      drafts: drafts?.count ?? 0,
      graph_changes: (diff?.nodes_added?.length ?? 0) + (diff?.nodes_changed?.length ?? 0),
      triage: triage?.summary ?? null,
    },
    limits: {
      model: benchLast.label ?? null,
      context: 8192,
      gen_tps: benchLast.median_gen_tps ?? null,
      rss_mib: benchLast.median_rss_kb ? Math.round(benchLast.median_rss_kb / 1024) : null,
    },
    recent_actions: recent,
    note: "Dados determinísticos. Cite apenas estes números quando falar de si.",
  };
  const idx = await noteIndex();

  if (DRY) {
    console.log(JSON.stringify({ selfModel, idx, fresh }, null, 2));
    return;
  }
  await writeAtomic(SELF, `${JSON.stringify(selfModel, null, 2)}\n`);
  await writeAtomic(INDEX, `${JSON.stringify(idx, null, 2)}\n`);
  await writeAtomic(LOG, `${lines.join("\n")}\n`);
  console.log(`[self-model] ${fresh.length} ação(ões) nova(s) no log · ${idx.total} notas indexadas`);
}

main().catch((err) => { console.error(err); process.exit(1); });
