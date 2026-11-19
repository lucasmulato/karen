#!/usr/bin/env node
/**
 * Sends the deterministic morning digest. Reads only the daily credit report
 * and aggregate note counts — no secrets, tokens or registry contents go into
 * the message. Use --dry-run to render without sending.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import nodemailer from "nodemailer";
import { Client } from "pg";

const OUTPUT = resolve(
  process.env.KAREN_CREDIT_JSON || "/home/admin/karen/api/data/credit-recommendations.json"
);
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const DRY = process.argv.includes("--dry-run");

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

async function main() {
  const report = JSON.parse(await readFile(OUTPUT, "utf8"));
  const stats = await gardenStats();
  const top = report.priorities?.slice(0, 3) ?? [];
  const changes = report.changes?.length ?? 0;
  const subject = `KAREN · ${report.date} · ${top.length} prioridades, ${changes} mudanças`;
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
    `<hr><small>Relatório automático e determinístico. Nenhum segredo é enviado por e-mail.</small>`,
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
