#!/usr/bin/env node
/**
 * Sends the deterministic digest at 09:00 and, with --evening, at 21:00.
 * Includes the credit report, aggregate note counts and open action items —
 * no secrets, tokens or values are put in the message.
 * Use --dry-run to render without sending.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import nodemailer from "nodemailer";
import { Client } from "pg";
import { pendingApprovals } from "./lib/pending-approvals.mjs";

const OUTPUT = resolve(
  process.env.KAREN_CREDIT_JSON || "/home/admin/karen/api/data/credit-recommendations.json"
);
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const DRY = process.argv.includes("--dry-run");
const EVENING = process.argv.includes("--evening");
const ACTIONS = resolve("/home/admin/karen/api/data/action-items.json");
const ENV_FILE = resolve(process.env.KAREN_ENV_FILE || "/home/admin/models/karen.env");
const OPTIONAL_KEYS = ["APIFY_TOKEN", "CLOUDFLARE_API_TOKEN"];
const TRIAGE = resolve(process.env.KAREN_TRIAGE_JSON || "/home/admin/karen/api/data/eva-triage.json");
const GARDEN = resolve(process.env.KAREN_GARDEN_JSON || "/home/admin/karen/api/data/vault-maintenance.json");

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

async function gardenStats() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const orphans = await client.query(
      `SELECT COUNT(*)::int AS n FROM nodes x
        WHERE x.source NOT LIKE 'kb:%'
          AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.source_id = x.id OR e.target_id = x.id)`
    );
    const stale = await client.query(
      `SELECT COUNT(*)::int AS n FROM nodes
        WHERE source NOT LIKE 'kb:%' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '30 days'`
    );
    const notes = await client.query(
      `SELECT COUNT(*)::int AS n FROM nodes WHERE source NOT LIKE 'kb:%'`
    );
    return {
      orphans: orphans.rows[0].n,
      stale: stale.rows[0].n,
      notes: notes.rows[0].n,
    };
  } finally {
    await client.end();
  }
}

async function pendingItems() {
  try {
    const items = JSON.parse(await readFile(ACTIONS, "utf8"));
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

async function triageSummary() {
  try {
    const data = JSON.parse(await readFile(TRIAGE, "utf8"));
    return data?.summary ?? null;
  } catch { return null; }
}

async function gardenMaintenance() {
  try {
    const data = JSON.parse(await readFile(GARDEN, "utf8"));
    return {
      orphans: Number(data.orphans_total ?? 0),
      withCandidates: Number(data.with_candidates ?? 0),
      draft: Array.isArray(data.memory_draft) ? data.memory_draft.length : 0,
    };
  } catch { return null; }
}

async function missingOptionalKeys() {
  let envText = "";
  try { envText = await readFile(ENV_FILE, "utf8"); } catch { /* ignore */ }
  return OPTIONAL_KEYS.filter((name) => {
    if (Boolean(process.env[name]?.trim())) return false;
    return !new RegExp(`^${name}=(.+)$`, "m").test(envText);
  });
}

