/**
 * Pure helpers for the vault garden job. No I/O, no side effects: the job only
 * produces suggestions and drafts — it never rewrites MEMORY.md or notes.
 */

export function pickSuggestions(rows, threshold = 0.55, max = 3) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      score: Number(row.score ?? 0),
    }))
    .filter((row) => row.id && Number.isFinite(row.score) && row.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

export function memoryDraft(memory, decisions, max = 5) {
  const text = String(memory ?? "").toLowerCase();
  const lines = [];
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    const title =
      String(decision?.text ?? "")
        .split("\n")
        .find((line) => /^#\s+\S/.test(line))
        ?.replace(/^#\s*/, "") ?? String(decision?.path ?? "");
    if (!title || text.includes(title.toLowerCase())) continue;
    lines.push(`- ${decision.path}: ${title}`);
    if (lines.length >= max) break;
  }
  return lines;
}
