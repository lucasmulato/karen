#!/usr/bin/env node
/**
 * Monthly OS update check. Read-only: lists pending pacman upgrades and raises
 * an e-mail action item. Never upgrades the system automatically.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const run = promisify(execFile);
const ACTIONS = "/home/admin/karen/api/data/action-items.json";
const REPORT = "/home/admin/karen/api/data/os-updates.json";

async function main() {
  let packages = [];
  let error = null;
  try {
    const { stdout } = await run("pacman", ["-Qu"], { env: { ...process.env, LANG: "C" } });
    packages = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch (err) {
    const out = (err.stdout || "").trim();
    // pacman -Qu exits 1 with no output when the system is up to date.
    if (!out && err.code === 1) error = null;
    else error = out || err.message;
  }

  const report = {
    checked_at: new Date().toISOString(),
    count: packages.length,
    packages: packages.slice(0, 40),
    error,
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");

  let items = [];
  try { items = JSON.parse(await readFile(ACTIONS, "utf8")); } catch { /* ignore */ }
  items = items.filter((a) => a.topic !== "os-updates");
  if (packages.length > 0) {
    items.push({
      topic: "os-updates",
      title: `${packages.length} atualização(ões) do sistema pendente(s)`,
      steps: [
        "Revisar api/data/os-updates.json.",
        "sudo pacman -Syu",
        "sudo /opt/openresty/bin/openresty -t && sudo systemctl reload openresty",
        "find /etc -name '*.pacnew'",
        "Verificar health no dashboard e reiniciar serviços se necessário.",
      ],
    });
  }
  await writeFile(ACTIONS, JSON.stringify(items, null, 2), "utf8");
  console.log(`OS update check: ${packages.length} pending`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
