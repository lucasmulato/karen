/**
 * Conversation intelligence (Fase 0).
 *
 * A transcript is pasted into KAREN, classified as client / not-client /
 * unclear, then turned into TWO artefacts: a versioned system prompt for the
 * follow-up agent and the final message for the human to deliver. Nothing is
 * sent from here. The deterministic rules are the guardrail; the model may
 * only enrich output, never invent facts or bypass a human decision.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Client } from "pg";
import { redactSecrets } from "./redact.js";
import { brandConfig, isBrand, type Brand, type Role } from "./brands.js";

const ACTIONS =
  process.env.KAREN_ACTION_ITEMS ??
  "/home/admin/karen/api/data/action-items.json";
const MAX_TRANSCRIPT = 12_000;
const PROMPT_VERSION = "v1";

export type Classification = "client" | "not_client" | "unclear";
export type ConversationStatus = "pending" | "approved" | "rejected" | "sent";

export interface ConversationRow {
  id: string;
  lead_id: string | null;
  brand: Brand;
  source: string;
  transcript_hash: string;
  transcript: string;
  classification: Classification;
  score: number;
  reason: string;
  system_prompt: string;
  message: string;
  prompt_version: string;
  status: ConversationStatus;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ConversationPrompts {
  system_prompt: string;
  message: string;
}

const COLUMNS = `id, lead_id, brand, source, transcript_hash, transcript,
  classification, score, reason, system_prompt, message, prompt_version,
  status, approved_by, approved_at, sent_at, created_at`;

function mapRow(row: any): ConversationRow {
  return {
    id: String(row.id),
    lead_id: row.lead_id ? String(row.lead_id) : null,
    brand: isBrand(row.brand) ? row.brand : "karen",
    source: String(row.source ?? "manual"),
    transcript_hash: String(row.transcript_hash ?? ""),
    transcript: String(row.transcript ?? ""),
    classification: (["client", "not_client", "unclear"] as const).includes(row.classification)
      ? row.classification
      : "unclear",
    score: Number(row.score ?? 0),
    reason: String(row.reason ?? ""),
    system_prompt: String(row.system_prompt ?? ""),
    message: String(row.message ?? ""),
    prompt_version: String(row.prompt_version ?? PROMPT_VERSION),
    status: (["pending", "approved", "rejected", "sent"] as const).includes(row.status)
      ? row.status
      : "pending",
    approved_by: row.approved_by ? String(row.approved_by) : null,
    approved_at: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    sent_at: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
  };
}

// --- Deterministic classification -------------------------------------------

export const CLIENT_SIGNALS: RegExp[] = [
  /\b(quanto custa|qual o pre[çc]o|qual o valor|or[çc]amento|pre[çc]o|valores?)\b/i,
  /\b(interessad[oa]|tenho interesse|gostei|quero saber mais|quero contratar|quero comprar)\b/i,
  /\b(preciso de|estou precisando|procurando|estou buscando)\b/i,
  /\b(como funciona|como faz|d[áa] para fazer|tem disponibilidade|pode enviar)\b/i,
  /\b(agendar|agenda|marcar|marque|come[çc]ar|comece|fechar|fechemos)\b/i,
];

export const NOT_CLIENT_SIGNALS: RegExp[] = [
  /\b(n[ãa]o tenho interesse|n[ãa]o quero|n[ãa]o preciso|n[ãa]o [ée] o que procurava)\b/i,
  /\b(obrigad[oa][,!.]?\s*s[oó] estava (vendo|olhando|conferindo))\b/i,
  /\b(desisti|cancele?i|n[ãa]o faz mais sentido|n[ãa]o [ée] prioridade)\b/i,
  /\b(spam|n[ãa]o [ée] isso|errou|número errado|numero errado)\b/i,
];

export interface ClassificationResult {
  classification: Classification;
  score: number;
  reason: string;
}

/** Guardrail: no digit may appear in a generated outreach prompt. */
export function hasNumerals(text: string): boolean {
  return /\d/.test(String(text ?? ""));
}

