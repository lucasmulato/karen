#!/usr/bin/env node
/**
 * Daily local secret scan. Reports file + line + pattern name only — no values,
 * no paths outside the allowed roots, no network calls.
 *
 *   node scripts/secret-scan.mjs --dry-run
 */
import { readdir, readFile, writeFile, rename } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { findSecrets } from "./lib/secret-scan.mjs";

const REPORT = resolve("/home/admin/karen/api/data/secret-scan.json");
const ROOTS = [
  // tests/ contains deliberate fake tokens for the scanner's own unit tests.
  { path: "/home/admin/karen", skip: ["node_modules", ".git", "build", "dist", "data", "tests"] },
  { path: "/home/admin/models/karen-vault", skip: [".git"] },
];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".sh", ".sql", ".env", ".example"]);
const MAX_BYTES = 2_000_000;
const DRY = process.argv.includes("--dry-run");

async function walk(dir, skip, base, out) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skip.includes(entry.name) || entry.name.startsWith(".")) continue;
      await walk(full, skip, base, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf(".");
    const ext = dot >= 0 ? entry.name.slice(dot).toLowerCase() : "";
    if (!EXTENSIONS.has(entry.name) && !EXTENSIONS.has(ext)) continue;
    out.push({ full, rel: relative(base, full) });
  }
}

async function main() {
  const findings = [];
  let scanned = 0;
  for (const root of ROOTS) {
    const files = [];
    await walk(root.path, root.skip, root.path, files);
    for (const file of files) {
      try {
        const info = await readFile(file.full, "utf8");
        if (info.length > MAX_BYTES) continue;
        scanned++;
        findings.push(...findSecrets(info, file.rel));
      } catch { /* unreadable file — skip */ }
    }
  }
  const report = {
    generated_at: new Date().toISOString(),
    roots: ROOTS.map((r) => r.path),
    files_scanned: scanned,
    count: findings.length,
    findings,
  };
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  if (DRY) { console.log(payload); return; }
  const tmp = `${REPORT}.tmp`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, REPORT);
  console.log(`[secret-scan] ${scanned} arquivos, ${findings.length} achado(s) → ${REPORT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
