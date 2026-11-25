/** Pure helpers for the intimacy layer (Fase "Karen mais íntima"). */
export type FeedbackKind = "util" | "aprofunde" | "aplique" | "arquive";

const FEEDBACK_RE = /registre\s+feedback\s*:\s*(util|útil|aprofunde|aplique|arquive)(?:\s*[-—:]?\s*(.{0,160}))?/i;

export interface ParsedFeedback {
  kind: FeedbackKind;
  note: string;
}

/** Parses the exact text sent by the UI feedback buttons. */
export function parseFeedback(text: string): ParsedFeedback | null {
  const match = FEEDBACK_RE.exec(String(text ?? ""));
  if (!match) return null;
  const raw = match[1].toLowerCase();
  const kind: FeedbackKind = (raw === "útil" ? "util" : raw) as FeedbackKind;
  return { kind, note: String(match[2] ?? "").trim() };
}

const LEARNING_HINT =
  /\b(aprender|aprendizado|aprenda|entender|explicar|relevante|vale a pena|deveria|o que acha|como funciona)\b/i;
const AMBIGUITY_HINT = /\?|\b(talvez|acho que|não sei|sei lá|será que)\b/i;

/** True only for ambiguous or learning-oriented messages — never for routine ops. */
export function shouldAskRelevance(text: string): boolean {
  const value = String(text ?? "").trim();
  if (!value || value.length > 400) return false;
  return LEARNING_HINT.test(value) || AMBIGUITY_HINT.test(value);
}

const INTERVALS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

/** Leitner-style review: advance one level when the interval elapsed. */
export function nextReview(level: number, daysSince: number): { level: number; intervalDays: number } {
  const safe = Math.min(5, Math.max(1, Math.trunc(level) || 1));
  const interval = INTERVALS[safe] ?? 1;
  const advanced = daysSince >= interval ? Math.min(5, safe + 1) : safe;
  return { level: advanced, intervalDays: INTERVALS[advanced] ?? 1 };
}
