/**
 * Append-only consent ledger for the Climara pipeline (Fase 5).
 * No update and no delete API: history is immutable by construction.
 */
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_LEDGER =
  process.env.KAREN_CONSENT_LEDGER ??
  "/home/admin/karen/api/data/consent-leger.jsonl";

export type ConsentStatus = "pending" | "approved" | "opt_out" | "suppressed";

export interface ConsentEntry {
  leadId: string;
  status: ConsentStatus;
  source: string;
  channel: string;
  basis: string;
  actor: string;
  at: string;
  note?: string;
}

function pathFor(filePath?: string): string {
  return filePath || DEFAULT_LEDGER;
}

async function readAll(filePath?: string): Promise<ConsentEntry[]> {
  try {
    const text = await readFile(pathFor(filePath), "utf8");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ConsentEntry);
  } catch {
    return [];
  }
}

/** Appends one immutable event. Never edits an existing line. */
export async function appendConsent(
  input: Omit<ConsentEntry, "at"> & { at?: string },
  filePath?: string
): Promise<ConsentEntry> {
  if (!input.leadId?.trim()) throw new Error("leadId é obrigatório.");
  if (!input.source?.trim()) throw new Error("source é obrigatório (proveniência).");
  if (!approvedBasisValid(input)) throw new Error("base de contato inválida.");
  const entry: ConsentEntry = { ...input, at: input.at ?? new Date().toISOString() };
  const target = pathFor(filePath);
  await mkdir(dirname(target), { recursive: true });
  await appendFile(target, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

// Kept as a helper so the validation rule is testable and explicit.
function approvedBasisValid(input: Omit<ConsentEntry, "at"> & { at?: string }): boolean {
  return Boolean(input.basis && input.basis.trim().length >= 3);
}

/** True when the most recent event blocks contact. */
export async function isOptedOut(leadId: string, filePath?: string): Promise<boolean> {
  const entries = await readAll(filePath);
  const last = [...entries].reverse().find((entry) => entry.leadId === leadId);
  return Boolean(last && (last.status === "opt_out" || last.status === "suppressed"));
}

export async function consentHistory(
  leadId: string,
  filePath?: string
): Promise<ConsentEntry[]> {
  const entries = await readAll(filePath);
  return entries.filter((entry) => entry.leadId === leadId);
}
