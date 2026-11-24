/**
 * Daily Executive Queue for the Climara pipeline (Fase 5).
 * Plain JSON file; at most 7 items, highest expected value first.
 * Nothing here sends anything — a human approves each draft.
 */
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_QUEUE =
  process.env.KAREN_EXECUTIVE_QUEUE ??
  "/home/admin/karen/api/data/executive-queue.json";
export const MAX_ITEMS = 7;

export type QueueDecision = "approve" | "edit" | "skip";

export interface ExecutiveItem {
  id: string;
  action: string;
  lead: string;
  source: string;
  draft: string;
  estimateSeconds: number;
  status: "pending" | "approved" | "edited" | "skipped";
  created_at: string;
}

async function readAll(filePath?: string): Promise<ExecutiveItem[]> {
  try {
    const parsed = JSON.parse(await readFile(pathFor(filePath), "utf8"));
    return Array.isArray(parsed) ? (parsed as ExecutiveItem[]) : [];
  } catch {
    return [];
  }
}

function pathFor(filePath?: string): string {
  return filePath || DEFAULT_QUEUE;
}

async function writeAll(items: ExecutiveItem[], filePath?: string): Promise<void> {
  const target = pathFor(filePath);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

export function readingTimeSeconds(items: ExecutiveItem[]): number {
  return items
    .filter((item) => item.status === "pending")
    .reduce((sum, item) => sum + Math.max(1, item.estimateSeconds), 0);
}

async function addItem(
  item: Omit<ExecutiveItem, "created_at" | "status">,
  filePath?: string
): Promise<ExecutiveItem[]> {
  const items = await readAll(filePath);
  const pending = items.filter((i) => i.status === "pending");
  if (pending.length >= MAX_ITEMS) {
    throw new Error(`Fila executiva cheia: ${MAX_ITEMS} itens pendentes.`);
  }
  const entry: ExecutiveItem = {
    ...item,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  const next = [...items, entry];
  await writeAll(next, filePath);
  return next;
}

async function decide(
  id: string,
  decision: QueueDecision,
  filePath?: string,
  editedDraft?: string
): Promise<ExecutiveItem | null> {
  const items = await readAll(filePath);
  const target = items.find((item) => item.id === id && item.status === "pending");
  if (!target) return null;
  target.status = decision === "approve" ? "approved" : decision === "skip" ? "skipped" : "edited";
  if (decision === "edit" && editedDraft?.trim()) target.draft = editedDraft.trim();
  await writeAll(items, filePath);
  return target;
}

export const executiveQueue = { readAll, addItem, decide, readingTimeSeconds };
