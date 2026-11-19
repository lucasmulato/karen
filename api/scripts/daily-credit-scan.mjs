#!/usr/bin/env node
/**
 * Daily, read-only credit/opportunity scan.
 *
 * Reads the private registry, re-checks only the official URLs already listed
 * there, ranks the recorded priorities against KAREN's static needs profile,
 * and writes a machine-readable report. It NEVER creates accounts, logs in,
 * fills forms, bypasses CAPTCHAs, spends money or stores credentials.
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const REGISTRY = resolve(
  process.env.KAREN_CREDIT_REGISTRY || "/home/admin/models/ai_credits_registry.md"
);
const LAST_REPORT = resolve(
  process.env.KAREN_LAST_REPORT || "/home/admin/models/routine_last_report.md"
);
const OUTPUT = resolve(
  process.env.KAREN_CREDIT_JSON || "/home/admin/karen/api/data/credit-recommendations.json"
);
const NEEDS_FILE = resolve(
  process.env.KAREN_NEEDS_FILE || "/home/admin/karen/api/config/karen-needs.json"
);

const now = new Date();
const generatedAt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
}).format(now);
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(now);

const CLOSED_SIGNALS = [
  "applications are closed",
  "application is closed",
  "current cohort is now full",
  "not currently accepting",
  "inscrições fechadas",
];
const OPEN_SIGNALS = [
  "apply now",
  "applications are open",
  "now accepting applications",
  "inscrições abertas",
];

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function parsePriorities(text) {
  const start = text.indexOf("## Prioridades consolidadas");
  if (start === -1) return [];
  const rest = text.slice(start);
  const end = rest.indexOf("\n## ", 5);
  const section = end === -1 ? rest : rest.slice(0, end);
  return section
    .split("\n")
    .map((line) => line.match(/^\s*\d+\.\s+(.+?)\s*$/)?.[1])
    .filter(Boolean)
    .slice(0, 12);
}

function parseUrls(text) {
  const urls = new Set();
  for (const match of text.matchAll(/URL:\s*(https?:\/\/[^\s)]+)/g)) {
    urls.add(match[1].replace(/[.,]$/, ""));
  }
  return [...urls].slice(0, 60);
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "KAREN-Credit-Scan/1.0 (read-only)" },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    const body = (await res.text()).slice(0, 200_000).toLowerCase();
    const closed = CLOSED_SIGNALS.filter((s) => body.includes(s));
    const open = OPEN_SIGNALS.filter((s) => body.includes(s));
    return {
      url,
      httpStatus: res.status,
      reachable: res.ok,
      signals: { closed, open },
    };
  } catch (err) {
    return { url, httpStatus: null, reachable: false, error: err.message, signals: {} };
  }
}

function scorePriorities(priorities, needs) {
  return priorities.map((title, index) => {
    const lower = title.toLowerCase();
    const matched = needs
      .map((need) => ({
        need: need.id,
        weight: need.weight,
        hits: need.keywords.filter((k) => lower.includes(k.toLowerCase())).length,
      }))
      .filter((m) => m.hits > 0);
    const score = matched.reduce((sum, m) => sum + m.weight * m.hits, 0);
    return {
      rank: index + 1,
      title,
      score,
      needs: matched.map((m) => m.need),
    };
  }).sort((a, b) => b.score - a.score || a.rank - b.rank);
}

async function main() {
  if (!(await exists(REGISTRY))) throw new Error(`Registry not found: ${REGISTRY}`);
  const [registry, needs] = await Promise.all([
    readFile(REGISTRY, "utf8"),
    readFile(NEEDS_FILE, "utf8").then(JSON.parse),
  ]);

  const priorities = parsePriorities(registry);
  const urls = parseUrls(registry);
  const sourceChecks = [];
  for (let i = 0; i < urls.length; i += 6) {
    const batch = await Promise.all(urls.slice(i, i + 6).map(checkUrl));
    sourceChecks.push(...batch);
  }

  let previous = null;
  if (await exists(OUTPUT)) {
    try { previous = JSON.parse(await readFile(OUTPUT, "utf8")); } catch { /* ignore */ }
  }
  const previousUrls = new Map(
    (previous?.sourceChecks ?? []).map((c) => [c.url, c.httpStatus])
  );
  const changes = sourceChecks
    .filter((c) => previousUrls.has(c.url) && previousUrls.get(c.url) !== c.httpStatus)
    .map((c) => ({
      url: c.url,
      from: previousUrls.get(c.url),
      to: c.httpStatus,
    }));

  const ranked = scorePriorities(priorities, needs.needs);
  const report = {
    generated_at: generatedAt,
    date: today,
    timezone: "America/Sao_Paulo",
    mode: "recommendation_only",
    needs_profile: needs.needs.map((n) => ({ id: n.id, weight: n.weight, gap: n.gap })),
    priorities: ranked,
    source_checks: sourceChecks,
    changes,
    human_action_required: true,
    hard_limits: needs.hard_limits,
    disclaimer:
      "Public sources only. No accounts, logins, forms, CAPTCHA, spending or stored credentials. Confirm every offer in the official channel before acting.",
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2), "utf8");

  const lines = [
    "",
    `## Rodada ${today} — ${generatedAt}`,
    "",
    `- Prioridades ranqueadas: ${ranked.length}`,
    `- Fontes oficiais verificadas: ${sourceChecks.length} (acessíveis: ${sourceChecks.filter((c) => c.reachable).length})`,
    `- Mudanças desde a última rodada: ${changes.length}`,
    "",
    "Top 3:",
    ...ranked.slice(0, 3).map((p, i) => `  ${i + 1}. ${p.title} (score ${p.score})`),
    "",
    "Ação humana necessária: confirmar cada oferta no canal oficial antes de qualquer inscrição.",
    "",
  ];
  const prior = (await exists(LAST_REPORT)) ? await readFile(LAST_REPORT, "utf8") : "# Último relatório KAREN\n";
  await writeFile(LAST_REPORT, prior.trimEnd() + "\n" + lines.join("\n"), "utf8");

  console.log(`Credit scan ${today}: ${ranked.length} priorities, ${sourceChecks.length} sources, ${changes.length} changes.`);
  console.log(`Report: ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
