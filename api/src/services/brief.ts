/**
 * EVA's Chief-of-Staff brief: deterministic state plus explicit trade-offs.
 *
 * The model never supplies the facts — it can only narrate this object. Every
 * number comes from local files, the queue or the diagnosis collector.
 */
import { readFile } from "node:fs/promises";
import type { Client } from "pg";
import type { VaultFsService } from "./vaultfs.js";
import type { DiagnosisService } from "./diagnosis.js";
import { QueueService } from "./queue.js";
import { formatDiagnosis } from "./diagnosis.js";

const DATA = "/home/admin/karen/api/data";

export interface BriefReport {
  generated_at: string;
  date: string;
  headline: string;
  needs_you: {
    title: string;
    detail: string;
    policy: string;
    severity: string;
    route?: string;
  }[];
  handled: number;
  opportunities: { title: string; score: number; needs: string[] }[];
  garden: { orphans: number; with_candidates: number; draft_lines: number };
  deadlines: { note: string; date: string; days_left: number }[];
  stale_decisions: { path: string; days: number }[];
  health: string;
  decisions: { path: string; text: string }[];
  next_steps: string[];
}

async function readJson(path: string): Promise<any | null> {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

/** Deadlines from note frontmatter, only the next 30 days. */
async function collectDeadlines(notes: VaultFsService) {
  const out: { note: string; date: string; days_left: number }[] = [];
  for (const path of await notes.list().catch(() => [])) {
    if (!path.endsWith(".md")) continue;
    const text = await notes.read(path).catch(() => "");
    const front = text.match(/^---\n([\s\S]*?)\n---/);
    const date = front?.[1].match(/^deadline:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
    if (!date) continue;
    const days = Math.ceil((Date.parse(date) - Date.now()) / 86_400_000);
    if (days >= -1 && days <= 30) out.push({ note: path, date, days_left: days });
  }
  return out.sort((a, b) => a.days_left - b.days_left).slice(0, 8);
}

/** Decisions older than a week without an explicit resolution marker. */
function collectStaleDecisions(decisions: { path: string; text: string }[]) {
  const out: { path: string; days: number }[] = [];
  for (const decision of decisions) {
    const date = decision.path.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!date) continue;
    const days = Math.floor((Date.now() - Date.parse(date)) / 86_400_000);
    if (days < 7) continue;
    if (/resolvido|conclu[ií]do|\bdone\b/i.test(decision.text)) continue;
    out.push({ path: decision.path, days });
  }
  return out.slice(0, 5);
}

export class BriefService {
  constructor(
    private readonly client: Client,
    private readonly notes: VaultFsService,
    private readonly diagnosis?: DiagnosisService | null
  ) {}

  async build(): Promise<BriefReport> {
    const [queue, credits, triage, garden, decisions, diag, deadlines] = await Promise.all([
      new QueueService(this.client).items().catch(() => []),
      readJson(`${DATA}/credit-recommendations.json`),
      readJson(process.env.KAREN_TRIAGE_JSON ?? `${DATA}/eva-triage.json`),
      readJson(process.env.KAREN_GARDEN_JSON ?? `${DATA}/vault-maintenance.json`),
      this.notes.decisions(5).catch(() => []),
      this.diagnosis ? this.diagnosis.report().catch(() => null) : Promise.resolve(null),
      collectDeadlines(this.notes).catch(() => []),
    ]);

    const needsYou = queue
      .filter((item) => item.policy !== "auto")
      .slice(0, 8)
      .map((item) => ({
        title: item.title,
        detail: item.detail,
        policy: item.policy,
        severity: item.severity,
        route: item.route,
      }));
    const handled = Number(triage?.summary?.auto ?? 0);
    const opportunities = (credits?.priorities ?? [])
      .slice(0, 3)
      .map((p: any) => ({
        title: String(p.title ?? ""),
        score: Number(p.score ?? 0),
        needs: Array.isArray(p.needs) ? p.needs.map(String) : [],
      }));
    const steps: string[] = [];
    if (needsYou.length) {
      steps.push(`${needsYou.length} decisão(ões) aguardam você em /app/?pane=commands`);
    }
    if (opportunities.length) {
      steps.push(`Confirmar em canal oficial: ${opportunities[0].title}`);
    }
    if ((garden?.with_candidates ?? 0) > 0) {
      steps.push(`Revisar ${garden.with_candidates} sugestões de backlink em api/data/vault-maintenance.json`);
    }
    if (deadlines.length) {
      steps.push(`${deadlines.length} prazo(s) nos próximos 30 dias: ${deadlines[0].note} em ${deadlines[0].days_left}d`);
    }
    const staleDecisions = collectStaleDecisions(decisions);
    if (staleDecisions.length) {
      steps.push(`${staleDecisions.length} decisão(ões) com 7+ dias sem desfecho registrado`);
    }
    if (!steps.length) steps.push("Sem ações urgentes — silêncio produtivo.");

    const now = new Date();
    return {
      generated_at: now.toISOString(),
      date: now.toISOString().slice(0, 10),
      headline: `${needsYou.length} decisão(ões) pendente(s) · ${handled} tratadas pela EVA · ${opportunities.length} oportunidade(s)`,
      needs_you: needsYou,
      handled,
      opportunities,
      garden: {
        orphans: Number(garden?.orphans_total ?? 0),
        with_candidates: Number(garden?.with_candidates ?? 0),
        draft_lines: Array.isArray(garden?.memory_draft) ? garden.memory_draft.length : 0,
      },
      deadlines,
      stale_decisions: staleDecisions,
      health: diag ? formatDiagnosis(diag) : "Diagnóstico indisponível.",
      decisions,
      next_steps: steps,
    };
  }
}

export function formatBrief(brief: BriefReport): string {
  const lines = [
    `EVA — BRIEF DE ${brief.date}`,
    brief.headline,
    "",
    "🎯 DECISÕES QUE PRECISAM DE VOCÊ",
    ...(brief.needs_you.length
      ? brief.needs_you.map(
          (item) => `- [${item.policy}/${item.severity}] ${item.title} — ${item.detail}${item.route ? ` (${item.route})` : ""}`
        )
      : ["- Nenhuma."]),
    "",
    "📌 OPORTUNIDADES",
    ...(brief.opportunities.length
      ? brief.opportunities.map(
          (o) => `- ${o.title} (score ${o.score}; necessidades: ${o.needs.join(", ") || "n/a"})`
        )
      : ["- Nenhuma."]),
    "",
    "🌱 JARDIM",
    `- ${brief.garden.orphans} órfãs · ${brief.garden.with_candidates} com sugestões · ${brief.garden.draft_lines} rascunho(s) de MEMORY.md (nada aplicado).`,
    "",
    "📅 PRAZOS E DECISÕES",
    ...(brief.deadlines.length
      ? brief.deadlines.map((d) => `- ${d.date} (${d.days_left}d): ${d.note}`)
      : ["- Nenhum prazo nos próximos 30 dias."]),
    ...(brief.stale_decisions.length
      ? brief.stale_decisions.map((d) => `- ${d.days}d sem desfecho: ${d.path}`)
      : []),
    "",
    "⚖️ PRÓXIMO PASSO",
    ...brief.next_steps.map((step, i) => `${i + 1}. ${step}`),
    "",
    "🩺 SAÚDE (dados determinísticos)",
    brief.health,
  ];
  return lines.join("\n");
}
