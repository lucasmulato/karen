/**
 * Pure rules for closing the `auto` loop. Only low-risk, purely informational
 * items may be resolved without a human; every resolution is audited.
 */

/** Informational sources: nothing to execute, no state outside KAREN changes. */
export const AUTO_RESOLVE_SOURCES = new Set(["key"]);

export function autoResolvable(item) {
  return Boolean(
    item &&
      item.policy === "auto" &&
      !item.forced &&
      AUTO_RESOLVE_SOURCES.has(String(item.source ?? ""))
  );
}

export function summarizeResolutions(entries) {
  const bySource = {};
  for (const entry of Array.isArray(entries) ? entries : []) {
    bySource[entry.source] = (bySource[entry.source] ?? 0) + 1;
  }
  return { total: (entries ?? []).length, bySource };
}
