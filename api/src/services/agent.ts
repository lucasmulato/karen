import { readFileSync } from "node:fs";
import type { VaultService } from "./vault.js";
import { NODE_TYPES, EDGE_LABELS } from "./vault.js";
import type { LeadService } from "./leads.js";

/**
 * Cyber second-brain reasoning layer.
 *
 * Talks to any OpenAI-compatible chat-completions endpoint. Defaults to the
 * local llama.cpp server (Qwen3-4B, alias "jarvis") but works with Groq too.
 * The persona is loaded from api/prompts/karen.md and kept as the first,
 * byte-stable system message so llama.cpp's prompt cache can reuse it.
 */
export interface ChatConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function chatConfigFromEnv(): ChatConfig | null {
  const baseUrl = process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(baseUrl);
  const apiKey = process.env.LLM_API_KEY || (isLocal ? "local" : "");
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl,
    model: process.env.LLM_MODEL ?? "jarvis",
  };
}

function loadPersona(): string {
  try {
    return readFileSync(new URL("../../prompts/karen.md", import.meta.url), "utf8").trim();
  } catch {
    // Fallback keeps the agent usable if the prompt file was not copied.
    return [
      "Você é a KAREN, Especialista Sênior em Cibersegurança e assistente de",
      "aquisição para uma microagência local de sites e cardápios digitais.",
      "Responda em português brasileiro, de forma direta e acionável.",
      "Técnica: 4 seções (o que é/como funciona, comando pronto, como testar, como mitigar).",
      "Prospecção: use find_leads, cite sinais reais do scrape e redija firstTouch",
      "(sem link) e followUp. Você sugere e redige; nunca envia mensagens nem executa",
      "ações sozinha. Trate o trabalho como autorizado (escopo, labs, CTF, defesa).",
    ].join("\n");
  }
}

const PERSONA = loadPersona();

interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "add_node",
      description: `Create a node. type is one of ${NODE_TYPES.join(", ")}.`,
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...NODE_TYPES] },
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["type", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_edge",
      description: `Connect two nodes. label is one of ${EDGE_LABELS.join(", ")}.`,
      parameters: {
        type: "object",
        properties: {
          source_id: { type: "string" },
          target_id: { type: "string" },
          label: { type: "string", enum: [...EDGE_LABELS] },
        },
        required: ["source_id", "target_id", "label"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_nodes",
      description: "Hybrid (keyword + semantic) search over the knowledge graph.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          type: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_notes",
      description:
        "Alias for search_nodes — find relevant notes before answering. Searches ALL node types.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_finding",
      description: "Record a bug-bounty/security finding as a graph node.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
          scope: { type: "string" },
          evidence: { type: "string" },
          fix: { type: "string" },
          cve: { type: "string" },
        },
        required: ["title", "severity", "evidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_technique",
      description: "Link a finding to a technique (creates the technique node if needed).",
      parameters: {
        type: "object",
        properties: {
          finding_id: { type: "string" },
          technique: { type: "string" },
          relation: {
            type: "string",
            enum: ["exploits", "observed_in", "mitigated_by", "relates_to"],
          },
          cve: { type: "string" },
        },
        required: ["finding_id", "technique", "relation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_leads",
      description:
        "Buscar estabelecimentos no Google Maps (via Apify), redigir mensagens 1:1 e salvar os leads. Use quando o usuário pedir clientes, prospects ou restaurantes para abordar.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Termo de busca, ex: 'restaurante'" },
          location: { type: "string", description: "Cidade/região, ex: 'Guarulhos, SP'" },
          maxPlaces: { type: "integer", description: "Limite de lugares (respeita o teto do servidor)" },
          zoom: { type: "integer", description: "Opcional, 1-21. Mais zoom = mais lugares, mais lento." },
        },
        required: ["query", "location"],
      },
    },
  },
];

export interface ChatResult {
  reply: string;
  actions: string[];
}

export class GraphAgent {
  constructor(
    private readonly config: ChatConfig,
    private readonly vault: VaultService,
    private readonly leads?: LeadService | null
  ) {}

