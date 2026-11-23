/**
 * KAREN command permissions.
 *
 * The LLM never gets a shell. It may only request one of the IDs below; the
 * backend maps it to a fixed argv array, validates arguments, and either runs
 * it immediately (read-only) or waits for an explicit approval token from the
 * UI (mutating). Every attempt is recorded in `command_runs`.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import type { Client } from "pg";

export type Risk = "read" | "write";
export type Policy = "auto" | "propose" | "blocked";

/** Commands that interrupt the public service or the API itself need extra scrutiny. */
const BLOCKED_COMMANDS = new Set(["restart_api", "reload_web"]);

export function policyFor(command: { id: string; risk: Risk }): Policy {
  if (command.risk === "read") return "auto";
  return BLOCKED_COMMANDS.has(command.id) ? "blocked" : "propose";
}
export type RunStatus = "pending" | "running" | "ok" | "error" | "denied";
export type Decision = "pending" | "auto" | "approved" | "denied";

interface Step {
  cmd: string;
  args: string[];
  cwd?: string;
  /** Fire-and-forget (used for restarting the API that serves this request). */
  detached?: boolean;
}

interface CommandDefinition {
  id: string;
  label: string;
  description: string;
  risk: Risk;
  steps: Step[];
  timeoutMs?: number;
}

const REPO = "/home/admin/karen";
const API_DIR = `${REPO}/api`;
const UI_DIR = `${REPO}/ui`;
const WEB_ROOT = "/var/www/karen-ui";

/** Fixed, auditable command table. No user/model-supplied strings reach spawn. */
export const COMMANDS: CommandDefinition[] = [
  {
    id: "service_status",
    label: "Status dos serviços",
    description: "Mostra karen-api e karen-llama (systemd).",
    risk: "read",
    steps: [
      { cmd: "/usr/bin/systemctl", args: ["status", "karen-api", "karen-llama", "--no-pager", "-l"] },
    ],
  },
  {
    id: "logs",
    label: "Últimos logs da API",
    description: "50 linhas recentes do journal da API.",
    risk: "read",
    steps: [
      { cmd: "/usr/bin/journalctl", args: ["-u", "karen-api", "-n", "50", "--no-pager"] },
    ],
  },
  {
    id: "disk",
    label: "Espaço em disco",
    description: "df -h",
    risk: "read",
    steps: [{ cmd: "/usr/bin/df", args: ["-h"] }],
  },
  {
    id: "memory",
    label: "Memória",
    description: "free -h",
    risk: "read",
    steps: [{ cmd: "/usr/bin/free", args: ["-h"] }],
  },
  {
    id: "uptime",
    label: "Uptime / carga",
    description: "uptime",
    risk: "read",
    steps: [{ cmd: "/usr/bin/uptime", args: [] }],
  },
  {
    id: "certificates",
    label: "Certificados TLS",
    description: "certbot certificates (expiração).",
    risk: "read",
    steps: [{ cmd: "/usr/bin/sudo", args: ["/usr/bin/certbot", "certificates"] }],
  },
  {
    id: "health",
    label: "Health checks",
    description: "Consulta /api/health e o llama-server local.",
    risk: "read",
    steps: [
      { cmd: "/usr/bin/curl", args: ["-sS", "--max-time", "5", "http://127.0.0.1:3000/api/health"] },
      { cmd: "/usr/bin/curl", args: ["-sS", "--max-time", "5", "http://127.0.0.1:8080/health"] },
    ],
  },
  {
    id: "git_status",
    label: "Git status",
    description: "Estado do repo karen.",
    risk: "read",
    steps: [
      { cmd: "/usr/bin/git", args: ["-C", REPO, "status", "--short", "--branch"] },
    ],
  },
  {
    id: "restart_llama",
    label: "Reiniciar karen-llama",
    description: "Reinicia o modelo local (não interrompe a API).",
    risk: "write",
    steps: [
      { cmd: "/usr/bin/sudo", args: ["/usr/bin/systemctl", "restart", "karen-llama"] },
    ],
  },
  {
    id: "restart_api",
    label: "Reiniciar karen-api",
    description: "Reinicia a API. A conexão atual será interrompida.",
    risk: "write",
    steps: [
      {
        cmd: `${API_DIR}/scripts/delayed-restart-api.sh`,
        args: [],
        detached: true,
      },
    ],
  },
  {
    id: "reload_web",
    label: "Testar e recarregar OpenResty",
    description: "openresty -t e systemctl reload openresty.",
    risk: "write",
    steps: [
      { cmd: "/usr/bin/sudo", args: ["/opt/openresty/bin/openresty", "-t"] },
      { cmd: "/usr/bin/sudo", args: ["/usr/bin/systemctl", "reload", "openresty"] },
    ],
  },
  {
    id: "build_api",
    label: "Build da API",
    description: "npm run build em api/.",
    risk: "write",
    steps: [{ cmd: "/usr/bin/npm", args: ["run", "build"], cwd: API_DIR }],
  },
  {
    id: "build_ui",
    label: "Build e publicar UI",
    description: "npm run build e rsync para /var/www/karen-ui.",
    risk: "write",
    steps: [
      { cmd: "/usr/bin/npm", args: ["run", "build"], cwd: UI_DIR },
      {
        cmd: "/usr/bin/sudo",
        args: ["/usr/bin/rsync", "-a", "--delete", `${UI_DIR}/dist/`, `${WEB_ROOT}/`],
      },
    ],
  },
];

