import test from "node:test";
import assert from "node:assert/strict";

import { parseFrontmatter, parseLinks, slug } from "../build/services/notelinks.js";
import { COMMANDS, policyFor } from "../build/services/commands.js";
import { draftFor } from "../build/templates/outreach.js";
import { CanvasService } from "../build/services/canvas.js";
import { DashboardService } from "../build/services/dashboard.js";
import { DiagnosisService, formatDiagnosis } from "../build/services/diagnosis.js";
import { VaultService } from "../build/services/vault.js";
import { formatBrief } from "../build/services/brief.js";
import { pickSuggestions, memoryDraft } from "../scripts/lib/vault-garden.mjs";
import { findSecrets } from "../scripts/lib/secret-scan.mjs";
import { extractEntities } from "../scripts/lib/entities.mjs";
import { normalizePhone, buildWaLink, OutreachService } from "../build/services/outreach.js";
import { autoResolvable, summarizeResolutions } from "../scripts/lib/auto-resolve.mjs";
import { hasMutationIntent, isMutatingTool } from "../build/services/agent-guard.js";
import { redactSecrets } from "../build/services/redact.js";
import {
  hardPolicy,
  parseModelOutput,
  mergeClassifications,
  sanitizeText,
  summarize,
} from "../scripts/lib/eva-triage.mjs";

test("frontmatter and wikilinks parse correctly", () => {
  const meta = parseFrontmatter(
    "---\ntype: project\ncontext: college\nstatus: ativo\ndeadline: 2026-12-15\ntags: [estudos, seguranca]\n---\n# Plano"
  );
  assert.equal(meta.type, "project");
  assert.equal(meta.context, "college");
  assert.equal(meta.status, "ativo");
  assert.equal(meta.deadline, "2026-12-15");
  assert.deepEqual(parseLinks("veja [[Notas Atomicas]] e [[Jardim Digital|o jardim]]"), [
    "Notas Atomicas",
    "Jardim Digital",
  ]);
  assert.equal(slug("Método Zettelkasten"), "metodo-zettelkasten");
});

test('command policy maps read to auto and high-stakes writes to blocked', () => {
  assert.equal(policyFor({ id: 'health', risk: 'read' }), 'auto');
  assert.equal(policyFor({ id: 'build_ui', risk: 'write' }), 'propose');
  assert.equal(policyFor({ id: 'restart_api', risk: 'write' }), 'blocked');
  assert.equal(policyFor({ id: 'reload_web', risk: 'write' }), 'blocked');
  assert.ok(COMMANDS.every((c) => ['auto', 'propose', 'blocked'].includes(policyFor(c))));
  const buildUi = COMMANDS.find((c) => c.id === 'build_ui');
  assert.equal(buildUi.steps[0].cmd, '/usr/bin/bash');
  assert.ok(buildUi.steps[0].args[0].endsWith('deploy-ui.sh'));
});

test("command allowlist is safe and unique", () => {
  const ids = COMMANDS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const cmd of COMMANDS) {
    assert.ok(["read", "write"].includes(cmd.risk));
    for (const step of cmd.steps) {
      assert.ok(!/[;&|`$<>]/.test(step.cmd), `shell metachar in ${cmd.id}`);
      for (const arg of step.args) {
        assert.ok(!/[;&|`$<>]/.test(arg), `shell metachar in ${cmd.id}`);
      }
    }
  }
});

test("outreach drafts never put a link in the first touch", () => {
  const draft = draftFor(
    {
      title: "Pizzaria Exemplo",
      phone: null,
      address: null,
      neighborhood: "Centro",
      city: "Guarulhos",
      category: "pizza",
      rating: 4.5,
      reviewsCount: 30,
      website: null,
      placeId: "osm:node/1",
      mapsUrl: null,
      scrapedAt: "2026-01-01",
    },
    { operatorName: "Lucas", exampleLink: "[LINK]" }
  );
  assert.ok(!/https?:\/\/|www\./i.test(draft.firstTouch));
  assert.ok(draft.firstTouch.includes("Pizzaria Exemplo"));
  assert.ok(draft.followUp.includes("[LINK]"));
});

