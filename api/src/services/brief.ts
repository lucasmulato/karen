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
  health: string;
  decisions: { path: string; text: string }[];
  next_steps: string[];
}

async function readJson(path: string): Promise<any | null> {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

export class BriefService {
  constructor(
    private readonly client: Client,
    private readonly notes: VaultFsService,
    private readonly diagnosis?: DiagnosisService | null
  ) {}

  async build(): Promise<BriefReport> {
    const [queue, credits, triage, garden, decisions, diag] = await Promise.all([
      new QueueService(this.client).items().catch(() => []),
      readJson(`${DATA}/credit-recommendations.json`),
      readJson(process.env.KAREN_TRIAGE_JSON ?? `${DATA}/eva-triage.json`),
      readJson(process.env.KAREN_GARDEN_JSON ?? `${DATA}/vault-maintenance.json`),
      this.notes.decisions(5).catch(() => []),
      this.diagnosis ? this.diagnosis.report().catch(() => null) : Promise.resolve(null),
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
    "⚖️ PRÓXIMO PASSO",
    ...brief.next_steps.map((step, i) => `${i + 1}. ${step}`),
    "",
    "🩺 SAÚDE (dados determinísticos)",
    brief.health,
  ];
  return lines.join("\n");
}
