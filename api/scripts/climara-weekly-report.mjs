#!/usr/bin/env node
/** Imprime o relatório de sexta da Climara. Nenhum envio, nenhum write. */
import { readFile } from "node:fs/promises";
import { buildWeeklyReport } from "../build/services/weekly-report.js";

const METRICS =
  process.env.KAREN_WEEKLY_METRICS ??
  "/home/admin/karen/api/data/weekly-metrics.json";

let metrics = {};
try {
  metrics = JSON.parse(await readFile(METRICS, "utf8"));
} catch {
  // Sem arquivo: todos os números ficam "não medido", sem inventar nada.
}

console.log(
  buildWeeklyReport({
    leadsScanned: metrics.leadsScanned ?? null,
    contactsApprovedSent: metrics.contactsApprovedSent ?? null,
    replies: metrics.replies ?? null,
    payingClients: metrics.payingClients ?? null,
    revenue: metrics.revenue ?? null,
    stop: metrics.stop,
    double: metrics.double,
  })
);