test("canvas export produces valid JSON Canvas 1.0 shape", async () => {
  const vault = {
    getGraph: async () => ({
      nodes: [
        { id: "a", name: "A", type: "note", description: "x", properties: { _x: 10, _y: 20 } },
        { id: "b", name: "B", type: "finding", description: "y", properties: {} },
      ],
      edges: [{ id: "e1", source_id: "a", target_id: "b", label: "relates_to" }],
    }),
  };
  const canvas = await new CanvasService({}, vault).export();
  assert.equal(canvas.nodes.length, 2);
  assert.equal(canvas.nodes[0].x, 10);
  assert.equal(canvas.nodes[0].type, "text");
  assert.equal(canvas.edges[0].fromNode, "a");
  assert.equal(canvas.edges[0].toEnd, "arrow");
});

test("dashboard attention mirrors queue policies and hides auto items", async () => {
  const client = { query: async () => ({ rows: [] }) };
  const notes = { decisions: async () => [] };
  const att = await new DashboardService(client, notes).attention();
  assert.ok(Array.isArray(att.items));
  assert.ok(att.items.every((item) => !item.detail.startsWith('[auto/')));
  assert.equal(att.total, att.items.length);
});

test("dashboard activity mixes sources", async () => {
  const client = {
    query: async () => ({
      rows: [{ command_id: "health", status: "ok", created_at: "2026-11-19T00:00:00Z" }],
    }),
  };
  const notes = {
    decisions: async () => [{ path: "decisions/x.md", text: "# Decisão X\n\n- Data: 2026-11-19" }],
  };
  const items = await new DashboardService(client, notes).activity();
  assert.ok(items.some((i) => i.kind === "command"));
  assert.ok(items.some((i) => i.kind === "decision"));
});

test('unified queue surfaces pending approvals without tokens', async () => {
  const { QueueService } = await import('../build/services/queue.js');
  const client = {
    query: async () => ({
      rows: [{
        id: '11111111-1111-1111-1111-111111111111',
        command_id: 'reload_web',
        risk: 'write',
        source: 'ui',
        created_at: '2026-11-21T12:00:00Z',
      }],
    }),
  };
  const queue = await new QueueService(client).attention();
  const cmd = queue.items.find((i) => i.source === 'command');
  assert.ok(cmd);
  assert.equal(cmd.severity, 'critical');
  assert.equal(cmd.policy, 'propose');
  assert.equal(cmd.route, '/app/?pane=commands');
  assert.ok(!JSON.stringify(queue).includes('approval_token'));
});

test('EVA triage guardrails force high-risk items to a human gate', () => {
  assert.equal(hardPolicy({ source: 'command', risk: 'write', title: 'x' }), 'blocked');
  assert.equal(hardPolicy({ source: 'command', risk: 'read', title: 'x' }), 'propose');
  assert.equal(hardPolicy({ source: 'action', title: 'Pagar fatura' }), 'blocked');
  assert.equal(hardPolicy({ source: 'key', title: 'Chave opcional', detail: 'APIFY_TOKEN' }), null);
  assert.equal(hardPolicy({ source: 'audit', title: 'Revisar dependências' }), null);
  assert.equal(
    hardPolicy({ source: 'note', detail: 'SMTP_APP_PASSWORD=supersecret123' }),
    'blocked'
  );
});

test('EVA triage sanitizes secrets and parses chatty model output', () => {
  assert.equal(
    sanitizeText('token=abc123 e Bearer xyz789'),
    '[redacted] e Bearer [redacted]'
  );
  const parsed = parseModelOutput(
    'Claro!\n```json\n[{"id":"a","policy":"auto","reason":"leitura","next_step":"ok"},' +
      '{"id":"b","policy":"nonsense"}]```'
  );
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].policy, 'auto');
  assert.equal(parsed[1].policy, 'propose');
  assert.deepEqual(parseModelOutput('sem json aqui'), []);
});

test('EVA triage merge never downgrades commands and counts policies', () => {
  const items = [
    { id: 'command:1', source: 'command', risk: 'write', title: 'Aprovar reload' },
    { id: 'key:APIFY_TOKEN', source: 'key', title: 'Chave opcional' },
    { id: 'audit:deps', source: 'audit', title: 'Revisar dependências' },
  ];
  const merged = mergeClassifications(items, [
    { id: 'command:1', policy: 'auto', reason: 'safe' },
    { id: 'key:APIFY_TOKEN', policy: 'auto', reason: 'optional' },
  ]);
  assert.equal(merged[0].policy, 'blocked');
  assert.equal(merged[0].forced, true);
  assert.equal(merged[1].policy, 'auto');
  assert.equal(merged[2].policy, 'propose');
  assert.deepEqual(summarize(merged), { total: 3, auto: 1, propose: 1, blocked: 1 });
});

