/** Pure entity extraction from note text. No I/O, no side effects. */

const CVE = /CVE-\d{4}-\d{4,}/gi;

export function extractEntities(text, tools = []) {
  const body = String(text ?? "");
  const cves = [...new Set(body.match(CVE)?.map((id) => id.toUpperCase()) ?? [])];
  const lower = body.toLowerCase();
  const foundTools = tools
    .map((tool) => String(tool))
    .filter((tool) => tool && lower.includes(tool.toLowerCase()));
  return { cves, tools: [...new Set(foundTools)] };
}
