#!/usr/bin/env node
/**
 * EVA's weekly strategy review: deterministic, read-only, e-mail delivered.
 * Combines credit opportunities, open actions, decision history and note health
 * into the EVA decision format. No account creation, spending or secret data.
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import nodemailer from "nodemailer";
import { Client } from "pg";
import { pendingApprovals } from "./lib/pending-approvals.mjs";

const DATA = "/home/admin/karen/api/data";
const VAULT = process.env.KAREN_VAULT_DIR || "/home/admin/models/karen-vault";
const REPORT = resolve(`${DATA}/eva-weekly-review.json`);
const DRY = process.argv.includes("--dry-run");
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";

async function readJson(name) {
  try { return JSON.parse(await readFile(`${DATA}/${name}`, "utf8")); } catch { return null; }
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
    const evergreen = await client.query(
      `SELECT COUNT(*)::int AS n FROM nodes WHERE properties->>'maturity' = 'evergreen'`
    );
    return { orphans: orphans.rows[0].n, evergreen: evergreen.rows[0].n };
  } finally { await client.end(); }
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

async function main() {
  const [credits, actions, audit, osUpdates] = await Promise.all([
    readJson("credit-recommendations.json"),
    readJson("action-items.json"),
    readJson("dependency-audit.json"),
    readJson("os-updates.json"),
  ]);
  const garden = await gardenStats();
  const approvals = await pendingApprovals();
  const decisions = (await readdir(`${VAULT}/decisions`).catch(() => []))
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse()
    .slice(0, 5);

  const top = (credits?.priorities ?? []).slice(0, 3);
  const open = actions ?? [];
  const date = credits?.date ?? new Date().toISOString().slice(0, 10);
  const subject = `EVA · Revisão semanal · ${date}`;

  const html = [
    `<h2>EVA — revisão semanal</h2>`,
    `<p><b>Contexto:</b> ${esc(credits?.generated_at ?? date)} · decisões recentes: ${decisions.length} · ações abertas: ${open.length} · aprovações: ${approvals}</p>`,
    `<h3>Decisões da semana</h3>`,
    ...(top.length
      ? top.map((p, i) => [
          `<p>🎯 <b>Decisão ${i + 1}:</b> ${esc(p.title)}</p>`,
          `<p>📌 <b>Contexto:</b> score ${p.score} · necessidades: ${esc((p.needs ?? []).join(", "))}</p>`,
          `<p>⚖️ <b>Trade-off:</b> benefício potencial × tempo de verificação em fonte oficial.</p>`,
          `<p>✅ <b>Próximo passo:</b> confirmar elegibilidade no canal oficial antes de qualquer inscrição.</p>`,
        ].join(""))
      : [`<p>Nenhuma oportunidade nova — semana calma é gestão também.</p>`]),
    `<h3>Saúde do sistema</h3>`,
    `<ul>`,
    `<li>Notas órfãs: ${garden.orphans} · evergreen: ${garden.evergreen}</li>`,
    `<li>Dependências: ${audit?.totals?.critical ?? 0} critical / ${audit?.totals?.high ?? 0} high</li>`,
    `<li>Atualizações do sistema: ${osUpdates?.count ?? 0}</li>`,
    `<li>Ações abertas: ${open.length}</li>`,
    `<li>Aprovações pendentes: ${approvals} — /app/?pane=commands</li>`,
    `</ul>`,
    `<h3>Decisões registradas</h3>`,
    `<ul>${decisions.map((d) => `<li>${esc(d)}</li>`).join("") || "<li>nenhuma</li>"}</ul>`,
    `<hr><small>EVA — co-sócia da KAREN · relatório determinístico, sem segredos.</small>`,
  ].join("");

  const summary = {
    generated_at: new Date().toISOString(),
    date,
    subject,
    opportunities: top.map((p) => p.title),
    openActions: open.length,
    garden,
    decisions,
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(summary, null, 2), "utf8");

  if (DRY) {
    console.log(`SUBJECT: ${subject}`);
    console.log(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200));
    return;
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!user || !pass) throw new Error("SMTP não configurado.");
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transporter.sendMail({
    from: user,
    to: process.env.REPORT_TO || user,
    subject,
    html,
  });
  console.log(`EVA weekly review sent to ${process.env.REPORT_TO || user}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
