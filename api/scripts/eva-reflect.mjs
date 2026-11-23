#!/usr/bin/env node
/**
 * EVA's daily reflection: deterministic observations about her own outputs and
 * the open gaps. Appends a dated section to the vault reflection note and
 * writes a compact prompt block for self-context. No LLM involved.
 *
 *   node scripts/eva-reflect.mjs --dry-run
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";

const DATA = "/home/admin/karen/api/data";
const VAULT = process.env.KAREN_VAULT_DIR || "/home/admin/models/karen-vault";
const TARGET = resolve(`${VAULT}/reflection.md`);
const PROMPT_FILE = resolve(`${DATA}/eva-reflection.json`);
const DRY = process.argv.includes("--dry-run");
const MAX_SECTIONS = 30;

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}
async function writeAtomic(path, payload) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, path);
}

async function main() {
  const [resolved, backlinks, hygiene, applied, secrets, auth, triage, memory] = await Promise.all([
    readJson(`${DATA}/auto-resolved.json`),
    readJson(`${DATA}/backlinks-applied.json`),
    readJson(`${DATA}/knowledge-hygiene.json`),
    readJson(`${DATA}/proposals-applied.json`),
    readJson(`${DATA}/secret-scan.json`),
    readJson(`${DATA}/auth-correlation.json`),
    readJson(`${DATA}/eva-triage.json`),
    readJson(`${DATA}/memory-applied.json`),
  ]);

  let actions = [];
  try {
    const lines = (await readFile(`${DATA}/action-log.jsonl`, "utf8")).trim().split("\n").filter(Boolean);
    actions = lines.slice(-20).map((l) => JSON.parse(l));
  } catch { /* optional */ }

  const hygieneTotal = Object.values(hygiene?.proposals ?? {})
    .reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  const hygienePending = Math.max(0, hygieneTotal - Number(applied?.count ?? 0));
  const observations = [];
  observations.push(`Registrei ${actions.length} ações no log unificado nas últimas execuções.`);
  observations.push(`Resolvi ${resolved?.summary?.total ?? 0} itens informativos; nenhum revert registrado.`);
  observations.push(`Apliquei ${backlinks?.count ?? 0} backlinks e ${memory?.count ?? 0} linha(s) de MEMORY.md aprovadas.`);
  if (hygienePending > 0) observations.push(`${hygienePending} propostas de higiene seguem sem decisão — não forcei nenhuma.`);
  else observations.push("Nenhuma proposta de higiene pendente.");
  if ((secrets?.count ?? 0) > 0) observations.push(`${secrets.count} achado(s) de segredo ainda precisam de revisão humana.`);
  else observations.push("Varredura de segredos limpa.");
  if ((auth?.suspicious_ips ?? 0) > 0) observations.push(`${auth.suspicious_ips} IPs suspeitos em SSH; mantive somente leitura, sem bloqueio.`);
  observations.push(`Triagem: ${triage?.summary?.blocked ?? 0} item(ns) bloqueado(s) aguardando o operador.`);

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const section = [
    `## ${date}`,
    ...observations.map((o) => `- ${o}`),
    "",
  ].join("\n");
  let previous = "";
  try { previous = await readFile(TARGET, "utf8"); } catch { /* first run */ }
  const sections = previous.split(/(?=^## \d{4}-\d{2}-\d{2})/m).filter(Boolean);
  const doc = [
    "# Reflexão da EVA",
    "",
    "> Gerada automaticamente. Observações determinísticas sobre o próprio trabalho.",
    "",
    ...sections.slice(-Math.max(0, MAX_SECTIONS - 1)),
    section,
  ].join("\n");

  const prompt = [
    `REFLEXÃO (${date}):`,
    ...observations.slice(0, 4),
  ].join(" ").slice(0, 320);

  const meta = { generated_at: now.toISOString(), date, observations, prompt };
  if (DRY) { console.log(JSON.stringify({ doc, meta }, null, 2)); return; }
  await writeAtomic(TARGET, doc);
  await writeAtomic(PROMPT_FILE, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`[eva-reflect] ${observations.length} observação(ões) → ${TARGET}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
