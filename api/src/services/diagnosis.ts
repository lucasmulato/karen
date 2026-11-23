/**
 * Read-only self-diagnosis for KAREN.
 *
 * Deterministic collection of the system's own state: services, timers, llama
 * performance, queue/triage counters, garden health, security advisories and
 * backup age. The LLM only narrates this object — it never supplies the facts.
 * Whitelisted fields only: no env values, tokens, args or stack traces escape.
 */
import { execFileSync } from "node:child_process";
import { connect as tlsConnect } from "node:tls";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Client } from "pg";
import { QueueService } from "./queue.js";
import { GardenService } from "./garden.js";

const UNAVAILABLE = "indisponível";
const CACHE_MS = 60_000;
const DATA = "/home/admin/karen/api/data";
const TRIAGE = process.env.KAREN_TRIAGE_JSON ?? `${DATA}/eva-triage.json`;
const AUDIT = process.env.KAREN_AUDIT_JSON ?? `${DATA}/dependency-audit.json`;
const BENCH = `${DATA}/llama-bench.jsonl`;
const UNIT = "/etc/systemd/system/karen-llama.service";
const PUBLIC_HOST = process.env.KAREN_PUBLIC_HOST ?? "";
const BACKUPS = "/home/admin/karen-backups";

export interface DiagnosisReport {
  generated_at: string;
  services: Record<string, string>;
  timers: string[];
  llama: {
    health: string;
    rss_mib: number | string;
    context: number | string;
    threads: number | string;
    bench:
      | { label: string; at: string; prompt_tps: number; gen_tps: number; rss_mib: number }
      | string;
  };
  attention: { total: number; auto: number; propose: number; blocked: number } | string;
  triage:
    | { generated_at: string; total: number; auto: number; propose: number; blocked: number }
    | string;
  garden: { notes: number; orphans: number; evergreen: number; stale: number } | string;
  security: { critical: number; high: number; cert_days: number | string } | string;
  backups: { latest: string; age_hours: number } | string;
  issues: string[];
}

async function attempt<T>(
  label: string,
  issues: string[],
  fn: () => Promise<T> | T
): Promise<T | string> {
  try {
    return await fn();
  } catch {
    issues.push(label);
    return UNAVAILABLE;
  }
}

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    timeout: 5_000,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function services(issues: string[]): Record<string, string> {
  try {
    const units = ["karen-api.service", "karen-llama.service", "karen-eva-triage.timer"];
    const names = ["api", "llama", "eva_triage"];
    const out = run("systemctl", ["is-active", ...units]).split("\n");
    const result: Record<string, string> = {};
    names.forEach((name, i) => {
      result[name] = (out[i] ?? "").trim() || UNAVAILABLE;
    });
    return result;
  } catch {
    issues.push("serviços");
    return { api: UNAVAILABLE, llama: UNAVAILABLE, eva_triage: UNAVAILABLE };
  }
}

function timers(issues: string[]): string[] {
  try {
    return run("systemctl", ["list-timers", "karen-*", "--no-pager"])
      .split("\n")
      .filter((line) => line.includes("karen-"))
      .slice(0, 4)
      .map((line) => line.replace(/\s+/g, " ").trim().slice(0, 140));
  } catch {
    issues.push("timers");
    return [UNAVAILABLE];
  }
}

async function llama(issues: string[]): Promise<DiagnosisReport["llama"]> {
  const health = await attempt("llama health", issues, async () => {
    const res = await fetch("http://127.0.0.1:8080/health", {
      signal: AbortSignal.timeout(2_500),
    });
    return res.ok ? "ok" : "error";
  });
  const rss_mib = await attempt("llama RSS", issues, async () => {
    const pid = run("pgrep", ["-f", "llama-server.*karen"]).split("\n")[0];
    const status = await readFile(`/proc/${pid}/status`, "utf8");
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
    if (!match) throw new Error("VmRSS ausente");
    return Math.round(Number(match[1]) / 1024);
  });
  const config = await attempt("config llama", issues, async () => {
    const text = await readFile(UNIT, "utf8");
    const context = text.match(/-c\s+(\d+)/);
    const threads = text.match(/-t\s+(\d+)/);
    return {
      context: context ? Number(context[1]) : UNAVAILABLE,
      threads: threads ? Number(threads[1]) : UNAVAILABLE,
    };
  });
  const bench = await attempt("benchmark", issues, async () => {
    const lines = (await readFile(BENCH, "utf8")).trim().split("\n").filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
    return {
      label: String(last.label ?? ""),
      at: String(last.at ?? ""),
      prompt_tps: Number(last.median_prompt_tps ?? 0),
      gen_tps: Number(last.median_gen_tps ?? 0),
      rss_mib: Math.round(Number(last.median_rss_kb ?? 0) / 1024),
    };
  });
  return {
    health: typeof health === "string" ? health : UNAVAILABLE,
    rss_mib,
    context: typeof config === "string" ? UNAVAILABLE : config.context,
    threads: typeof config === "string" ? UNAVAILABLE : config.threads,
    bench,
  };
}

