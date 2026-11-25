#!/usr/bin/env node
/**
 * DRAFT (EQ-CAL-01): read-only .ics reader for EVA's calendar awareness.
 *
 *   node scripts/sync-calendar.mjs --file <path.ics>
 *
 * Requires `node-ical` (proposed local dependency, not installed here).
 * Emits free windows; no writes, no e-mail, no external calls.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { freeWindows } from "../build/services/calendar.js";

const args = process.argv.slice(2);
const index = args.indexOf("--file");
const vault = process.env.KAREN_VAULT_DIR ?? "/home/admin/models/karen-vault";
const file = index >= 0 ? args[index + 1] : join(vault, "calendar.ics");

let ical;
try {
  ical = await import("node-ical");
} catch {
  console.error("node-ical não instalado. Rascunho: use `npm install node-ical` na branch, nunca global.");
  process.exit(2);
}

let text;
try {
  text = await readFile(file, "utf8");
} catch {
  console.error(`Arquivo ICS não encontrado: ${file}`);
  process.exit(1);
}

const parsed = ical.parseICS(text);
const events = Object.values(parsed)
  .filter((item) => item.type === "VEVENT" && item.start && item.end)
  .map((item) => ({ start: item.start, end: item.end, allDay: Boolean(item.allDay) }));

const today = new Date().toISOString().slice(0, 10);
console.log(JSON.stringify({
  generated_at: new Date().toISOString(),
  sourceFile: file,
  events: events.length,
  date: today,
  freeWindows: freeWindows(events),
  note: "Somente leitura. Nenhuma mensagem foi enviada.",
}, null, 2));
