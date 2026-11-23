#!/usr/bin/env node
/**
 * Generates a living self-description for KAREN from deterministic sources:
 * persona, persistent memory, recent decisions and the self-model. Writes a
 * vault note (ABOUT.md) and a compact prompt block used in chat.
 *
 *   node scripts/about-sync.mjs --dry-run
 */
import { readFile, readdir, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";

const DATA = "/home/admin/karen/api/data";
const VAULT = process.env.KAREN_VAULT_DIR || "/home/admin/models/karen-vault";
const PERSONA = "/home/admin/karen/api/prompts/karen.md";
const TARGET = resolve(`${VAULT}/ABOUT.md`);
const PROMPT_FILE = resolve(`${DATA}/about-self.json`);
const DRY = process.argv.includes("--dry-run");

async function readText(path) {
  try { return await readFile(path, "utf8"); } catch { return ""; }
}
async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}
async function writeAtomic(path, payload) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, path);
}
function bullets(text, max = 4) {
  return text.split("\n").filter((l) => /^[-*]\s+\S/.test(l)).slice(0, max).map((l) => l.trim());
}
function firstLines(text, max = 6) {
  return text.split("\n").filter((l) => l.trim() && !l.startsWith("#")).slice(0, max).map((l) => l.trim());
}

async function main() {
  const [persona, memory, selfModel] = await Promise.all([
    readText(PERSONA),
    readText(resolve(`${VAULT}/MEMORY.md`)),
    readJson(`${DATA}/self-model.json`),
  ]);
  const decisions = (await readdir(resolve(`${VAULT}/decisions`)).catch(() => []))
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse()
    .slice(0, 3);

  const identity = firstLines(persona, 5);
  const values = bullets(memory, 4);
  const recent = selfModel?.last_24h ?? {};
  const now = new Date();

  const doc = [
    "# Sobre a KAREN",
    "",
    "> Descrição viva, gerada automaticamente a partir da persona, da memória",
    "> persistente, das decisões recentes e do self-model. Não editar à mão.",
    `> Gerado em: ${now.toISOString()}`,
    "",
    "## Identidade",
    ...(identity.length ? identity.map((l) => `- ${l.replace(/^[-*]\s*/, "")}`) : ["- Assistente local KAREN."]),
    "",
    "## Memória persistente (MEMORY.md)",
    ...(values.length ? values : ["- Ainda sem fatos duráveis registrados."]),
    "",
    "## Decisões recentes",
    ...(decisions.length ? decisions.map((d) => `- ${d.replace(/\.md$/i, "")}`) : ["- Nenhuma decisão registrada."]),
    "",
    "## O que eu fiz nas últimas 24h",
    `- ${recent.resolved ?? 0} itens informativos resolvidos`,
    `- ${recent.backlinks ?? 0} backlinks aplicados`,
    `- ${recent.hygiene ?? 0} propostas de higiene aplicadas`,
    `- ${recent.drafts ?? 0} rascunhos de mensagem preparados`,
    "",
    "## Limites que me definem",
    "- Não envio mensagens, não crio contas, não pago nada sem aprovação explícita.",
    "- Escrita no vault exige pedido direto do operador.",
    "- Fatores determinísticos vêm de ferramentas; eu apenas os narro.",
  ].join("\n");

  const prompt = [
    "SOBRE MIM: sou KAREN, assistente local de segurança e segundo cérebro.",
    "Não envio mensagens, não crio contas, não pago nada sem aprovação.",
    `Memória: ${values.map((v) => v.replace(/^[-*]\s*/, "")).join(" ")}`.slice(0, 180),
    `Decisões recentes: ${decisions.map((d) => d.replace(/\.md$/i, "")).join("; ")}`.slice(0, 140),
  ].filter(Boolean).join(" ").slice(0, 400);

  const meta = { generated_at: now.toISOString(), prompt };
  if (DRY) { console.log(JSON.stringify({ doc, meta }, null, 2)); return; }
  await writeAtomic(TARGET, `${doc}\n`);
  await writeAtomic(PROMPT_FILE, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`[about-sync] ABOUT.md gerado · ${decisions.length} decisões · prompt ${prompt.length} chars`);
}

main().catch((err) => { console.error(err); process.exit(1); });