async function main() {
  const report = JSON.parse(await readFile(OUTPUT, "utf8"));
  let mode = "karen";
  try {
    const modeText = await readFile("/home/admin/models/karen-vault/MODE.md", "utf8");
    mode = /active_mode:\s*eva/i.test(modeText) ? "eva" : "karen";
  } catch { /* ignore */ }
  const stats = await gardenStats();
  const top = report.priorities?.slice(0, 3) ?? [];
  const changes = report.changes?.length ?? 0;
  const pending = await pendingItems();
  const optionalMissing = await missingOptionalKeys();
  const approvals = await pendingApprovals();
  const triage = await triageSummary();
  const garden = await gardenMaintenance();
  const subject = EVENING
    ? `KAREN · noite · ${report.date} · ${approvals} aprovações, ${top.length} prioridades`
    : `KAREN · ${report.date} · ${approvals} aprovações, ${top.length} prioridades`;
  const sections = [
    `<h2>Créditos e prazos</h2>`,
    top.length
      ? `<ol>${top.map((p) => `<li>${escapeHtml(p.title)} <small>(score ${p.score})</small></li>`).join("")}</ol>`
      : `<p>Nada pendente hoje.</p>`,
    `<p>Mudanças detectadas: ${changes}. Ação humana necessária: confirmar cada oferta no canal oficial.</p>`,
    `<h2>O que fazer</h2>`,
    `<ol>`,
    ...(top.length
      ? top.map((p) => `<li>Confirmar em canal oficial: ${escapeHtml(p.title)}.</li>`)
      : [`<li>Nada pendente em créditos hoje.</li>`]),
    `<li>Revisar notas órfãs no Hub quando tiver 10 minutos.</li>`,
    `</ol>`,
    `<h2>Jardim</h2>`,
    `<p>${stats.notes} notas no grafo · ${stats.orphans} órfãs · ${stats.stale} paradas há 30+ dias.</p>`,
    `<h2>Uma sugestão</h2>`,
    `<p>${top[0] ? `Avaliar primeiro: ${escapeHtml(top[0].title)}.` : "Nenhuma ação prioritária — dia calmo."}</p>`,
    `<h2>Aprovações pendentes</h2>`,
    approvals
      ? `<p><b>${approvals}</b> comando(s) aguardando sua decisão. Abrir: /app/?pane=commands</p>`
      : `<p>Nenhuma aprovação pendente.</p>`,
    ...(triage
      ? [
          `<h2>EVA · triagem noturna</h2>`,
          `<p>${triage.total} item(ns) triados: <b>${triage.auto}</b> resolvidos automaticamente, ` +
            `<b>${triage.propose}</b> precisam da sua decisão, <b>${triage.blocked}</b> bloqueados por regra de segurança. ` +
            `A triagem nunca executa ações — itens "auto" são apenas leitura/reversíveis.</p>`,
        ]
      : []),
    ...(garden
      ? [
          `<h2>EVA · jardim</h2>`,
          `<p>${garden.orphans} notas órfãs, ${garden.withCandidates} com sugestões de backlink e ${garden.draft} linha(s) de rascunho para MEMORY.md. ` +
            `Nada foi aplicado automaticamente — revisar em api/data/vault-maintenance.json.</p>`,
        ]
      : []),
    `<h2>Pendências</h2>`,
    pending.length
      ? `<ul>${pending.map((p) => `<li><b>${escapeHtml(p.title)}</b>${p.steps?.length ? `<ul>${p.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>`
      : `<p>Nada pendente.</p>`,
    `<h2>Configuração opcional</h2>`,
    optionalMissing.length
      ? `<p>Sem configurar: ${optionalMissing.map(escapeHtml).join(", ")}. Não são necessários para o uso básico.</p>`
      : `<p>Tudo configurado.</p>`,
    `<hr><small>${mode === "eva" ? "EVA — co-sócia da KAREN" : "KAREN — seu assistente"} · Relatório determinístico. Nenhum segredo é enviado por e-mail.</small>`,
  ];
  const html = `<div style="font-family:system-ui,sans-serif;max-width:640px">${sections.join("")}</div>`;

  if (DRY) {
    console.log(`SUBJECT: ${subject}`);
    console.log(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    return;
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  const to = process.env.REPORT_TO || user;
  if (!user || !pass) {
    const pending = [
      "# Pendência de envio de e-mail — KAREN",
      "",
      `Detectado em: ${new Date().toISOString()}`,
      "SMTP_USER e/ou SMTP_APP_PASSWORD não configurados. Nenhum e-mail foi enviado.",
      "",
      "O que fazer:",
      "1. Conta Google → Segurança → Verificação em 2 etapas → Senhas de app.",
      "2. Gerar uma app password para 'Mail'.",
      "3. Preencher SMTP_USER, SMTP_APP_PASSWORD e REPORT_TO em /home/admin/models/karen.env.",
      "4. Reiniciar: sudo systemctl restart karen-morning.service",
      "",
      `Digest de hoje (sem envio): ${subject}`,
      "",
    ].join("\n");
    const pendingPath = resolve("/home/admin/karen/api/data/email-setup-pending.md");
    await mkdir(dirname(pendingPath), { recursive: true });
    await writeFile(pendingPath, pending, "utf8");
    console.error("ERRO: SMTP não configurado — nenhum e-mail enviado. Pendência registrada em data/email-setup-pending.md");
    process.exitCode = 1;
    return;
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: user,
    to,
    subject,
    html,
  });
  console.log(`Morning digest sent to ${to}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
