#!/usr/bin/env node
/**
 * Small reproducible benchmark for the local llama.cpp server.
 *
 * One warm-up call, then N identical calls with a fixed prompt. Records prompt
 * eval and generation speed from llama.cpp's own `timings` object plus the
 * server RSS, so config changes can be compared instead of guessed.
 *
 *   node scripts/llama-bench.mjs --label baseline
 *   node scripts/llama-bench.mjs --label tuned --repeat 5
 */
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";

const BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:8080/v1";
const MODEL = process.env.LLM_MODEL || "karen";
const API_KEY = process.env.LLM_API_KEY || "local";
const OUT = resolve("/home/admin/karen/api/data/llama-bench.jsonl");

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const LABEL = flag("label", "run");
const REPEAT = Math.max(1, Number(flag("repeat", "3")));

// Deterministic, stable prompt: persona-like system + ~450 tokens of context.
const SYSTEM =
  "Você é KAREN, assistente local de segurança e segundo cérebro. " +
  "Responda em português brasileiro, de forma curta e concreta. " +
  "Use apenas contexto recuperado, sem inventar dados.";
const BLOCK =
  "Contexto recuperado: OWASP Top 10, MITRE ATT&CK, CAPEC, PayloadsAllTheThings. " +
  "Notas do vault, grafo PostgreSQL, lead qualificados via OSM, decisões registradas. ";
const USER = `${BLOCK.repeat(8)}\nPergunta: qual é a próxima ação segura? Responda em uma frase.`;

function serverPid() {
  try {
    const out = execFileSync("pgrep", ["-f", "llama-server.*karen"], {
      encoding: "utf8",
    }).trim();
    return out.split("\n")[0] || null;
  } catch { return null; }
}

function rssKb() {
  const pid = serverPid();
  if (!pid) return null;
  try {
    const status = execFileSync("cat", [`/proc/${pid}/status`], { encoding: "utf8" });
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
    return match ? Number(match[1]) : null;
  } catch { return null; }
}

async function call() {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: USER },
      ],
      temperature: 0,
      max_tokens: 64,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const t = data.timings ?? {};
  return {
    wall_ms: Date.now() - started,
    prompt_tokens: t.prompt_n ?? data.usage?.prompt_tokens ?? 0,
    generated_tokens: t.predicted_n ?? data.usage?.completion_tokens ?? 0,
    prompt_tps: t.prompt_per_second ?? 0,
    gen_tps: t.predicted_per_second ?? 0,
    cached_tokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  // Warm-up: load weights and compute buffers so RSS is comparable per config.
  await call();
  const rssBefore = rssKb();
  const runs = [];
  for (let i = 0; i < REPEAT; i++) {
    const result = await call();
    const rss = rssKb();
    runs.push({ ...result, rss_kb: rss });
    console.log(
      `[${LABEL}] ${i + 1}/${REPEAT} prompt ${result.prompt_tps.toFixed(2)} tok/s · ` +
        `gen ${result.gen_tps.toFixed(2)} tok/s · RSS ${rss ? (rss / 1024).toFixed(0) : "?"} MiB`
    );
  }
  const record = {
    at: new Date().toISOString(),
    label: LABEL,
    base_url: BASE_URL,
    model: MODEL,
    repeat: REPEAT,
    rss_before_kb: rssBefore,
    median_prompt_tps: median(runs.map((r) => r.prompt_tps)),
    median_gen_tps: median(runs.map((r) => r.gen_tps)),
    median_rss_kb: median(runs.map((r) => r.rss_kb).filter(Boolean)),
    runs,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await appendFile(OUT, `${JSON.stringify(record)}\n`, "utf8");
  console.log(
    `[${LABEL}] MEDIAN prompt ${record.median_prompt_tps.toFixed(2)} tok/s · ` +
      `gen ${record.median_gen_tps.toFixed(2)} tok/s · RSS ${(record.median_rss_kb / 1024).toFixed(0)} MiB`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
