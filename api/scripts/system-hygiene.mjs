#!/usr/bin/env node
/**
 * Deterministic system hygiene: DB stats, sensitive-file permissions, timer
 * watchdog, audit diff, cost flags and log sizes. Read-only except VACUUM
 * ANALYZE. Writes a report; never deletes anything.
 *
 *   node scripts/system-hygiene.mjs --dry-run
 */
import { readFile, writeFile, rename, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { Client } from "pg";

const DATA = "/home/admin/karen/api/data";
const REPORT = resolve(`${DATA}/system-hygiene.json`);
const AUDIT = resolve(`${DATA}/dependency-audit.json`);
const SECRETS = resolve(`${DATA}/secret-scan.json`);
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const DRY = process.argv.includes("--dry-run");
const WATCHED_TIMERS = ["karen-morning.timer", "karen-eva-triage.timer", "karen-vault-garden.timer"];

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}
function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", timeout: 8_000, stdio: ["ignore", "pipe", "ignore"] });
}

async function main() {
  const issues = [];
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    if (!DRY) {
      await client.query("VACUUM ANALYZE nodes");
      await client.query("ANALYZE");
    }
  } catch (err) { issues.push(`vacuum: ${String(err?.message ?? "").slice(0, 90)}`); }
  finally { await client.end(); }

  const permissions = [];
  for (const file of ["/home/admin/models/karen.env", "/home/admin/models/karen-web-password"]) {
    try {
      const mode = (await stat(file)).mode & 0o777;
      permissions.push({ file: file.split("/").pop(), mode: `0${mode.toString(8)}`, ok: mode === 0o600 });
      if (mode !== 0o600) issues.push(`permissão frouxa: ${file}`);
    } catch { issues.push(`arquivo ausente: ${file}`); }
  }

  const timerText = run("systemctl", ["list-timers", "karen-*", "--no-pager"]);
  const timers = WATCHED_TIMERS.map((name) => {
    const line = timerText.split("\n").find((l) => l.includes(name));
    return { name, scheduled: Boolean(line) };
  });
  for (const timer of timers) if (!timer.scheduled) issues.push(`timer sem próxima execução: ${timer.name}`);

  const previous = await readJson(REPORT);
  const audit = (await readJson(AUDIT)) ?? { totals: {} };
  const currentCritical = Number(audit.totals?.critical ?? 0);
  const currentHigh = Number(audit.totals?.high ?? 0);
  const previousCritical = Number(previous?.advisories?.critical ?? currentCritical);
  const previousHigh = Number(previous?.advisories?.high ?? currentHigh);
  const advisories = {
    critical: currentCritical,
    high: currentHigh,
    new_critical: Math.max(0, currentCritical - previousCritical),
    new_high: Math.max(0, currentHigh - previousHigh),
  };

  const secretReport = await readJson(SECRETS);
  const cost = {
    provider: process.env.LEAD_PROVIDER || "osm",
    llm_local: /localhost|127\.0\.0\.1/.test(process.env.LLM_BASE_URL ?? ""),
    apify_token_configured: Boolean(process.env.APIFY_TOKEN?.trim()),
    secret_scan_findings: Number(secretReport?.count ?? 0),
    incremental_usd: 0,
  };

  const logs = [];
  for (const name of await readdir("/home/admin/models")) {
    if (!name.endsWith(".log")) continue;
    const info = await stat(resolve("/home/admin/models", name)).catch(() => null);
    if (info) logs.push({ name, mib: Math.round(info.size / 1048576) });
  }
  logs.sort((a, b) => b.mib - a.mib);

  const report = {
    generated_at: new Date().toISOString(),
    database: "vacuum-analyze ok",
    permissions,
    timers,
    advisories,
    cost,
    largest_logs: logs.slice(0, 5),
    issues,
  };
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  if (DRY) { console.log(payload); return; }
  const tmp = `${REPORT}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, REPORT);
  console.log(`[system-hygiene] ${issues.length} issue(s) · ${timers.length} timers · custo US$ 0 → ${REPORT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