test('agent blocks mutating tools unless the operator explicitly asks', () => {
  assert.equal(isMutatingTool('write_note'), true);
  assert.equal(isMutatingTool('remember'), true);
  assert.equal(isMutatingTool('decision_log'), true);
  assert.equal(isMutatingTool('search_kb'), false);
  assert.equal(hasMutationIntent('O que você sabe sobre SSRF?'), false);
  assert.equal(hasMutationIntent('Registre esta decisão no vault'), true);
  assert.equal(hasMutationIntent('Anote que o prazo é 15/12'), true);
});

test('embeddings redact credential-shaped text before sending it', () => {
  const out = redactSecrets('use cfat_abcdefghijklmnopqrst e password=supersecretvalue1234567890');
  assert.ok(out.includes('[REDACTED]'));
  assert.ok(!out.includes('cfat_abcdefghijklmnopqrst'));
  assert.ok(!out.includes('supersecretvalue1234567890'));
});

test('auto-resolve only closes informational items and audits them', () => {
  assert.equal(autoResolvable({ source: 'key', policy: 'auto', forced: false }), true);
  assert.equal(autoResolvable({ source: 'action', policy: 'auto', forced: false }), false);
  assert.equal(autoResolvable({ source: 'command', policy: 'auto', forced: true }), false);
  assert.equal(autoResolvable({ source: 'key', policy: 'propose', forced: false }), false);
  assert.deepEqual(
    summarizeResolutions([{ source: 'key' }, { source: 'key' }]),
    { total: 2, bySource: { key: 2 } }
  );
});

test('outreach handoff builds wa.me links without sending or storing the operator number', async () => {
  // Fake lead phone only — the operator's personal number never enters the repo.
  assert.equal(normalizePhone('(11) 97777-1234'), '5511977771234');
  assert.equal(normalizePhone('1133334444'), '551133334444');
  assert.equal(normalizePhone(null), null);
  const link = buildWaLink('(11) 97777-1234', 'Oi, tudo bem?');
  assert.ok(link.startsWith('https://wa.me/5511977771234?text='));
  assert.ok(link.includes(encodeURIComponent('Oi, tudo bem?')));
  assert.ok(buildWaLink(null, 'teste').startsWith('https://wa.me/?text='));

  const client = {
    query: async () => ({
      rows: [{
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: 'Pizzaria Exemplo',
        phone: null,
        draft: { firstTouch: 'Oi!', followUp: 'Oi de novo', model: 'vizinho' },
        created_at: '2026-11-23T00:00:00Z',
      }],
    }),
  };
  const items = await new OutreachService(client).items();
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'ready');
  assert.ok(items[0].wa_link.startsWith('https://wa.me/?text='));
});

test('entity extraction deduplicates CVEs and known tools', () => {
  const found = extractEntities(
    'Veja CVE-2026-1234 e CVE-2026-1234 em OWASP e Nmap com nmap.',
    ['OWASP', 'Nmap', 'Burp Suite']
  );
  assert.deepEqual(found.cves, ['CVE-2026-1234']);
  assert.deepEqual(found.tools, ['OWASP', 'Nmap']);
});

test('secret scan reports pattern and line without leaking the value', () => {
  const findings = findSecrets(
    'token: cfat_abcdefghijklmnopqrst\n# example: cfat_xxxxxxxxxxxxxxxxxxxx\npassword=supersecretvalue1234567890',
    'nota.md'
  );
  assert.equal(findings.length, 2);
  assert.equal(findings[0].line, 1);
  assert.equal(findings[0].pattern, 'cloudflare_token');
  assert.ok(!JSON.stringify(findings).includes('cfat_abcdefghijklmnopqrst'));
  assert.ok(!JSON.stringify(findings).includes('supersecretvalue1234567890'));
});

