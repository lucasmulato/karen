/** Friday report for the Climara pipeline (Fase 5): five numbers, no invention. */
export interface WeeklyMetrics {
  leadsScanned: number | null;
  contactsApprovedSent: number | null;
  replies: number | null;
  payingClients: number | null;
  revenue: number | null;
  stop?: string;
  double?: string;
}

function show(value: number | null): string {
  return value === null || value === undefined ? "não medido" : String(value);
}

export function buildWeeklyReport(m: WeeklyMetrics): string {
  return [
    "Relatório semanal — Climara",
    `Leads varridos: ${show(m.leadsScanned)}`,
    `Contatos aprovados e enviados pelo Lucas: ${show(m.contactsApprovedSent)}`,
    `Respostas: ${show(m.replies)}`,
    `Clientes pagantes: ${show(m.payingClients)}`,
    `Caixa: ${show(m.revenue)}`,
    "",
    `Parar: ${m.stop?.trim() || "a definir com Lucas"}`,
    `Dobrar: ${m.double?.trim() || "a definir com Lucas"}`,
    "",
    "Nenhum número é estimado. Valores não medidos aparecem como 'não medido'.",
  ].join("\n");
}