let cache: { at: number; report: DiagnosisReport } | null = null;

export class DiagnosisService {
  constructor(private readonly client: Client) {}

  async report(): Promise<DiagnosisReport> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.report;
    const issues: string[] = [];
    const [attention, triage, garden, security, backups] = await Promise.all([
      attempt("fila", issues, async () => {
        const items = await new QueueService(this.client).items();
        const count = (policy: string) => items.filter((i) => i.policy === policy).length;
        return {
          total: items.length,
          auto: count("auto"),
          propose: count("propose"),
          blocked: count("blocked"),
        };
      }),
      attempt("triagem EVA", issues, async () => {
        const data = (await readJson(TRIAGE)) ?? {};
        const summary = data.summary ?? {};
        return {
          generated_at: String(data.generated_at ?? ""),
          total: Number(summary.total ?? 0),
          auto: Number(summary.auto ?? 0),
          propose: Number(summary.propose ?? 0),
          blocked: Number(summary.blocked ?? 0),
        };
      }),
      attempt("jardim", issues, async () => {
        const data = await new GardenService(this.client).data();
        return {
          notes: data.total,
          orphans: data.orphans.length,
          evergreen: data.evergreen,
          stale: data.stale,
        };
      }),
      attempt("auditoria", issues, async () => {
        const audit = (await readJson(AUDIT)) ?? {};
        // Read the served certificate over TLS — no root needed for letsencrypt files.
        const cert_days = await attempt(
          "certificado",
          issues,
          () =>
            new Promise<number>((resolve, reject) => {
              if (!PUBLIC_HOST) {
                reject(new Error("KAREN_PUBLIC_HOST não configurado"));
                return;
              }
              const socket = tlsConnect(
                {
                  host: PUBLIC_HOST,
                  port: 443,
                  servername: PUBLIC_HOST,
                  rejectUnauthorized: false,
                },
                () => {
                  const validTo = socket.getPeerCertificate().valid_to;
                  socket.end();
                  if (!validTo) {
                    reject(new Error("validade ausente"));
                    return;
                  }
                  resolve(
                    Math.floor((Date.parse(validTo) - Date.now()) / 86_400_000)
                  );
                }
              );
              socket.setTimeout(4_000, () => {
                socket.destroy();
                reject(new Error("TLS timeout"));
              });
              socket.on("error", reject);
            })
        );
        return {
          critical: Number(audit?.totals?.critical ?? 0),
          high: Number(audit?.totals?.high ?? 0),
          cert_days,
        };
      }),
      attempt("backups", issues, async () => {
        const entries = await readdir(BACKUPS);
        const files = entries
          .filter((name) => /^\d{4}-\d{2}-\d{2}-db\.sql\.gz\.enc$/.test(name))
          .sort();
        if (!files.length) throw new Error("sem backups");
        const latest = files[files.length - 1];
        const info = await stat(resolve(BACKUPS, latest));
        return {
          latest,
          age_hours: Math.max(0, Math.round((Date.now() - info.mtimeMs) / 3_600_000)),
        };
      }),
    ]);

    const report: DiagnosisReport = {
      generated_at: new Date().toISOString(),
      services: services(issues),
      timers: timers(issues),
      llama: await llama(issues),
      attention,
      triage,
      garden,
      security,
      backups,
      issues,
    };
    cache = { at: Date.now(), report };
    return report;
  }
}

async function readJson(path: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function show(value: unknown): string {
  return typeof value === "string"
    ? value
    : JSON.stringify(value ?? UNAVAILABLE);
}

/** Plain-text rendering for `/diagnosis` typed in any chat client. */
export function formatDiagnosis(report: DiagnosisReport): string {
  const s = report.services;
  const l = report.llama;
  const bench = typeof l.bench === "string" ? l.bench : l.bench.label;
  return [
    "DIAGNÓSTICO — KAREN",
    `Gerado em: ${report.generated_at}`,
    "",
    `Serviços: API ${s.api ?? UNAVAILABLE} · modelo ${s.llama ?? UNAVAILABLE} · triagem ${s.eva_triage ?? UNAVAILABLE}`,
    `Modelo: ${bench} · contexto ${show(l.context)} · threads ${show(l.threads)}`,
    `RSS: ${show(l.rss_mib)} MiB · health ${l.health}`,
    `Fila: ${show(report.attention)}`,
    `Triagem EVA: ${show(report.triage)}`,
    `Jardim: ${show(report.garden)}`,
    `Segurança: ${show(report.security)}`,
    `Backups: ${show(report.backups)}`,
    report.timers.length ? `Próximos timers:\n- ${report.timers.join("\n- ")}` : "",
    report.issues.length
      ? `Fontes indisponíveis: ${report.issues.join(", ")}`
      : "Todas as fontes responderam.",
  ]
    .filter(Boolean)
    .join("\n");
}
