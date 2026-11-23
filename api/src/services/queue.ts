/**
 * Unified human-in-the-loop queue.
 *
 * Merges pending command approvals (Postgres) with file-based action items,
 * missing keys, dependency audit and credit changes. It is strictly read-only
 * and never emits approval tokens, secrets or stack traces.
 */
import { readFile, access } from "node:fs/promises";
import type { Client } from "pg";

const ENV_FILE = process.env.KAREN_ENV_FILE ?? "/home/admin/models/karen.env";
const ACTIONS = process.env.KAREN_ACTION_ITEMS ?? "/home/admin/karen/api/data/action-items.json";
const AUDIT = process.env.KAREN_AUDIT_JSON ?? "/home/admin/karen/api/data/dependency-audit.json";
const CREDITS = process.env.KAREN_CREDIT_JSON ?? "/home/admin/karen/api/data/credit-recommendations.json";
const TRIAGE = process.env.KAREN_TRIAGE_JSON ?? "/home/admin/karen/api/data/eva-triage.json";

const KEY_LABELS: Record<string, string> = {
  CLOUDFLARE_API_TOKEN: "Embeddings semânticos",
  APIFY_TOKEN: "Leads pagos (opcional)",
  NVD_API_KEY: "Limite NVD (opcional)",
  SMTP_USER: "E-mail da KAREN",
  SMTP_APP_PASSWORD: "E-mail da KAREN",
};

export type Severity = "critical" | "high" | "medium" | "low";
export type Policy = "auto" | "propose" | "blocked";

export interface QueueItem {
  id: string;
  source: "command" | "action" | "key" | "audit" | "credit" | "triage";
  severity: Severity;
  policy: Policy;
  title: string;
  detail: string;
  route?: string;
  dedupe_key: string;
  created_at?: string;
}

async function readJson(path: string): Promise<any | null> {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

export class QueueService {
  constructor(private readonly client: Client) {}

  async items(): Promise<QueueItem[]> {
    const out: QueueItem[] = [];

    // 1. Pending command approvals — the highest-priority human gate.
    try {
      const res = await this.client.query(
        `SELECT id, command_id, risk, source, created_at
           FROM command_runs WHERE status = 'pending'
          ORDER BY created_at ASC LIMIT 50`
      );
      for (const row of res.rows) {
        out.push({
          id: `command:${row.id}`,
          source: "command",
          severity: "critical",
          policy: "propose",
          title: `Aprovar: ${row.command_id}`,
          detail: `Comando ${row.risk} solicitado por ${row.source}. Requer decisão humana.`,
          route: "/app/?pane=commands",
          dedupe_key: `command:${row.id}`,
          created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
        });
      }
    } catch { /* queue still works without DB approvals */ }

    // 2. Action items written by watchdog / audits / OS checks.
    const actions = (await readJson(ACTIONS)) ?? [];
    for (const action of Array.isArray(actions) ? actions : []) {
      const topic = String(action.topic ?? "action");
      out.push({
        id: `action:${topic}`,
        source: "action",
        severity: /fail|missing|stale|critical/i.test(topic) ? "high" : "medium",
        policy: "propose",
        title: String(action.title ?? topic),
        detail: Array.isArray(action.steps) ? String(action.steps[0] ?? "") : "",
        route: "/app/?pane=commands",
        dedupe_key: `action:${topic}`,
      });
    }

    // 3. Missing optional keys.
    let envText = "";
    try { envText = await readFile(ENV_FILE, "utf8"); } catch { /* ignore */ }
    for (const [name, label] of Object.entries(KEY_LABELS)) {
      const configured =
        Boolean(process.env[name]?.trim()) ||
        new RegExp(`^${name}=(.+)$`, "m").test(envText);
      if (!configured) {
        out.push({
          id: `key:${name}`,
          source: "key",
          severity: "low",
          policy: "auto",
          title: `${label}: chave não configurada`,
          detail: name,
          dedupe_key: `key:${name}`,
        });
      }
    }

    // 4. Dependency advisories.
    const audit = await readJson(AUDIT);
    const critical = audit?.totals?.critical ?? 0;
    const high = audit?.totals?.high ?? 0;
    if (critical || high) {
      out.push({
        id: "audit:dependencies",
        source: "audit",
        severity: critical ? "critical" : "high",
        policy: "propose",
        title: `Dependências: ${critical} critical / ${high} high`,
        detail: "Revisar api/data/dependency-audit.json antes de atualizar.",
        route: "/app/?pane=commands",
        dedupe_key: "audit:dependencies",
      });
    }

    // 5. Credit changes needing a human decision.
    const credits = await readJson(CREDITS);
    if ((credits?.changes?.length ?? 0) > 0) {
      out.push({
        id: "credit:changes",
        source: "credit",
        severity: "medium",
        policy: "propose",
        title: `${credits.changes.length} mudança(ões) em fontes de crédito`,
        detail: "Confirmar em canal oficial antes de qualquer inscrição.",
        dedupe_key: `credit:${credits.date ?? "latest"}`,
      });
    }

    // 6. EVA nightly triage — a read-only side file that overlays policies onto
    //    existing items and adds note-only items. Deterministic rules in the
    //    triage script guarantee no command approval is ever downgraded to auto.
    const triage = await readJson(TRIAGE);
    if (Array.isArray(triage?.items)) {
      const byId = new Map<string, any>();
      for (const item of triage.items) {
        if (item && typeof item.id === "string") byId.set(item.id, item);
      }
      for (const item of out) {
        const classified = byId.get(item.id);
        if (!classified || !["auto", "propose", "blocked"].includes(classified.policy)) continue;
        byId.delete(item.id);
        if (item.source === "command" && classified.policy === "auto") continue;
        item.policy = classified.policy as Policy;
        const reason = String(classified.reason ?? "").trim();
        if (reason) item.detail = `${item.detail ? `${item.detail} · ` : ""}EVA: ${reason}`;
        if (item.policy === "blocked") item.severity = "critical";
        else if (item.policy === "auto" && item.severity !== "critical") item.severity = "low";
      }
      for (const [id, classified] of byId) {
        out.push({
          id: `triage:${id}`,
          source: "triage",
          severity: classified.policy === "blocked" ? "critical" : classified.policy === "auto" ? "low" : "medium",
          policy: classified.policy as Policy,
          title: String(classified.title ?? "Item triado por EVA"),
          detail: `EVA: ${String(classified.reason ?? "")}`,
          route: classified.route,
          dedupe_key: `triage:${id}`,
        });
      }
    }

    const seen = new Set<string>();
    return out.filter((item) => {
      if (seen.has(item.dedupe_key)) return false;
      seen.add(item.dedupe_key);
      return true;
    });
  }

  async attention(): Promise<{ total: number; items: QueueItem[] }> {
    const items = await this.items();
    return { total: items.length, items };
  }
}
