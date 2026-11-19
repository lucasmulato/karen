#!/usr/bin/env node
/**
 * Weekly dependency audit for api/ and ui/. Writes a machine-readable report
 * and a single action item consumed by send-alert.mjs when high/critical
 * advisories exist. Never auto-updates dependencies.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const run = promisify(execFile);
const ROOT = resolve("/home/admin/karen");
const REPORT = resolve("/home/admin/karen/api/data/dependency-audit.json");
const ACTIONS = resolve("/home/admin/karen/api/data/action-items.json");

function countVulns(report) {
  const counts = { critical: 0, high: 0, moderate: 0, low: 0, total: 0 };
  for (const v of Object.values(report.vulnerabilities ?? {})) {
    counts[v.severity] = (counts[v.severity] ?? 0) + 1;
    counts.total++;
  }
  return counts;
}

async function audit(folder) {
  try {
    const { stdout } = await run("npm", ["audit", "--json"], {
      cwd: resolve(ROOT, folder),
      maxBuffer: 20 * 1024 * 1024,
    });
    const json = JSON.parse(stdout);
    return { folder, ...countVulns(json) };
  } catch (err) {
    const stdout = err.stdout || "";
    try {
      const json = JSON.parse(stdout);
      return { folder, ...countVulns(json) };
    } catch {
      return { folder, error: err.message, total: 0, critical: 0, high: 0 };
    }
  }
}

async function main() {
  const results = await Promise.all([audit("api"), audit("ui")]);
  const report = {
    generated_at: new Date().toISOString(),
    results,
    totals: results.reduce(
      (acc, r) => ({
        total: acc.total + (r.total ?? 0),
        critical: acc.critical + (r.critical ?? 0),
        high: acc.high + (r.high ?? 0),
        moderate: acc.moderate + (r.moderate ?? 0),
        low: acc.low + (r.low ?? 0),
      }),
      { total: 0, critical: 0, high: 0, moderate: 0, low: 0 }
    ),
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");

  let actions = [];
  try { actions = JSON.parse(await readFile(ACTIONS, "utf8")); } catch { /* ignore */ }
  actions = actions.filter((a) => a.topic !== "dependency-audit");
  if (report.totals.critical > 0 || report.totals.high > 0) {
    actions.push({
      topic: "dependency-audit",
      title: `${report.totals.critical} critical / ${report.totals.high} high vulnerabilidades em dependências`,
      steps: [
        "Revisar api/data/dependency-audit.json.",
        "Rodar npm audit fix --dry-run em api/ e ui/ antes de aplicar qualquer mudança.",
        "Atualizar apenas pacotes compatíveis e rodar builds + testes.",
      ],
    });
  }
  await writeFile(ACTIONS, JSON.stringify(actions, null, 2), "utf8");
  console.log(
    `Dependency audit: total=${report.totals.total} critical=${report.totals.critical} high=${report.totals.high}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
