#!/usr/bin/env node
/**
 * Event-driven KAREN alerts. Runs hourly; sends only for real action items:
 * source changes, approaching deadlines or missing critical keys. Cooldown of
 * 24h per topic prevents spam. Never prints or sends secret values.
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import nodemailer from "nodemailer";

const REPORT = resolve(
  process.env.KAREN_CREDIT_JSON || "/home/admin/karen/api/data/credit-recommendations.json"
);
const STATE = resolve("/home/admin/karen/api/data/alert-state.json");
const PENDING = resolve("/home/admin/karen/api/data/email-setup-pending.md");
const ENV_FILE = resolve(process.env.KAREN_ENV_FILE || "/home/admin/models/karen.env");
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DRY = process.argv.includes("--dry-run");

const CRITICAL_KEYS = [
  ["SMTP_USER", "configurar e-mail da KAREN"],
  ["SMTP_APP_PASSWORD", "configurar e-mail da KAREN"],
  ["KAREN_API_KEY", "restaurar autenticação da API"],
  ["APIFY_TOKEN", "opcional: leads pagos (necessário só se LEAD_PROVIDER=apify)"],
  ["CLOUDFLARE_API_TOKEN", "opcional: buscas semânticas com embeddings"],
];

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

function missingKeys(envText) {
  return CRITICAL_KEYS.filter(([name]) => {
    const inEnv = Boolean(process.env[name]?.trim());
    const inFile = new RegExp(`^${name}=(.+)$`, "m").test(envText);
    return !inEnv && !inFile;
  });
}

async function main() {
  let envText = "";
  try { envText = await readFile(ENV_FILE, "utf8"); } catch { /* ignore */ }
  let report = null;
  try { report = JSON.parse(await readFile(REPORT, "utf8")); } catch { /* ignore */ }

  const items = [];
  if (report?.changes?.length) {
    items.push({
      topic: "credit-changes",
      title: `${report.changes.length} mudança(s) em fontes oficiais`,
      steps: report.changes.map((c) => `Confirmar ${c.url} (HTTP ${c.from} → ${c.to}).`),
    });
  }
  for (const [name, reason] of missingKeys(envText)) {
    items.push({
      topic: `missing-key:${name}`,
      title: `${name} não configurado — ${reason}`,
      steps: [
        `Gerar/obter o valor de ${name}.`,
        `Preencher em ${ENV_FILE} (fora do repo).`,
        `Reiniciar os serviços: sudo systemctl restart karen-api karen-morning.service`,
      ],
    });
  }

  let state = {};
  if (await exists(STATE)) {
    try { state = JSON.parse(await readFile(STATE, "utf8")); } catch { /* ignore */ }
  }
  const now = Date.now();
  const due = items.filter((item) => {
    const last = state[item.topic];
    return !last || now - Date.parse(last) > COOLDOWN_MS;
  });

  if (due.length === 0) {
    console.log("KAREN alert: nada novo (cooldown).");
    return;
  }

  const subject = `KAREN · ALERTA · ${due.length} item(ns) para você`;
  const body = [
    "<h2>KAREN — o que precisa de você</h2>",
    ...due.map(
      (item) =>
        `<h3>${item.title}</h3><ol>${item.steps.map((s) => `<li>${s}</li>`).join("")}</ol>`
    ),
    "<hr><small>Alerta automático. Nenhum segredo é enviado por e-mail.</small>",
  ].join("");

  if (DRY) {
    console.log(`SUBJECT: ${subject}`);
    console.log(body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    return;
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!user || !pass) {
    const pending = [
      "# Pendência de envio de e-mail — KAREN",
      "",
      `Detectado em: ${new Date().toISOString()}`,
      "SMTP não configurado. Alertas não enviados.",
      "",
      "O que fazer:",
      "1. Gerar app password Gmail (Conta Google → Segurança → 2FA → Senhas de app).",
      "2. Preencher SMTP_USER e SMTP_APP_PASSWORD em /home/admin/models/karen.env.",
      "3. Reiniciar: sudo systemctl restart karen-alerts.service",
      "",
      `Alertas pendentes: ${due.map((d) => d.topic).join(", ")}`,
    ].join("\n");
    await mkdir(dirname(PENDING), { recursive: true });
    await writeFile(PENDING, pending, "utf8");
    console.error("ERRO: SMTP não configurado — alertas não enviados.");
    process.exitCode = 1;
    return;
  }

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transporter.sendMail({ from: user, to: process.env.REPORT_TO || user, subject, html: body });
  for (const item of due) state[item.topic] = new Date().toISOString();
  await mkdir(dirname(STATE), { recursive: true });
  await writeFile(STATE, JSON.stringify(state, null, 2), "utf8");
  console.log(`KAREN alert sent: ${due.map((d) => d.topic).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