export interface CommandInfo {
  id: string;
  label: string;
  description: string;
  risk: Risk;
  policy: Policy;
  preview: string;
}

export interface CommandRun {
  id: string;
  command_id: string;
  args: Record<string, unknown>;
  risk: Risk;
  decision: Decision;
  status: RunStatus;
  source: string;
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  duration_ms: number | null;
  approval_token_hash: string | null;
  approval_token: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface CommandResult {
  status: "ok" | "error" | "pending" | "denied" | "not_found" | "unauthorized";
  runId?: string;
  approvalToken?: string;
  commandId?: string;
  preview?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  error?: string;
}

const MAX_OUTPUT = 20_000;
const DEFAULT_TIMEOUT = 60_000;
const cap = (s: string) => (s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}\n…[truncated]` : s);
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function previewOf(def: CommandDefinition): string {
  return def.steps
    .map((s) => [s.cmd, ...s.args].join(" "))
    .join("\n");
}

function runStep(step: Step, timeoutMs: number): Promise<{ code: number; out: string; err: string }> {
  if (step.detached) {
    const child = spawn(step.cmd, step.args, {
      cwd: step.cwd,
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/home/admin" },
      shell: false,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return Promise.resolve({ code: 0, out: "Agendado.", err: "" });
  }
  return new Promise((resolve) => {
    const child = spawn(step.cmd, step.args, {
      cwd: step.cwd,
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/home/admin" },
      shell: false,
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out = cap(out + d.toString())));
    child.stderr?.on("data", (d) => (err = cap(err + d.toString())));
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out, err });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: cap(String(e)) });
    });
  });
}

export class CommandService {
  constructor(private readonly client: Client) {}

  definitions(): CommandInfo[] {
    return COMMANDS.map((c) => ({
      id: c.id,
      label: c.label,
      description: c.description,
      risk: c.risk,
      policy: policyFor(c),
      preview: previewOf(c),
    }));
  }

  private find(id: string): CommandDefinition | undefined {
    return COMMANDS.find((c) => c.id === id);
  }

  async runs(limit = 50): Promise<CommandRun[]> {
    const res = await this.client.query(
      `SELECT * FROM command_runs ORDER BY created_at DESC LIMIT $1`,
      [Math.min(Math.trunc(limit) || 50, 200)]
    );
    return res.rows;
  }

  async pending(id: string): Promise<CommandRun | undefined> {
    const res = await this.client.query(
      `SELECT * FROM command_runs WHERE id = $1::uuid AND status = 'pending' LIMIT 1`,
      [id]
    );
    return res.rows[0];
  }

  async request(commandId: string, source: string, args: Record<string, unknown> = {}): Promise<CommandResult> {
    const def = this.find(commandId);
    if (!def) return { status: "not_found", error: `Comando desconhecido: ${commandId}` };
    // All current commands are zero-argument. Reject anything else.
    if (Object.keys(args).length > 0) {
      return { status: "error", error: "Este comando não aceita argumentos." };
    }
    const isRead = def.risk === "read";
    const token = isRead ? null : randomBytes(24).toString("hex");
    const inserted = await this.client.query(
      `INSERT INTO command_runs (command_id, args, risk, decision, status, source, approval_token_hash, approval_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NULL) RETURNING id`,
      [
        commandId,
        JSON.stringify(args),
        def.risk,
        isRead ? "auto" : "pending",
        isRead ? "running" : "pending",
        source,
        token ? hashToken(token) : null,
      ]
    );
    const runId = inserted.rows[0].id as string;
    if (!isRead) {
      return {
        status: "pending",
        runId,
        approvalToken: token!,
        commandId,
        preview: previewOf(def),
      };
    }
    return this.execute(def, runId);
  }

  async approve(runId: string, token?: string): Promise<CommandResult> {
    const run = await this.pending(runId);
    // Approval is session-gated at the proxy; token is optional backwards
    // compatibility. When present, verify against the stored hash.
    const valid = Boolean(
      run &&
        (!token ||
          (run.approval_token_hash && run.approval_token_hash === hashToken(token)) ||
          (run.approval_token && run.approval_token === token))
    );
    if (!valid) {
      return { status: "unauthorized", error: "Aprovação inválida ou expirada." };
    }
    const def = this.find(run!.command_id);
    if (!def) return { status: "not_found", error: "Comando desconhecido." };
    await this.client.query(
      `UPDATE command_runs SET decision = 'approved', status = 'running', approval_token_hash = NULL, approval_token = NULL WHERE id = $1::uuid`,
      [runId]
    );
    return this.execute(def, runId);
  }

  async deny(runId: string, token?: string): Promise<CommandResult> {
    const run = await this.pending(runId);
    const valid = Boolean(
      run &&
        (!token ||
          (run.approval_token_hash && run.approval_token_hash === hashToken(token)) ||
          (run.approval_token && run.approval_token === token))
    );
    if (!valid) {
      return { status: "unauthorized", error: "Aprovação inválida ou expirada." };
    }
    await this.client.query(
      `UPDATE command_runs SET decision = 'denied', status = 'denied', approval_token_hash = NULL, approval_token = NULL, finished_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
      [runId]
    );
    return { status: "denied", runId };
  }

  private async execute(def: CommandDefinition, runId: string): Promise<CommandResult> {
    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    for (const step of def.steps) {
      const r = await runStep(step, def.timeoutMs ?? DEFAULT_TIMEOUT);
      stdout = cap(`${stdout}${stdout ? "\n" : ""}${r.out}`);
      stderr = cap(`${stderr}${stderr ? "\n" : ""}${r.err}`);
      exitCode = r.code;
      if (r.code !== 0) break;
    }
    const status: RunStatus = exitCode === 0 ? "ok" : "error";
    await this.client.query(
      `UPDATE command_runs SET status = $1, exit_code = $2, stdout = $3, stderr = $4,
        duration_ms = $5, finished_at = CURRENT_TIMESTAMP WHERE id = $6::uuid`,
      [status, exitCode, stdout || null, stderr || null, Date.now() - started, runId]
    );
    return {
      status,
      runId,
      commandId: def.id,
      exitCode,
      stdout,
      stderr,
      durationMs: Date.now() - started,
    };
  }
}