test('EVA brief renders pending decisions and next steps', () => {
  const text = formatBrief({
    generated_at: '2026-11-23T00:00:00Z',
    date: '2026-11-23',
    headline: '1 decisão(ões) pendente(s) · 2 tratadas pela EVA · 1 oportunidade(s)',
    needs_you: [{ title: 'Aprovar reload', detail: 'comando write', policy: 'blocked', severity: 'critical', route: '/app/?pane=commands' }],
    handled: 2,
    opportunities: [{ title: 'Oferta X', score: 4, needs: ['seguranca'] }],
    garden: { orphans: 8, with_candidates: 6, draft_lines: 1 },
    deadlines: [{ note: 'projeto.md', date: '2026-12-01', days_left: 8 }],
    stale_decisions: [{ path: 'decisions/2026-11-01-x.md', days: 22 }],
    outreach_ready: 3,
    hygiene_proposals: 7,
    applied: { proposals: 20, backlinks: 58 },
    changes: { generated_at: '2026-11-23T00:00:00Z', nodes_added: 2, nodes_removed: 0, nodes_changed: 1, edges_added: 3, edges_removed: 0, first_run: false },
    auth: { total_failures: 8000, suspicious_ips: 3, top_ip: '203.0.113.9' },
    watch: { opportunity_age_days: 9, stale_opportunities: true, leads_without_draft: 2, sync: '1 embeddings' },
    health: 'API active',
    decisions: [],
    next_steps: ['Revisar bloqueios'],
  });
  assert.ok(text.includes('EVA — BRIEF DE 2026-11-23'));
  assert.ok(text.includes('[blocked/critical] Aprovar reload'));
  assert.ok(text.includes('1. Revisar bloqueios'));
  assert.ok(text.includes('projeto.md em 8d') || text.includes('2026-12-01'));
  assert.ok(text.includes('22d sem desfecho'));
  assert.ok(text.includes('Leads sem firstTouch: 2'));
  assert.ok(text.includes('Mensagens prontas (envio manual): 3'));
  assert.ok(text.includes('Propostas de higiene pendentes: 7 (aplicadas: 20)'));
  assert.ok(text.includes('Backlinks aplicados com auditoria: 58'));
  assert.ok(text.includes('+2 -0 ~1 nós'));
  assert.ok(text.includes('3 IP(s) suspeito(s) · top: 203.0.113.9'));
  assert.ok(text.includes('API active'));
});

test('vault garden produces suggestions and drafts without mutations', () => {
  const picked = pickSuggestions(
    [
      { id: 'a', name: 'A', score: 0.91 },
      { id: 'b', name: 'B', score: 0.40 },
      { id: 'c', name: 'C', score: 0.77 },
      { id: 'd', name: 'D', score: Number.NaN },
    ],
    0.55,
    2
  );
  assert.deepEqual(picked.map((p) => p.id), ['a', 'c']);
  const draft = memoryDraft(
    '# Memória\n\n- decisions/antiga.md: Já registrado',
    [
      { path: 'decisions/nova.md', text: '# Nova decisão\n\n- Data: 2026-11-23' },
      { path: 'decisions/antiga.md', text: '# Já registrado' },
    ]
  );
  assert.deepEqual(draft, ['- decisions/nova.md: Nova decisão']);
});

test('vault search fuses full-text and ILIKE results via RRF', async () => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes('websearch_to_tsquery')) {
        return { rows: [{ id: 'fts', name: 'Hit FTS' }] };
      }
      if (sql.includes('ILIKE')) {
        return { rows: [{ id: 'like', name: 'Hit ILIKE' }] };
      }
      return { rows: [] };
    },
  };
  const rows = await new VaultService(client, null).searchNodes('teste', undefined, 5);
  assert.equal(rows.length, 2);
  assert.ok(calls.some((sql) => sql.includes('ts_rank_cd')));
});

test('diagnosis collects whitelisted state without secrets', async () => {
  const client = {
    query: async (sql) => {
      if (sql.includes('COUNT(*)::int AS total')) {
        return { rows: [{ total: 10, seedling: 2, budding: 3, evergreen: 4, stale: 1 }] };
      }
      return { rows: [] };
    },
  };
  const report = await new DiagnosisService(client).report();
  assert.ok(typeof report.services.api === 'string');
  assert.equal(report.garden.notes, 10);
  assert.equal(typeof report.attention.total, 'number');
  assert.ok(report.issues instanceof Array);
  const text = JSON.stringify(report);
  assert.ok(!/DATABASE_URL=|APP_PASSWORD=|API_KEY=[A-Za-z0-9]/.test(text));
  assert.ok(formatDiagnosis(report).includes('DIAGNÓSTICO — KAREN'));
});
