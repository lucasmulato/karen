#!/usr/bin/env node
/**
 * EVA manager (Fase 0): deterministic follow-up and critical-delivery
 * reminders. Writes action items only — it never sends a message and never
 * approves anything. The human gate stays intact.
 *
 *   node scripts/eva-manager.mjs --dry-run
 *   node scripts/eva-manager.mjs
 */
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Client } from "pg";

const ACTIONS =
  process.env.KAREN_ACTION_ITEMS ?? "/home/admin/karen/api/data/action-items.json";
const DRY = process.argv.includes("--dry-run");
const STALE_HOURS = Number(process.env.KAREN_STALE_DELIVERY_HOURS ?? 2);
const FOLLOWUP_HOURS = Number(process.env.KAREN_FOLLOWUP_HOURS ?? 36);

async function readJson(path, fallback) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function main() {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/synapsevault",
  });
  await client.connect();
  const proposed = [];
  try {
    const stale = await client.query(
      `SELECT id, brand, created_at FROM lead_conversations
        WHERE status = 'pending' AND classification = 'client'
          AND created_at < NOW() - ($1::int * INTERVAL '1 hour')
        ORDER BY created_at ASC LIMIT 20`,
      [STALE_HOURS]
    );
    for (const row of stale.rows) {
      proposed.push({
        topic: `conversation-stale:${row.id}`,
        title: `Entrega crítica aguardando decisão (${String(row.brand).toUpperCase()})`,
        steps: [
          "Abrir /app/?pane=conversations",
          "Revisar o prompt de sistema e a mensagem.",
          "Aprovar ou descartar — nada é enviado sem sua decisão.",
        ],
        severity: "urgent",
        route: "/app/?pane=conversations",
      });
    }

    const followups = await client.query(
      `SELECT l.id, l.brand, l.title, l.confirmed_at
         FROM leads l
        WHERE l.suppressed = FALSE
          AND l.confirmed_at IS NOT NULL
          AND l.confirmed_at < NOW() - ($1::int * INTERVAL '1 hour')
          AND NOT EXISTS (
            SELECT 1 FROM lead_conversations c
             WHERE c.lead_id = l.id AND c.status IN ('approved', 'sent')
          )
        ORDER BY l.confirmed_at ASC LIMIT 20`,
      [FOLLOWUP_HOURS]
    );
    for (const row of followups.rows) {
      proposed.push({
        topic: `followup:${row.id}`,
        title: `Follow-up de ${String(row.brand).toUpperCase()} sem resposta: ${String(row.title).slice(0, 60)}`,
        steps: [
          "Verificar se o lead respondeu.",
          "Se não respondeu, redigir follow-up curto (sem link na primeira mensagem).",
          "Marcar como sem interesse se houve recusa.",
        ],
        severity: "info",
        route: "/app/?pane=conversations",
      });
    }
  } finally {
    await client.end();
  }

  if (DRY) {
    console.log(JSON.stringify({ proposed }, null, 2));
    return;
  }

  let items = [];
  const parsed = await readJson(ACTIONS, []);
  if (Array.isArray(parsed)) items = parsed;
  const byTopic = new Map(items.map((item) => [String(item?.topic), item]));
  for (const item of proposed) byTopic.set(item.topic, item);
  const next = [...byTopic.values()].slice(-100);
  await mkdir(dirname(ACTIONS), { recursive: true });
  const tmp = `${ACTIONS}.tmp`;
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(tmp, ACTIONS);
  console.log(
    `EVA manager: ${proposed.length} lembrete(s) proposto(s), ${next.length} item(ns) na fila.`
  );
}

main().catch((err) => {
  console.error("EVA manager failed:", err);
  process.exitCode = 1;
});
