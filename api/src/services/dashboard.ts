/**
 * Aggregates "what needs attention" and recent activity from local state.
 * Read-only, deterministic, no secrets in the output.
 */
import { readFile, access } from "node:fs/promises";
import type { Client } from "pg";
import type { VaultFsService } from "./vaultfs.js";

const ENV_FILE = process.env.KAREN_ENV_FILE ?? "/home/admin/models/karen.env";
const CREDITS = process.env.KAREN_CREDIT_JSON ?? "/home/admin/karen/api/data/credit-recommendations.json";
const ACTIONS = "/home/admin/karen/api/data/action-items.json";
const AUDIT = "/home/admin/karen/api/data/dependency-audit.json";
const TRIAGE = process.env.KAREN_TRIAGE_JSON ?? "/home/admin/karen/api/data/eva-triage.json";

const KEY_LABELS: Record<string, string> = {
  CLOUDFLARE_API_TOKEN: "Embeddings semânticos",
  APIFY_TOKEN: "Leads pagos (opcional)",
  NVD_API_KEY: "Limite NVD (opcional)",
  SMTP_USER: "E-mail da KAREN",
  SMTP_APP_PASSWORD: "E-mail da KAREN",
};

async function readJson(path: string): Promise<any | null> {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}
async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export interface AttentionItem {
  topic: string;
  label: string;
  detail: string;
}

export interface ActivityItem {
  kind: "command" | "decision" | "alert" | "audit";
  title: string;
  detail: string;
  at: string;
}

export class DashboardService {
  constructor(private readonly client: Client, private readonly notes: VaultFsService) {}

  async attention(): Promise<{
    total: number;
    items: AttentionItem[];
    triage?: { generated_at: string; handled: number; needs_you: number; blocked: number };
  }> {
    const items: AttentionItem[] = [];
    const triageFile = await readJson(TRIAGE);
    const triageItems = Array.isArray(triageFile?.items) ? triageFile.items : [];
    const auto = new Set(
      triageItems.filter((t: any) => t?.policy === "auto").map((t: any) => String(t.id))
    );
    let envText = "";
    try { envText = await readFile(ENV_FILE, "utf8"); } catch { /* ignore */ }
    for (const [name, label] of Object.entries(KEY_LABELS)) {
      const inEnv = Boolean(process.env[name]?.trim());
      const inFile = new RegExp(`^${name}=(.+)$`, "m").test(envText);
      if (!inEnv && !inFile) {
        items.push({ topic: `key:${name}`, label, detail: `${name} não configurado` });
      }
    }
    const actions = await readJson(ACTIONS);
    for (const action of actions ?? []) {
      items.push({ topic: action.topic, label: "Ação pendente", detail: action.title });
    }
    const audit = await readJson(AUDIT);
    const high = audit?.totals?.high ?? 0;
    const critical = audit?.totals?.critical ?? 0;
    if (high || critical) {
      items.push({
        topic: "dependencies",
        label: "Dependências",
        detail: `${critical} critical / ${high} high`,
      });
    }
    const credits = await readJson(CREDITS);
    if (credits?.changes?.length) {
      items.push({
        topic: "credits",
        label: "Créditos",
        detail: `${credits.changes.length} mudança(ões) em fontes oficiais`,
      });
    }
    // Items EVA classified as reversible/read are handled, not attention.
    const visible = items.filter(
      (item) => !auto.has(item.topic) && !auto.has(`action:${item.topic}`)
    );
    const triage = triageFile?.generated_at
      ? {
          generated_at: String(triageFile.generated_at),
          handled: triageItems.filter((t: any) => t?.policy === "auto").length,
          needs_you: triageItems.filter((t: any) => t?.policy === "propose").length,
          blocked: triageItems.filter((t: any) => t?.policy === "blocked").length,
        }
      : undefined;
    return { total: visible.length, items: visible, triage };
  }

  async activity(): Promise<ActivityItem[]> {
    const out: ActivityItem[] = [];
    try {
      const res = await this.client.query(
        `SELECT command_id, status, created_at FROM command_runs ORDER BY created_at DESC LIMIT 3`
      );
      for (const row of res.rows) {
        out.push({
          kind: "command",
          title: `${row.command_id} — ${row.status}`,
          detail: "Comando allowlisted",
          at: new Date(row.created_at).toISOString(),
        });
      }
    } catch { /* ignore */ }
    for (const d of await this.notes.decisions(3)) {
      const title = d.text.split("\n").find((l) => l.startsWith("# "))?.replace(/^#\s*/, "") ?? d.path;
      out.push({ kind: "decision", title, detail: "Decisão registrada", at: d.path });
    }
    const actions = await readJson(ACTIONS);
    for (const a of actions ?? []) {
      out.push({ kind: "alert", title: a.title, detail: "Alerta ativo", at: a.topic });
    }
    const audit = await readJson(AUDIT);
    if (audit?.generated_at) {
      out.push({
        kind: "audit",
        title: `Auditoria: ${audit.totals?.total ?? 0} advisories`,
        detail: `${audit.totals?.critical ?? 0} critical / ${audit.totals?.high ?? 0} high`,
        at: audit.generated_at,
      });
    }
    return out.slice(0, 8);
  }
}