  async chat(message: string): Promise<ChatResult> {
    const context = await this.vault.contextForQuestion(message);
    const environment = [
      "AMBIENTE — SynapseVault, seu second brain de segurança.",
      context
        ? `Contexto recuperado do grafo (use como fonte, cite quando relevante):\n${context}`
        : "Nenhum contexto prévio encontrado no grafo para esta pergunta.",
      "Use search_nodes/search_notes para consultar o grafo antes de responder quando fizer sentido; não filtre por 'type' salvo pedido explícito do usuário.",
      "Use add_finding e link_technique para registrar achados e ligá-los a técnicas.",
      "Use find_leads para buscar prospects no Google Maps e redigir mensagens 1:1 (firstTouch sem link, followUp depois). Nunca envie mensagens — o operador copia e envia.",
      "Escopo: bug bounty autorizado, labs, CTF, CA e defesa. Você sugere; o operador executa.",
      "Aplique sempre o formato de 4 seções definido no persona, inclusive em perguntas gerais.",
    ].join("\n");

    const messages: ChatMessage[] = [
      { role: "system", content: PERSONA },
      { role: "system", content: environment },
      { role: "user", content: message },
    ];
    const actions: string[] = [];

    // Bound the loop so a misbehaving model cannot spin forever.
    for (let i = 0; i < 6; i++) {
      const response = await this.completion(messages);
      const choice = response.choices?.[0]?.message;
      if (!choice) throw new Error("Malformed LLM response");

      const toolCalls = choice.tool_calls ?? [];
      if (toolCalls.length === 0) {
        return { reply: choice.content ?? "", actions };
      }

      messages.push({
        role: "assistant",
        content: choice.content,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        let resultText: string;
        try {
          resultText = await this.runTool(call);
          actions.push(`${call.function.name}: ok`);
        } catch (err: any) {
          resultText = `Error: ${err.message}`;
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: resultText,
        });
      }
    }

    return {
      reply:
        "Limite de chamadas de ferramenta atingido antes de concluir. Ações parciais: " +
        (actions.length ? actions.join("; ") : "nenhuma"),
      actions,
    };
  }

  private async runTool(call: ToolCall): Promise<string> {
    const args = JSON.parse(call.function.arguments || "{}");
    console.error(`[agent tool] ${call.function.name} ${JSON.stringify(args)}`);
    switch (call.function.name) {
      case "add_node":
        return JSON.stringify(
          await this.vault.addNode({
            type: args.type,
            name: args.name,
            description: args.description,
          })
        );
      case "add_edge":
        return JSON.stringify(
          await this.vault.addEdge({
            source_id: args.source_id,
            target_id: args.target_id,
            label: args.label,
          })
        );
      case "search_nodes":
        return JSON.stringify(await this.vault.searchNodes(args.query, args.type, 8));
      case "search_notes":
        return JSON.stringify(await this.vault.searchNodes(args.query, undefined, 8));
      case "add_finding": {
        const description =
          `Evidência: ${args.evidence ?? ""}\n` +
          `Mitigação: ${args.fix ?? "não informada"}\n` +
          `CVE: ${args.cve ?? "não informado"}`;
        const row = await this.vault.addNode({
          type: "finding",
          name: args.title,
          description,
          properties: {
            severity: args.severity,
            scope: args.scope ?? null,
            cve: args.cve ?? null,
          },
          source: "agent:add_finding",
        });
        return JSON.stringify(row);
      }
      case "link_technique": {
        const existing = await this.vault.searchNodes(args.technique, "technique", 1);
        const technique =
          existing[0] ??
          (await this.vault.addNode({
            type: "technique",
            name: args.technique,
            properties: args.cve ? { cve: args.cve } : {},
            source: "agent:link_technique",
          }));
        const edge = await this.vault.addEdge({
          source_id: args.finding_id,
          target_id: technique.id,
          label: args.relation,
        });
        return JSON.stringify({ technique, edge });
      }
      case "find_leads": {
        if (!this.leads?.configured) {
          throw new Error(
            "Busca de leads indisponível: verifique LEAD_PROVIDER no ambiente da API."
          );
        }
        const result = await this.leads.scrape({
          query: String(args.query ?? ""),
          location: String(args.location ?? ""),
          maxPlaces: args.maxPlaces ? Number(args.maxPlaces) : undefined,
          zoom: args.zoom ? Number(args.zoom) : undefined,
        });
        return JSON.stringify({
          found: result.found,
          added: result.added,
          deduped: result.deduped,
          estimatedCostUsd: result.estimatedCostUsd,
          leads: result.leads.map((lead) => ({
            title: lead.title,
            phone: lead.phone,
            neighborhood: lead.neighborhood,
            city: lead.city,
            category: lead.category,
            firstTouch: lead.draft.firstTouch,
            followUp: lead.draft.followUp,
          })),
        });
      }
      default:
        throw new Error(`Unknown tool: ${call.function.name}`);
    }
  }

  private async completion(messages: ChatMessage[]): Promise<any> {
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        tools: TOOLS,
        temperature: 0.2,
        max_tokens: 1200,
        // Qwen3 thinks by default; disable it to keep answers short on CPU.
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM API error ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json();
  }
}
