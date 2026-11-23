/**
 * Manual outreach handoff queue. KAREN prepares the message and a wa.me link;
 * the operator copies/sends it herself. This service NEVER sends anything and
 * never stores the operator's own number.
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import type { Client } from "pg";

const STATE = process.env.KAREN_OUTREACH_STATE ?? "/home/admin/karen/api/data/outreach-status.json";

export type OutreachStatus = "ready" | "copied" | "sent" | "dismissed";
export const STATUSES: OutreachStatus[] = ["ready", "copied", "sent", "dismissed"];

export interface OutreachItem {
  id: string;
  title: string;
  phone: string | null;
  wa_link: string;
  first_touch: string;
  follow_up: string;
  model: string;
  status: OutreachStatus;
  created_at: string;
  updated_at: string | null;
}

interface StateEntry {
  status: OutreachStatus;
  updated_at: string;
}

/** Brazil phone numbers: keep 55 + 10/11 digits, or omit for a chooser link. */
export function normalizePhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(digits)) return digits;
  if (/^[1-9]\d{9,10}$/.test(digits)) return `55${digits}`;
  return null;
}

export function buildWaLink(phone: unknown, text: string): string {
  const normalized = normalizePhone(phone);
  const query = `text=${encodeURIComponent(String(text ?? ""))}`;
  return normalized ? `https://wa.me/${normalized}?${query}` : `https://wa.me/?${query}`;
}

async function readState(): Promise<Record<string, StateEntry>> {
  try {
    const parsed = JSON.parse(await readFile(STATE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeState(state: Record<string, StateEntry>): Promise<void> {
  const tmp = `${STATE}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tmp, STATE);
}

export class OutreachService {
  constructor(private readonly client: Client) {}

  async items(): Promise<OutreachItem[]> {
    const state = await readState();
    const res = await this.client.query(
      `SELECT id, title, phone, draft, created_at FROM leads
        WHERE suppressed = FALSE
          AND draft->>'firstTouch' IS NOT NULL AND draft->>'firstTouch' <> ''
        ORDER BY created_at DESC LIMIT 100`
    );
    const items: OutreachItem[] = res.rows.map((row) => {
      const draft = typeof row.draft === "string" ? JSON.parse(row.draft) : (row.draft ?? {});
      const firstTouch = String(draft.firstTouch ?? "");
      const entry = state[String(row.id)];
      return {
        id: String(row.id),
        title: String(row.title ?? ""),
        phone: normalizePhone(row.phone),
        wa_link: buildWaLink(row.phone, firstTouch),
        first_touch: firstTouch,
        follow_up: String(draft.followUp ?? ""),
        model: String(draft.model ?? ""),
        status: STATUSES.includes(entry?.status) ? entry.status : "ready",
        created_at: new Date(row.created_at).toISOString(),
        updated_at: entry?.updated_at ?? null,
      };
    });
    const order: Record<OutreachStatus, number> = { ready: 0, copied: 1, sent: 2, dismissed: 3 };
    return items.sort(
      (a, b) => order[a.status] - order[b.status] || b.created_at.localeCompare(a.created_at)
    );
  }

  async update(id: string, status: OutreachStatus): Promise<OutreachItem | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !STATUSES.includes(status)) return null;
    const state = await readState();
    state[id] = { status, updated_at: new Date().toISOString() };
    await writeState(state);
    const found = (await this.items()).find((item) => item.id === id);
    return found ?? null;
  }
}
