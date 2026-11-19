#!/usr/bin/env node
/**
 * Self-monitoring for the KAREN automation itself. Writes action items that
 * send-alert.mjs delivers by e-mail with its 24h cooldown.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { connect as tlsConnect } from "node:tls";

const run = promisify(execFile);
const ACTIONS = resolve("/home/admin/karen/api/data/action-items.json");
const BACKUP_DIR = resolve(process.env.KAREN_BACKUP_DIR || "/home/admin/backups/karen");
const HOST = process.env.KAREN_PUBLIC_HOST || "karen.164.68.109.252.sslip.io";

function item(topic, title, steps) {
  return { topic, title, steps };
}

async function main() {
  const items = [];

  // 1. systemd units
  for (const unit of ["karen-api.service", "karen-llama.service", "karen-morning.timer", "karen-alerts.timer", "karen-backup.timer", "karen-audit.timer"]) {
    try {
      const { stdout } = await run("systemctl", ["is-active", unit]);
      if (stdout.trim() !== "active") {
        items.push(item(`watchdog:unit:${unit}`, `${unit} não está ativo`, [
          `systemctl status ${unit}`,
          `journalctl -u ${unit} -n 50`,
        ]));
      }
    } catch {
      items.push(item(`watchdog:unit:${unit}`, `${unit} não está ativo`, [
        `systemctl status ${unit}`,
      ]));
    }
  }

  // 2. backup age
  try {
    const files = await readdir(BACKUP_DIR);
    const dumps = files.filter((f) => f.startsWith("db-") && f.endsWith(".sql.gz")).sort();
    if (!dumps.length) throw new Error("sem dumps");
    const info = await stat(resolve(BACKUP_DIR, dumps[dumps.length - 1]));
    const hours = (Date.now() - info.mtimeMs) / 3_600_000;
    if (hours > 26) {
      items.push(item("watchdog:backup-stale", `Backup com ${Math.round(hours)}h`, [
        "Verificar karen-backup.timer e journalctl -u karen-backup.service",
        "Rodar: sudo systemctl start karen-backup.service",
      ]));
    }
  } catch {
    items.push(item("watchdog:backup-missing", "Nenhum backup encontrado", [
      "Rodar: sudo systemctl start karen-backup.service",
    ]));
  }

  // 3. disk usage
  try {
    const { stdout } = await run("df", ["-P", "/"]);
    const line = stdout.split("\n")[1] ?? "";
    const pct = Number(line.split(/\s+/)[4]?.replace("%", ""));
    if (Number.isFinite(pct) && pct > 85) {
      items.push(item("watchdog:disk", `Disco em ${pct}%`, [
        "df -h",
        "Revisar /home/admin/backups/karen e logs antigos",
      ]));
    }
  } catch { /* ignore */ }

  // 4. certificate days
  try {
    const days = await new Promise((resolveDays) => {
      const socket = tlsConnect(
        { host: HOST, port: 443, servername: HOST, rejectUnauthorized: false },
        () => {
          const cert = socket.getPeerCertificate();
          const d = cert.valid_to
            ? Math.floor((Date.parse(cert.valid_to) - Date.now()) / 86_400_000)
            : -1;
          resolveDays(d);
          socket.end();
        }
      );
      socket.setTimeout(5000, () => { socket.destroy(); resolveDays(-1); });
      socket.on("error", () => resolveDays(-1));
    });
    if (days >= 0 && days < 7) {
      items.push(item("watchdog:cert", `Certificado vence em ${days} dias`, [
        "sudo certbot renew --dry-run",
        "Verificar certbot-renew.timer",
      ]));
    }
  } catch { /* ignore */ }

  // 5. llama health
  try {
    const res = await fetch("http://127.0.0.1:8080/health", {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error("unhealthy");
  } catch {
    items.push(item("watchdog:llama", "Modelo local não responde", [
      "systemctl status karen-llama",
      "curl -s http://127.0.0.1:8080/health",
    ]));
  }

  let existing = [];
  try { existing = JSON.parse(await readFile(ACTIONS, "utf8")); } catch { /* ignore */ }
  const byTopic = new Map(existing.map((a) => [a.topic, a]));
  for (const i of items) byTopic.set(i.topic, i);
  const merged = [...byTopic.values()];
  await mkdir(dirname(ACTIONS), { recursive: true });
  await writeFile(ACTIONS, JSON.stringify(merged, null, 2), "utf8");
  console.log(`Watchdog: ${items.length} new/updated item(s), ${merged.length} total.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