function withoutNumerals(text: string): string {
  return String(text ?? "").replace(/\d+/g, "[número]");
}

/** Pure, testable. Confidence comes from explicit buying/refusal language. */
export function classifyTranscript(transcript: string): ClassificationResult {
  const text = String(transcript ?? "").slice(0, MAX_TRANSCRIPT);
  const positives = CLIENT_SIGNALS.filter((re) => re.test(text)).map((re) => re.source);
  const negatives = NOT_CLIENT_SIGNALS.filter((re) => re.test(text)).map((re) => re.source);
  const score = Math.max(
    -1,
    Math.min(1, 0.1 + positives.length * 0.25 - negatives.length * 0.4)
  );
  let classification: Classification = "unclear";
  if (negatives.length > 0 && negatives.length >= positives.length) {
    classification = "not_client";
  } else if (positives.length > 0 && score >= 0.5) {
    classification = "client";
  }
  // Qualitative on purpose: counts never leak into a prompt as digits.
  const parts: string[] = [];
  if (positives.length) parts.push("sinal(is) de interesse");
  if (negatives.length) parts.push("sinal(is) de recusa");
  if (!parts.length) parts.push("sem sinal explícito de interesse ou recusa");
  return {
    classification,
    score: Number(score.toFixed(3)),
    reason: parts.join("; "),
  };
}

// --- Prompt generation -------------------------------------------------------

/** Deterministic fallback: factual, brand-scoped, never promises a date/value. */
export function fallbackPrompts(
  brand: Brand,
  classified: ClassificationResult,
  transcript: string
): ConversationPrompts {
  const cfg = brandConfig(brand);
  const lines = String(transcript ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-12);
  const digest = lines.length
    ? lines.map((l) => `- ${l.slice(0, 220).replace(/\d+/g, "[número]")}`).join("\n")
    : "- (sem trecho relevante)";
  const confidence = classified.score >= 0.5 ? "alta" : classified.score <= 0 ? "baixa" : "média";

  const system_prompt = [
    `Você é o agente de follow-up da ${cfg.name}.`,
    `Tom: ${cfg.voice}.`,
    `Oferta (usar apenas o que estiver no briefing): ${cfg.offer}.`,
    "Regras absolutas: português brasileiro; nunca inventar preço, prazo, desconto, disponibilidade ou dados do cliente; nunca citar números; nunca prometer envio automático; responder de forma curta; se faltar informação, fazer uma pergunta objetiva.",
    `Classificação da conversa: ${classified.classification} (confiança ${confidence}). Motivo: ${classified.reason}.`,
    `Fala conhecida do cliente:\n${digest}`,
  ].join("\n");

  const message =
    classified.classification === "client"
      ? [
          `Oi! Aqui é ${cfg.operatorName}, da ${cfg.name}.`,
          "Fiquei com a impressão de que o assunto pode fazer sentido para vocês.",
          "Posso te mandar um resumo objetivo do que fazemos e tirar qualquer dúvida — sem compromisso. Prefere que eu envie por aqui mesmo?",
        ].join("\n")
      : [
          `Oi! Aqui é ${cfg.operatorName}, da ${cfg.name}.`,
          "Só queria confirmar se entendi bem antes de seguir: você prefere que eu não insista, certo?",
          "Se mudar de ideia, é só me chamar por aqui. Obrigado!",
        ].join("\n");

  return { system_prompt, message };
}

