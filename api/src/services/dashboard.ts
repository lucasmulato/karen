/**
 * Aggregates "what needs attention" and recent activity from local state.
 * Read-only, deterministic, no secrets in the output.
 */
import { readFile } from "node:fs/promises";
import type { Client } from "pg";
import type { VaultFsService } from "./vaultfs.js";
import { QueueService } from "./queue.js";

const ACTIONS = "/home/admin/karen/api/data/action-items.json";
const AUDIT = "/home/admin/karen/api/data/dependency-audit.json";
const TRIAGE = process.env.KAREN_TRIAGE_JSON ?? "/home/admin/karen/api/data/eva-triage.json";

async function readJson(path: string): Promise<any | null> {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
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
    // The unified queue is the single source of truth. It already applies the
    // EVA triage overlay, so `auto` items are handled and need no attention.
    const triageFile = await readJson(TRIAGE);
    const triageItems = Array.isArray(triageFile?.items) ? triageFile.items : [];
    const queue = await new QueueService(this.client).items();
    const visible: AttentionItem[] = queue
      .filter((item) => item.policy !== "auto")
      .map((item) => ({
        topic: item.id,
        label: item.title,
        detail: `[${item.policy}/${item.severity}] ${item.detail}`.trim(),
      }));
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
