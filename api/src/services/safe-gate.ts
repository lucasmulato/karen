/**
 * SAFE-AI gate used by the Climara pipeline (Fase 5).
 * Every command the operator pipeline wants to run is evaluated first.
 * REJECT stops; ASK_HUMAN goes to the Executive Queue; PERMIT proceeds.
 */
export type GateDecision = "PERMIT" | "REJECT" | "ASK_HUMAN";

export interface GateResult {
  decision: GateDecision;
  reason: string;
  request_id: string | null;
}

interface FetchLike {
  (url: string, init?: Record<string, unknown>): Promise<{
    ok: boolean;
    json(): Promise<unknown>;
  }>;
}

const DEFAULT_URL = process.env.SAFE_AI_URL ?? "http://127.0.0.1:8000";

export async function evaluateCommand(
  command: string,
  opts: { url?: string; fetchImpl?: FetchLike; user?: string; agent?: string } = {}
): Promise<GateResult> {
  const url = opts.url ?? DEFAULT_URL;
  const doFetch = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  try {
    const response = await doFetch(`${url.replace(/\/$/, "")}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command,
        user: opts.user ?? "lucas",
        agent: opts.agent ?? "karen-pipeline",
      }),
    });
    if (!response.ok) {
      return { decision: "REJECT", reason: "Gateway indisponível (fail-closed).", request_id: null };
    }
    const body = (await response.json()) as Record<string, unknown>;
    const decision = body.decision as GateDecision;
    if (decision !== "PERMIT" && decision !== "REJECT" && decision !== "ASK_HUMAN") {
      return { decision: "REJECT", reason: "Decisão desconhecida do gateway.", request_id: null };
    }
    return {
      decision,
      reason: String(body.reason ?? ""),
      request_id: typeof body.request_id === "string" ? body.request_id : null,
    };
  } catch {
    return { decision: "REJECT", reason: "Falha de comunicação com o gateway (fail-closed).", request_id: null };
  }
}

export function requiresHuman(decision: GateDecision): boolean {
  return decision === "ASK_HUMAN";
}
