/**
 * Deterministic fast path for routine questions. Answers only from local
 * reports; anything ambiguous or requiring reasoning falls back to the LLM.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Client } from "pg";
import { QueueService } from "./queue.js";
import { DiagnosisService } from "./diagnosis.js";

const DATA = "/home/admin/karen/api/data";
export type Intent = "status" | "notes" | "self" | "queue" | "brief" | "cve" | "auth" | "leads" | "deadlines";

const RULES: { intent: Intent; re: RegExp }[] = [
  // No trailing \b: accented endings are not \\w in JS without the u flag.
  { intent: "status", re: /\b(como você está|como vc está|tudo ok|saúde do sistema|status do sistema|serviços estão)/i },
  { intent: "notes", re: /\b(quantas notas|número de notas|notas no vault|notas temos)/i },
  { intent: "self", re: /\b(o que você fez|o que fez hoje|suas ações|o que foi feito|o que andou fazendo)/i },
  { intent: "queue", re: /\b(aprov[aç]ões pendentes|o que preciso decidir|fila de aprovação|pendências|o que está pendente)/i },
  { intent: "brief", re: /\b(resumo da situação|me d[eê] um briefing|brief da eva|o que fazer hoje)/i },
  { intent: "cve", re: /\b(cves novos|cves novas|vulnerabilidades novas|novas cves)/i },
  { intent: "auth", re: /\b(ips suspeitos|tentativas de login|falhas de ssh|logins falhos)/i },
  { intent: "leads", re: /\b(mensagens prontas|leads prontos|rascunhos de mensagem)/i },
  { intent: "deadlines", re: /\b(prazos?|deadlines?|vence(m)? (em breve|logo)|o que vem a seguir)/i },
];

/** Reasoning requests must never be intercepted by the fast path. */
const REASONING = /\b(por que|explique|analise|compare|e se|como funciona|o que acha|você acha)\b/i;

export function matchIntent(message: string): Intent | null {
  const text = String(message ?? "").trim();
  if (!text || text.length > 180 || REASONING.test(text)) return null;
  for (const rule of RULES) if (rule.re.test(text)) return rule.intent;
  return null;
}

async function readJson(path: string): Promise<any | null> {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

export interface FastPathResult { intent: Intent; reply: string }

export async function fastPath(message: string, client: Client, diagnosis: DiagnosisService): Promise<FastPathResult | null> {
  const intent = matchIntent(message);
  if (!intent) return null;

  switch (intent) {
    case "status": {
      const d = await diagnosis.report();
      const s = d.services;
      const l = d.llama;
      const cert = typeof d.security === "string" ? "?" : d.security.cert_days;
      const reply = [
        `API ${s.api ?? "?"} · modelo ${s.llama ?? "?"} · triagem ${s.eva_triage ?? "?"}.`,
        `llama ${l.health} · RSS ${String(l.rss_mib)} MiB · certificado ${String(cert)} dias.`,
        d.issues.length ? `Fontes indisponíveis: ${d.issues.join(", ")}.` : "Todas as fontes responderam.",
      ].join(" ");
      return { intent, reply };
    }
    case "notes": {
      const idx = await readJson(`${DATA}/note-index.json`);
      return { intent, reply: `Há ${idx?.total ?? 0} notas no vault (índice com ${idx?.recent?.length ?? 0} recentes).` };
    }
    case "self": {
      const model = await readJson(`${DATA}/self-model.json`);
      const l = model?.last_24h ?? {};
      return {
        intent,
        reply:
          `Registrei ${model?.recent_actions?.length ?? 0} ações no log: ` +
          `${l.resolved ?? 0} itens informativos resolvidos, ${l.backlinks ?? 0} backlinks aplicados, ` +
          `${l.hygiene ?? 0} propostas de higiene e ${l.drafts ?? 0} rascunhos.`,
      };
    }
    case "queue": {
      const items = await new QueueService(client).items();
      const blocked = items.filter((i) => i.policy === "blocked").length;
      const propose = items.filter((i) => i.policy === "propose").length;
      return {
        intent,
        reply: items.length
          ? `Há ${items.length} item(ns) na fila: ${propose} precisam da sua decisão e ${blocked} estão bloqueados por regra.`
          : "Fila vazia — nada esperando por você.",
      };
    }
    case "brief": {
      const triage = await readJson(`${DATA}/eva-triage.json`);
      const model = await readJson(`${DATA}/self-model.json`);
      return {
        intent,
        reply:
          `Resumo: ${model?.recent_actions?.length ?? 0} ações registradas, ` +
          `${triage?.summary?.auto ?? 0} itens resolvidos automaticamente, ` +
          `${triage?.summary?.propose ?? 0} aguardando decisão, ` +
          `${triage?.summary?.blocked ?? 0} bloqueados.`,
      };
    }
    case "cve": {
      const data = await readJson(`${DATA}/cve-watch.json`);
      return { intent, reply: `O watchlist tem ${data?.total ?? 0} CVE(s) na janela, sendo ${data?.new?.length ?? 0} novo(s) desde a última execução.` };
    }
    case "auth": {
      const data = await readJson(`${DATA}/auth-correlation.json`);
      return { intent, reply: `${data?.total_failures ?? 0} falhas SSH em 24h de ${data?.distinct_ips ?? 0} IPs; ${data?.suspicious_ips?.length ?? 0} suspeitos. Nenhum bloqueio automático.` };
    }
    case "leads": {
      const res = await client.query(
        "SELECT COUNT(*)::int AS n FROM leads WHERE suppressed = FALSE AND draft->>'firstTouch' IS NOT NULL AND draft->>'firstTouch' <> ''"
      );
      return { intent, reply: `${res.rows[0]?.n ?? 0} mensagem(ns) pronta(s) para envio manual no painel Mensagens.` };
    }
    case "deadlines": {
      const root = process.env.KAREN_VAULT_DIR || "/home/admin/models/karen-vault";
      const found: { note: string; date: string; days_left: number }[] = [];
      async function walk(dir: string) {
        let entries;
        try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) { await walk(full); continue; }
          if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
          try {
            const text = await readFile(full, "utf8");
            const front = text.match(/^---\n([\s\S]*?)\n---/);
            const date = front?.[1].match(/^deadline:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
            if (!date) continue;
            const days = Math.ceil((Date.parse(date) - Date.now()) / 86_400_000);
            if (days >= -1 && days <= 30) found.push({ note: entry.name, date, days_left: days });
          } catch { /* skip */ }
        }
      }
      await walk(root);
      found.sort((a, b) => a.days_left - b.days_left);
      if (!found.length) return { intent, reply: "Nenhum prazo nos próximos 30 dias." };
      return {
        intent,
        reply: found
          .slice(0, 4)
          .map((d) => `${d.date} (${d.days_left}d): ${d.note}`)
          .join(" · "),
      };
    }
  }
}
