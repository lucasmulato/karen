import test from "node:test";
import assert from "node:assert/strict";

import { parseFrontmatter, parseLinks, slug } from "../build/services/notelinks.js";
import { COMMANDS } from "../build/services/commands.js";
import { draftFor } from "../build/templates/outreach.js";
import { CanvasService } from "../build/services/canvas.js";
import { DashboardService } from "../build/services/dashboard.js";
import { DiagnosisService, formatDiagnosis } from "../build/services/diagnosis.js";
import { VaultService } from "../build/services/vault.js";
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
