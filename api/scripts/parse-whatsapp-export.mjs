#!/usr/bin/env node
/**
 * DRAFT (EQ-WA-01): read-only WhatsApp export parser.
 *
 *   node scripts/parse-whatsapp-export.mjs --file /path/_chat.txt
 *
 * Reads the export file and compares extracted phone numbers with the leads
 * table (SELECT only). Emits a proposal JSON for human approval. It never
 * writes to the database, never sends a message and never edits the export.
 */
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { parseExport } from "../build/services/whatsapp-export.js";
import { executiveQueue } from "../build/services/executive-queue.js";

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const file = fileIndex >= 0 ? args[fileIndex + 1] : args.find((a) => a.endsWith(".txt"));
if (!file) {
  console.error("Uso: node scripts/parse-whatsapp-export.mjs --file <exportacao.txt>");
  process.exit(2);
}
if (args.includes("--apply")) {
  console.error("--apply ainda não existe: aplique apenas após approve explícito no Executive Queue.");
  process.exit(2);
}

const text = await readFile(file, "utf8");
const events = parseExport(text);
const phones = new Map();
for (const event of events) {
  for (const phone of event.phones) {
    const current = phones.get(phone) ?? { phone, firstSeen: event.timestamp, lastSeen: event.timestamp, messages: 0 };
    current.messages += 1;
    if (event.timestamp < current.firstSeen) current.firstSeen = event.timestamp;
    if (event.timestamp > current.lastSeen) current.lastSeen = event.timestamp;
    phones.set(phone, current);
  }
}

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/synapsevault",
});
await client.connect();
let rows = [];
try {
  const result = await client.query(
    `SELECT id, title, phone, brand, suppressed
       FROM leads
      WHERE phone IS NOT NULL AND phone <> ''
      ORDER BY created_at DESC`
  );
  rows = result.rows;
} finally {
  await client.end();
}

const byDigits = new Map(
  rows.map((row) => [String(row.phone).replace(/\D/g, ""), row])
);
const matched = [];
for (const entry of phones.values()) {
  const row = byDigits.get(entry.phone);
  if (!row) continue;
  matched.push({
    leadId: row.id,
    title: row.title,
    brand: row.brand,
    suppressed: Boolean(row.suppressed),
    phone: entry.phone,
    source: "WhatsApp export (local .txt)",
    firstSeen: entry.firstSeen,
    lastSeen: entry.lastSeen,
    messages: entry.messages,
    proposedStatus: "engaged",
  });
}

const proposal = {
  generated_at: new Date().toISOString(),
  sourceFile: file,
  sourceKind: "WhatsApp .txt export (read-only)",
  linesParsed: events.length,
  distinctPhones: phones.size,
  matchedLeads: matched.length,
  updates: matched.filter((m) => !m.suppressed),
  skippedSuppressed: matched.filter((m) => m.suppressed).map((m) => m.leadId),
  note: "Nenhuma escrita no banco. Nenhuma mensagem enviada. Aplicar exige approve explícito.",
  approvalId: `WA-ENGAGE-${new Date().toISOString().slice(0, 10)}`,
};

if (args.includes("--queue") && !args.includes("--dry-run")) {
  for (const update of proposal.updates) {
    try {
      await executiveQueue.addItem({
        id: proposal.approvalId,
        action: `Marcar engaged: ${update.title}`,
        lead: update.leadId,
        source: update.source,
        draft: `Aprovar atualização de ${update.phone} com última interação em ${update.lastSeen}.`,
        estimateSeconds: 20,
      });
    } catch (err) {
      console.warn(`fila não recebeu item para ${update.leadId}: ${err.message}`);
    }
  }
  proposal.queued = true;
}

console.log(JSON.stringify(proposal, null, 2));