function llmConfig() {
  const baseUrl = process.env.LLM_BASE_URL ?? "http://127.0.0.1:8080/v1";
  const apiKey = process.env.LLM_API_KEY || "local";
  const model = process.env.LLM_MODEL ?? "karen";
  return { baseUrl, apiKey, model };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const raw = String(text ?? "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The model drafts; deterministic rules decide. If the model is unavailable,
 * returns the fallback. A model classification can only upgrade `unclear` to
 * `client` — it can never override an explicit refusal.
 */
export async function generatePrompts(
  brand: Brand,
  classified: ClassificationResult,
  transcript: string
): Promise<{ prompts: ConversationPrompts; classification: ClassificationResult; usedModel: boolean }> {
  const fallback = fallbackPrompts(brand, classified, transcript);
  const cfg = llmConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: fallback.system_prompt },
          {
            role: "user",
            content: [
              "A partir da conversa abaixo, devolva SOMENTE um JSON válido:",
              '{"classification":"client|not_client|unclear","reason":"curto","system_prompt":"...","message":"..."}',
              "Regras: não invente fatos; `message` é a resposta final ao cliente em até 4 linhas; `system_prompt` é a instrução do agente de follow-up.",
              `Classificação determinística: ${classified.classification} (${classified.score}). Não a altere para 'client' se houver recusa explícita.`,
              `CONVERSA (${brandConfig(brand).name}):\n${String(transcript ?? "").slice(0, MAX_TRANSCRIPT)}`,
            ].join("\n"),
          },
        ],
      }),
    });
    if (!response.ok) return { prompts: fallback, classification: classified, usedModel: false };
    const body: any = await response.json();
    const parsed = parseJsonObject(body?.choices?.[0]?.message?.content ?? "");
    if (!parsed) return { prompts: fallback, classification: classified, usedModel: false };

    const modelSystem =
      typeof parsed.system_prompt === "string" && parsed.system_prompt.trim().length >= 20
        ? parsed.system_prompt.trim().slice(0, 6000)
        : "";
    const modelMessage =
      typeof parsed.message === "string" && parsed.message.trim().length >= 10
        ? parsed.message.trim().slice(0, 4000)
        : "";
    // A model that cites a price, percentage, deadline or any other number is
    // rejected in favour of the deterministic, number-free template.
    const system_prompt = modelSystem && !hasNumerals(modelSystem) ? modelSystem : fallback.system_prompt;
    const message = modelMessage && !hasNumerals(modelMessage) ? modelMessage : fallback.message;

    let classification = classified.classification;
    let reason = classified.reason;
    if (parsed.classification === "client" && classification === "unclear") {
      classification = "client";
      reason = `Modelo: ${withoutNumerals(String(parsed.reason ?? "sinal de interesse")).slice(0, 240)}`;
    }
    return {
      prompts: { system_prompt, message },
      classification: { ...classified, classification, reason },
      usedModel: true,
    };
  } catch {
    return { prompts: fallback, classification: classified, usedModel: false };
  } finally {
    clearTimeout(timer);
  }
}

// --- Urgent action item (feeds send-alert.mjs --urgent) ----------------------

async function pushUrgentAction(row: ConversationRow, title: string): Promise<void> {
  let list: any[] = [];
  try {
    const parsed = JSON.parse(await readFile(ACTIONS, "utf8"));
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    /* file may not exist yet */
  }
  if (list.some((item) => item?.topic === `conversation:${row.id}`)) return;
  list.push({
    topic: `conversation:${row.id}`,
    title,
    steps: [
      `Abrir /app/?pane=conversations`,
      "Revisar o prompt de sistema e a mensagem gerada.",
      "Aprovar a entrega ou descartar. Nada é enviado automaticamente.",
    ],
    severity: "urgent",
    route: "/app/?pane=conversations",
  });
  await mkdir(dirname(ACTIONS), { recursive: true });
  const tmp = `${ACTIONS}.tmp`;
  await writeFile(tmp, `${JSON.stringify(list, null, 2)}\n`, "utf8");
  await rename(tmp, ACTIONS);
}

// --- Service ----------------------------------------------------------------

export class ConversationService {
  constructor(private readonly client: Client) {}

