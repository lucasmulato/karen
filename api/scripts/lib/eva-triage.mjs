/**
 * Pure helpers for EVA's nightly triage.
 *
 * No I/O, no secrets, no side effects: sanitization, deterministic guardrails,
 * prompt building and model-output parsing live here so they can be unit tested.
 * The model only *classifies* — it never executes anything.
 */

export const POLICIES = ["auto", "propose", "blocked"];
export const MAX_ITEMS = 12;

const SECRET_ASSIGNMENT =
  /(?:TOKEN|PASSWORD|PASSWD|SECRET|API[_-]?KEY|CREDENTIAL|PRIVATE[_-]?KEY)\s*[:=]\s*(?!\[redacted\])\S+/i;
const RISKY_HINT =
  /(pagar|pagamento|contratar|enviar|envio|login|logar|conta|comprar|compra|assinar|assinatura|transfer|deletar|remover|apagar|formatar|irrevers[ií]vel|\bsudo\b|\brm\s)/i;

/** Collapse whitespace, redact secret-looking values and bound the length. */
export function sanitizeText(value, max = 240) {
  let text = String(value ?? "").replace(/\s+/g, " ").trim();
  text = text.replace(
    /[A-Z0-9_]*(?:TOKEN|PASSWORD|PASSWD|SECRET|API[_-]?KEY|CREDENTIAL|PRIVATE[_-]?KEY)[A-Z0-9_]*\s*[:=]\s*\S+/gi,
    "[redacted]"
  );
  text = text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  text = text.replace(/\b[A-Fa-f0-9]{32,}\b/g, "[redacted]");
  return text.slice(0, max);
}

/**
 * Deterministic policy that overrides the model. Fails toward a human gate:
 * command approvals never become `auto`, and anything risky becomes `blocked`.
 * Returns null when the model is allowed to decide.
 */
export function hardPolicy(item) {
  const source = String(item?.source ?? "");
  const risk = String(item?.risk ?? "").toLowerCase();
  const title = String(item?.title ?? "");
  const detail = String(item?.detail ?? "");

  // The approval gate is sacred: a pending command always needs a human.
  if (source === "command") return risk === "read" ? "propose" : "blocked";

  if (SECRET_ASSIGNMENT.test(title) || SECRET_ASSIGNMENT.test(detail)) return "blocked";
  if (RISKY_HINT.test(title) || RISKY_HINT.test(detail)) return "blocked";
  return null;
}

/** Build a short, strict classification prompt. Persona is passed separately. */
export function buildPrompt(items) {
  const list = items
    .map(
      (it, i) =>
        `${i + 1}. id="${it.id}" | fonte=${it.source}${it.risk ? ` | risco=${it.risk}` : ""} | ` +
        `titulo=${it.title} | detalhe=${it.detail || "-"}`
    )
    .join("\n");

  return [
    "Você está fazendo a triagem noturna da KAREN. Classifique CADA item abaixo em exatamente uma política:",
    '- "auto": somente leitura ou reversível, sem risco, pode ser resolvido e resumido sem decisão humana.',
    '- "propose": requer uma decisão humana simples.',
    '- "blocked": alto risco ou irreversível — dinheiro, conta, login, mensagem, chave, segredo ou mudança de sistema.',
    "Regras fixas: nunca use auto para aprovação de comando, chave, pagamento, contratação, login, envio de mensagem ou conta.",
    "Na dúvida, use propose. Responda SOMENTE com um array JSON válido, sem texto antes ou depois, no formato:",
    '[{"id":"...","policy":"auto|propose|blocked","reason":"...","next_step":"..."}]',
    `Itens (${items.length}):\n${list}`,
  ].join("\n");
}

/** Robustly extract a classification array from a chatty model response. */
export function parseModelOutput(text) {
  try {
    const raw = String(text ?? "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end <= start) return [];
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object" && typeof x.id === "string")
      .map((x) => ({
        id: x.id,
        policy: POLICIES.includes(x.policy) ? x.policy : "propose",
        reason: sanitizeText(x.reason, 200),
        next_step: sanitizeText(x.next_step, 200),
      }));
  } catch {
    return [];
  }
}

/** Apply guardrails to model output; anything unclassified defaults to propose. */
export function mergeClassifications(items, classifications = []) {
  const byId = new Map(classifications.map((c) => [c.id, c]));
  return items.map((item) => {
    const forced = hardPolicy(item);
    const model = byId.get(item.id);
    const policy = forced ?? model?.policy ?? "propose";
    return {
      id: item.id,
      source: item.source,
      title: item.title,
      detail: item.detail ?? "",
      route: item.route,
      policy,
      reason: forced
        ? `Regra determinística: ${forced} (${item.source}${item.risk ? `/${item.risk}` : ""}).`
        : sanitizeText(model?.reason ?? "Sem justificativa do modelo.", 200),
      next_step: forced ? "" : sanitizeText(model?.next_step ?? "", 200),
      forced: Boolean(forced),
    };
  });
}

export function summarize(items) {
  const count = { auto: 0, propose: 0, blocked: 0 };
  for (const item of items) {
    if (POLICIES.includes(item.policy)) count[item.policy] += 1;
  }
  return { total: items.length, ...count };
}
