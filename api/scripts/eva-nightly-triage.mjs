#!/usr/bin/env node
/**
 * EVA nightly triage — deterministic collector + one batched local LLM call.
 *
 * Reads pending approvals, action items and fresh inbox notes, classifies each
 * as auto / propose / blocked and writes a read-only side file consumed by the
 * queue and digests. The model never executes anything; deterministic rules
 * force high-risk items to a human gate. No secrets, tokens or raw env values
 * are ever sent to the model or written to the output.
 *
 *   node scripts/eva-nightly-triage.mjs              # classify + write
 *   node scripts/eva-nightly-triage.mjs --dry-run    # classify + print only
 *   node scripts/eva-nightly-triage.mjs --offline    # deterministic only, no LLM
 */
import { readFile, writeFile, rename, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import {
  MAX_ITEMS,
  buildPrompt,
  mergeClassifications,
  parseModelOutput,
  sanitizeText,
  summarize,
} from "./lib/eva-triage.mjs";

const DATA = "/home/admin/karen/api/data";
const VAULT = process.env.KAREN_VAULT_DIR || "/home/admin/models/karen-vault";
const TRIAGE = resolve(process.env.KAREN_TRIAGE_JSON || `${DATA}/eva-triage.json`);
const PERSONA = resolve("/home/admin/karen/api/prompts/eva.md");
const ACTIONS = resolve(`${DATA}/action-items.json`);
const ENV_FILE = resolve(process.env.KAREN_ENV_FILE || "/home/admin/models/karen.env");
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const OPTIONAL_KEYS = ["APIFY_TOKEN", "CLOUDFLARE_API_TOKEN", "NVD_API_KEY"];

const DRY = process.argv.includes("--dry-run");
const OFFLINE = process.argv.includes("--offline");

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

/** Pending command approvals — IDs and metadata only, never tokens or args. */
async function pendingCommands() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query(
      `SELECT id, command_id, risk, source, created_at
         FROM command_runs WHERE status = 'pending'
        ORDER BY created_at ASC LIMIT 20`
    );
    return res.rows.map((row) => ({
      id: `command:${row.id}`,
      source: "command",
      risk: row.risk,
      title: `Aprovar: ${row.command_id}`,
      detail: `Comando ${row.risk} solicitado por ${row.source}.`,
      route: "/app/?pane=commands",
    }));
  } catch {
    return [];
  } finally {
    await client.end();
  }
}

async function actionItems() {
  const actions = (await readJson(ACTIONS)) ?? [];
  return (Array.isArray(actions) ? actions : []).map((action) => {
    const topic = String(action.topic ?? "action");
    return {
      id: `action:${topic}`,
      source: "action",
      title: String(action.title ?? topic),
      detail: Array.isArray(action.steps) ? String(action.steps[0] ?? "") : "",
      route: "/app/?pane=commands",
    };
  });
}

/** Notes created/modified in the last 48h that still sit in the inbox. */
async function freshInboxNotes() {
  const dir = resolve(`${VAULT}/00 Inbox`);
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const out = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    try {
      const path = resolve(dir, entry.name);
      const info = await stat(path);
      if (info.mtimeMs < cutoff) continue;
      const body = await readFile(path, "utf8");
      const heading = body.split("\n").find((line) => /^#\s+\S/.test(line));
      const title = (heading ?? entry.name).replace(/^#\s*/, "");
      out.push({
        id: `note:${entry.name}`,
        source: "note",
        title,
        detail: "Nota nova na caixa de entrada, ainda sem arquivamento.",
        route: "/app/?pane=mapa",
      });
    } catch { /* skip unreadable note */ }
  }
  return out;
}

async function missingKeys() {
  let envText = "";
  try { envText = await readFile(ENV_FILE, "utf8"); } catch { /* ignore */ }
  return OPTIONAL_KEYS.filter((name) => {
    if (Boolean(process.env[name]?.trim())) return false;
    return !new RegExp(`^${name}=(.+)$`, "m").test(envText);
  }).map((name) => ({
    id: `key:${name}`,
    source: "key",
    title: `Chave opcional não configurada: ${name}`,
    detail: "Configuração opcional — sem impacto no uso básico.",
  }));
}

function sanitizeItem(item) {
  return {
    ...item,
    title: sanitizeText(item.title, 160),
    detail: sanitizeText(item.detail, 200),
  };
}

async function classify(items, persona) {
  const baseUrl = process.env.LLM_BASE_URL ?? "http://127.0.0.1:8080/v1";
  const apiKey = process.env.LLM_API_KEY || "local";
  const model = process.env.LLM_MODEL ?? "karen";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: persona },
        { role: "user", content: buildPrompt(items) },
      ],
      temperature: 0,
      max_tokens: 700,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function writeAtomic(path, payload) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, path);
}

async function main() {
  const [commands, actions, notes, keys, persona] = await Promise.all([
    pendingCommands(),
    actionItems(),
    freshInboxNotes(),
    missingKeys(),
    readFile(PERSONA, "utf8").catch(() => ""),
  ]);

  // Commands first: the human gate is the most important item in the digest.
  const collected = [...commands, ...actions, ...notes, ...keys]
    .map(sanitizeItem)
    .slice(0, MAX_ITEMS);

  let llmError = null;
  let classifications = [];
  if (!OFFLINE && collected.length) {
    try {
      classifications = parseModelOutput(await classify(collected, persona));
    } catch (err) {
      llmError = sanitizeText(err?.message ?? "LLM indisponível", 200);
      console.error(`[eva-triage] classificação indisponível: ${llmError}`);
    }
  }

  const items = mergeClassifications(collected, classifications);
  const now = new Date();
  const output = {
    generated_at: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    model: OFFLINE ? null : (process.env.LLM_MODEL ?? "karen"),
    offline: OFFLINE,
    llm_error: llmError,
    summary: summarize(items),
    items,
  };

  const payload = `${JSON.stringify(output, null, 2)}\n`;
  if (DRY || OFFLINE) {
    console.log(payload);
    return;
  }
  await writeAtomic(TRIAGE, payload);
  console.log(
    `[eva-triage] ${output.summary.total} itens: ` +
      `${output.summary.auto} auto · ${output.summary.propose} propose · ` +
      `${output.summary.blocked} blocked → ${TRIAGE}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