  async ingest(input: {
    brand: unknown;
    transcript: string;
    leadId?: string | null;
    source?: string;
    actor: string;
  }): Promise<{ item: ConversationRow; deduped: boolean; usedModel: boolean }> {
    if (!isBrand(input.brand)) throw new Error("Marca inválida. Use karen ou climara.");
    const brand: Brand = input.brand;
    const text = String(input.transcript ?? "").trim();
    if (text.length < 20) throw new Error("Transcript muito curto (mínimo 20 caracteres).");
    const transcript = redactSecrets(text).slice(0, MAX_TRANSCRIPT);
    const transcript_hash = createHash("sha256").update(`${brand}|${transcript}`).digest("hex");
    const leadId = input.leadId || null;

    const existing = await this.client.query(
      `SELECT ${COLUMNS} FROM lead_conversations
        WHERE transcript_hash = $1 AND brand = $2
          AND (($3::uuid IS NULL AND lead_id IS NULL) OR lead_id = $3::uuid)
        LIMIT 1`,
      [transcript_hash, brand, leadId]
    );
    if (existing.rowCount) {
      return { item: mapRow(existing.rows[0]), deduped: true, usedModel: false };
    }

    const classified = classifyTranscript(transcript);
    const generated = await generatePrompts(brand, classified, transcript);
    const cfg = brandConfig(brand);

    const inserted = await this.client.query(
      `INSERT INTO lead_conversations
        (lead_id, brand, source, transcript_hash, transcript, classification,
         score, reason, system_prompt, message, prompt_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        leadId,
        brand,
        String(input.source ?? "manual").slice(0, 40),
        transcript_hash,
        transcript,
        generated.classification.classification,
        generated.classification.score,
        generated.classification.reason.slice(0, 500),
        generated.prompts.system_prompt,
        generated.prompts.message,
        PROMPT_VERSION,
      ]
    );
    if (!inserted.rowCount) {
      const dupe = await this.client.query(
        `SELECT ${COLUMNS} FROM lead_conversations
          WHERE transcript_hash = $1 AND brand = $2 LIMIT 1`,
        [transcript_hash, brand]
      );
      return { item: mapRow(dupe.rows[0]), deduped: true, usedModel: false };
    }

    const item = mapRow(inserted.rows[0]);
    if (item.classification === "client") {
      await pushUrgentAction(item, `${cfg.name}: entrega crítica pronta para aprovação (${item.id.slice(0, 8)})`);
      // Confirm the linked lead so it leaves the generic outreach bucket.
      if (item.lead_id) {
        await this.client.query(
          `UPDATE leads SET confirmed_at = NOW(), confirmed_by = $2
            WHERE id = $1::uuid AND confirmed_at IS NULL`,
          [item.lead_id, String(input.actor).slice(0, 80)]
        );
      }
    }
    return { item, deduped: false, usedModel: generated.usedModel };
  }

  async list(brands: Brand[], limit = 50): Promise<ConversationRow[]> {
    const safe = brands.filter(isBrand);
    if (!safe.length) return [];
    const res = await this.client.query(
      `SELECT ${COLUMNS} FROM lead_conversations
        WHERE brand = ANY($1::text[])
        ORDER BY
          CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1
                      WHEN 'rejected' THEN 2 ELSE 3 END,
          created_at DESC
        LIMIT $2`,
      [safe, Math.min(Math.trunc(limit) || 50, 200)]
    );
    return res.rows.map(mapRow);
  }

  async decide(
    id: string,
    decision: "approve" | "reject",
    actor: string,
    brands: Brand[]
  ): Promise<ConversationRow | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("ID inválido.");
    const current = await this.client.query(
      `SELECT ${COLUMNS} FROM lead_conversations WHERE id = $1::uuid`,
      [id]
    );
    if (!current.rowCount) return null;
    const row = mapRow(current.rows[0]);
    if (!brands.includes(row.brand)) throw new Error("Sem acesso a essa marca.");
    const status: ConversationStatus = decision === "approve" ? "approved" : "rejected";
    const res = await this.client.query(
      `UPDATE lead_conversations
          SET status = $2, approved_by = $3, approved_at = NOW()
        WHERE id = $1::uuid
        RETURNING ${COLUMNS}`,
      [id, status, String(actor).slice(0, 80)]
    );
    return res.rowCount ? mapRow(res.rows[0]) : null;
  }
}
