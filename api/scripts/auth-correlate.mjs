#!/usr/bin/env node
/**
 * Read-only correlation of SSH failures from the systemd journal. Reports IPs
 * and windows with repeated failures; it does NOT block or change firewall.
 *
 *   node scripts/auth-correlate.mjs --dry-run
 */
import { writeFile, rename } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const REPORT = resolve("/home/admin/karen/api/data/auth-correlation.json");
const DRY = process.argv.includes("--dry-run");
const THRESHOLD = 10;

function journal() {
  try {
    return execFileSync("journalctl", ["-u", "sshd", "--since", "24 hours ago", "--no-pager"], {
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 20_000_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch { return ""; }
}

async function main() {
  const lines = journal().split("\n").filter((l) => /Failed password|Invalid user/.test(l));
  const byIp = new Map();
  let invalidUsers = 0;
  for (const line of lines) {
    if (/Invalid user/.test(line)) invalidUsers++;
    const ip = line.match(/from\s+(\d{1,3}(?:\.\d{1,3}){3})/)?.[1];
    if (!ip) continue;
    const entry = byIp.get(ip) ?? { ip, failures: 0, first: line.slice(0, 15), last: line.slice(0, 15) };
    entry.failures++;
    entry.last = line.slice(0, 15);
    byIp.set(ip, entry);
  }
  const suspicious = [...byIp.values()]
    .filter((e) => e.failures >= THRESHOLD)
    .sort((a, b) => b.failures - a.failures)
    .slice(0, 15);
  const report = {
    generated_at: new Date().toISOString(),
    window: "24 hours",
    threshold: THRESHOLD,
    total_failures: lines.length,
    invalid_user_attempts: invalidUsers,
    distinct_ips: byIp.size,
    suspicious_ips: suspicious,
    action: "read-only — nenhum bloqueio aplicado",
  };
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  if (DRY) { console.log(payload); return; }
  const tmp = `${REPORT}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, REPORT);
  console.log(`[auth-correlate] ${lines.length} falhas · ${byIp.size} IPs · ${suspicious.length} suspeitos → ${REPORT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
