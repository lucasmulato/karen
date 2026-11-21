# KAREN — local-first AI second brain & security copilot

![license](https://img.shields.io/badge/license-MIT-blue)
![stack](https://img.shields.io/badge/stack-Node%20%2B%20React%20%2B%20PostgreSQL-blueviolet)
![cost](https://img.shields.io/badge/running%20cost-US%240-green)

KAREN is an always-on, self-hosted assistant built around a plain-markdown
second brain, a PostgreSQL knowledge graph and a local 4B model. It is equally
comfortable discussing SSRF, organising your notes, finding local business
leads or running allowlisted operational commands.

**What KAREN is**
- a cyber/security copilot with a large ingested knowledge base;
- an Obsidian-compatible notes hub with wikilinks, backlinks and a note map;
- a lead-generation helper that drafts outreach but never sends it;
- an operator assistant with an approval gate for every mutating command.

**What KAREN is not**
- it does not send WhatsApp messages or create accounts by itself;
- it does not sign up for paid services or store API keys in the repository;
- it does not execute arbitrary shell commands — only a fixed allowlist.

> Repository of the KAREN project (formerly the SynapseVault experiment).

## Private demo

A running instance is available at **https://karen.164.68.109.252.sslip.io/**
(free wildcard DNS, Let's Encrypt TLS). The root is a public landing page; the
assistant lives at `/app/` behind a **session login** (user `karen`). Client
proposals are public only via unguessable `/portal/<token>` links. Personal
instance — please do not probe or abuse it.

## Architecture

| Layer | Technology |
|---|---|
| Storage | PostgreSQL + pgvector (nodes, edges, leads, command audit) |
| Gateway | Node.js — MCP stdio server **and** HTTP REST in one process |
| Interface | React 19 + Vite + Tailwind + D3 |
| Reasoning | local llama.cpp server with Qwen3-4B (`karen`, `--jinja`) |
| Notes | plain `.md` files in a vault outside the repository |
| Security KB | ~7,500 ingested chunks from OWASP, MITRE and PayloadsAllTheThings |
| Optional | Cloudflare Workers AI embeddings (free tier) |

Everything runs locally; the only outbound calls are the free OSM geocoding /
Overpass queries, NVD CVE lookups and optional Cloudflare embeddings.

## Features

### Notes hub (main view)
The app opens full-width on the Hub:
- type / tag filters, note stats, most-linked notes and orphan detection;
- `[[wikilinks]]` rendered as clickable links with a backlinks panel;
- **Arquivos**: vault tree, markdown editor and `Ler`/`Editar` toggle;
- **Mapa**: D3 graph of note-to-note links with the same legend/tooltip/reset as the main graph;
- **Projetos**: `type: project` notes with status/context/deadline, sorted by deadline.
- **Jardim**: maturity (seedling → budding → evergreen), stale and orphan notes;
- **Canvas**: export/import the graph as JSON Canvas 1.0 (`.canvas`).

A note with `graph_id: <uuid>` in its frontmatter is synced into the Postgres
graph; wikilinks become `relates_to` edges.

### Knowledge graph
- Interactive D3 force graph with saved positions, labels, hover tooltips, legend and zoom-reset.
- `Notas | Grafo` switch in the header. Bridged Obsidian notes are hidden from the graph by default and can be toggled back on.
- Cyber taxonomy: findings, techniques, CVEs, tools, writeups, targets and fixes.

### Security knowledge base
`search_kb` searches the ingested OWASP (WSTG, Cheat Sheets, MASVS, MASTG),
PayloadsAllTheThings, MITRE ATT&CK and CAPEC chunks; `lookup_cve` queries NVD
on demand. Sources, licences and attribution are recorded in
[docs/security-sources.md](docs/security-sources.md).

### Leads (free by default)
OpenStreetMap (Nominatim + Overpass) finds local businesses at no cost. Each
lead gets two ready-to-copy WhatsApp messages — first touch **without a link**,
follow-up for 24–48h later. Sending is always manual. Phone numbers can be
added by hand, with a Google Maps lookup link and a `wa.me` handoff. Apify is
available as an optional paid provider.

### Command permissions
Thirteen allowlisted commands (status, logs, disk, restart, reload, builds…).
Read-only commands run immediately; mutating ones require explicit approval in
the Command console. Every request is recorded with decision, exit code,
stdout/stderr and duration. The model never receives a shell.

### Assistant experience
- Chat with quick prompts, durable memory in `MEMORY.md` (append-only) and tool calls.
- Resizable side pane; `Esc` closes, `/` opens graph search.
- Live health strip (API / model / DB / TLS), an attention badge with real pending items, and a recent-activity feed on the Hub.
- Quiet HUD: the sidebar hides until you hover the left edge (small handle on touch), and `/` or `Ctrl+K` opens a searchable command palette for every feature. All panels, the landing page and the login page were rebuilt around a cyan-on-near-black HUD style. No invented telemetry, mock CRM or simulated approvals — the COO/CRM mock layer was removed.
- Tailwind v4 CSS-first design tokens, visible focus rings, container-query panes and reduced-motion support.

## Getting started

### Docker

```bash
docker compose up --build
# UI: http://localhost:5173   API: http://localhost:3000
```

### Local

```bash
# database
./scripts/setup_local_db.sh

# API
cd api
cp .env.example .env
npm install
npm run build
npm start

# UI (another terminal)
cd ui
npm install
npm run dev
```

Start a local model (no API key needed):

```bash
llama-server -m Qwen3-4B-Q4_K_M.gguf -a karen -c 32768 \
  --port 8080 --host 127.0.0.1 -t 8 --jinja
```

In `api/.env`:

```bash
LLM_API_KEY=local
LLM_BASE_URL=http://127.0.0.1:8080/v1
LLM_MODEL=karen
LEAD_PROVIDER=osm
KAREN_VAULT_DIR=/path/to/private/vault
KAREN_API_KEY=          # shared secret injected by the reverse proxy
```

Optional integrations are documented in `api/.env.example`: Cloudflare
embeddings, Apify, NVD rate-limit key and the marketing message template.
Secrets always stay outside the repository.

### Seed the vault and the security KB

```bash
node api/scripts/seed-vault.mjs          # idempotent starter notes
node api/scripts/ingest-security-kb.mjs  # OWASP + PayloadsAllTheThings
node api/scripts/ingest-mitre.mjs        # ATT&CK + CAPEC
cd api && DATABASE_URL=... npm run ingest -- ./prompts/karen.md
```

All ingest scripts are idempotent (deduplication by content hash).

## API reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness |
| GET | `/api/health/full` | API / model / DB / TLS status |
| GET | `/api/dashboard/attention`, `/api/dashboard/activity` | Pending items and recent events |
| GET | `/api/graph` | Graph; `?exclude_notes=true` hides bridged/KB notes |
| GET/POST | `/api/graph/canvas` | Export / import JSON Canvas |
| POST/PATCH | `/api/nodes` | Create / patch a node |
| POST | `/api/edges` | Create an edge |
| GET | `/api/search`, `/api/context` | Hybrid search and token-budgeted context |
| GET | `/api/chat/status`, POST `/api/chat` | Assistant status and chat |
| GET | `/api/leads`, `/api/leads/estimate` | Leads and cost estimate |
| POST | `/api/leads/scrape` | Free OSM scrape |
| PATCH | `/api/leads/:id` | Store a verified phone number |
| POST | `/api/leads/:id/suppress` | Do-not-contact |
| GET | `/api/commands`, `/api/commands/runs` | Allowlist and audit log |
| POST | `/api/commands/request` | Request a command (approval for writes) |
| POST | `/api/commands/:id/approve`, `/deny` | Decide |
| GET | `/api/notes`, `/api/notes/graph` | Vault files and link graph |
| GET/PUT | `/api/notes/content` | Read / write a note |
| GET | `/api/notes/backlinks` | Notes linking to a path |
| POST | `/api/notes/sync` | Sync `graph_id` notes into the graph |
| GET | `/api/garden/data`, `/api/garden/report` | Note-health report |
| GET | `/api/kb/status` | Ingestion counts by source |
| POST | `/api/embeddings/backfill` | Optional Cloudflare indexing |

Mutating routes are rate limited (60 req/min/IP) and validated with zod.

## Security & privacy

- No token, password or API key is committed. Runtime secrets live in an env file outside the repo (`KAREN_API_KEY`, `APIFY_TOKEN`, …).
- Remote access uses a session login (scrypt password hashes outside the repo, optional TOTP MFA, HMAC-signed HttpOnly/Secure cookies, 7-day expiry, login rate limiting, global session revocation) enforced by OpenResty `auth_request`. `X-Karen-Key` remains an internal defense; direct API-port access is firewalled. Proposal links honour an `expires:` frontmatter date.
- Only `/api/*` is proxied to the API; the MCP stdio surface remains local.
- Commands are allowlisted, argument-free and spawned without a shell; mutating ones require human approval.
- The markdown vault (`KAREN_VAULT_DIR`) is outside the repo; `MEMORY.md` is append-only and cannot be rewritten by the note editor.
- Outreach is draft-and-copy only — no automated messages, no account creation, no payments.

## Automation (implemented)

- Nightly backups at 03:00 `America/São_Paulo` (`karen-backup.timer`): PostgreSQL dump + vault archive, 7-day retention, stored outside the repo. Verify with `node api/scripts/restore-drill.mjs`.
- Watchdog (`karen-watchdog.timer`, hourly): failed units, stale backups, disk, cert expiry, model health and failed logins become action items. A new/changed finding e-mails **immediately** via `send-alert.mjs --urgent` (6h per-topic cooldown); hourly runs only detect, they never e-mail on a schedule.
- Monthly OS update check (`karen-osupdates.timer`) raises an e-mail item instead of upgrading automatically.
- Optional offsite backup (`karen-offsite.timer`, 04:00): AES-256 encrypted copies pushed to a private git repo (see `docs/OPERATIONS.md`).
- EVA weekly strategy review (`karen-eva-weekly.timer`, Monday 10:00): decision-format e-mail with ranked opportunities, open actions, note health and decision history.
- Weekly dependency audit (`karen-audit.timer`, Monday 08:30 `America/São_Paulo`): writes `api/data/dependency-audit.json` and raises an e-mail action item when high/critical advisories exist. Never auto-upgrades packages.
- Deterministic digests at **09:00 and 21:00** `America/São_Paulo` (`karen-morning.timer` scans credits first; `karen-evening.timer` reuses the report without re-scanning). Both contain the report **plus open action items**. Optional integrations (Apify/Cloudflare) appear only as info in the digest — never as alerts.
- No hourly alert e-mail: `karen-alerts.timer` was retired in favour of event-driven urgent alerts. SMTP is required for real delivery; setup steps are recorded in `api/data/email-setup-pending.md`.
- Working contexts (`context:` frontmatter, `CONTEXT.md`, `set_context` / `get_context`) shared by the Hub, Mapa and the assistant.

## Client proposal portal

A note in `proposals/` with a `token:` in its frontmatter becomes a private,
read-only page at `/portal/<token>`. No login, no database access, no other vault
content is exposed. The page is `noindex`/`no-store`; rotate the token by editing
the frontmatter. The Notes panel offers **Link público** to copy the URL. See
`docs/OPERATIONS.md`.

## EVA — co-founder mode

`EVA` is a second persona for KAREN, not a second app. Toggle it in the sidebar
(or ask `set_mode`) and the next chat uses `api/prompts/eva.md`.
- proactive recommendations with trade-offs, cost and a single next step;
- `decision_log` records decisions in the vault's `decisions/` folder;
- `opportunity_score` ranks credit opportunities against KAREN's real needs;
- the EVA board shows mode, context, opportunities and past decisions;
- e-mails are signed by EVA while her mode is active.

Mode and context live in `MODE.md` / `CONTEXT.md` inside the private vault.

## Roadmap

No open items. Suggested future work: optional local embeddings, a mobile client
and deeper multi-agent workflows.

## Sources and credits

Note conventions and graph portability draw on public work — see
[docs/notes-ui-references.md](docs/notes-ui-references.md). Security KB
licences and required attribution are in
[docs/security-sources.md](docs/security-sources.md).

The UI is also an installable PWA (manifest + service worker caching the shell,
never the API).

## Development

```bash
cd ui && npm run lint && npm run build
cd api && npm test          # build + node --test unit tests
./scripts/smoke_test.sh     # needs Docker/podman
```

Operations procedures (restore, rotate keys, add commands/sources, debug timers)
are in [docs/OPERATIONS.md](docs/OPERATIONS.md).

CI runs API build, smoke tests and UI lint/build on every push.

## License

MIT. Created by Lucas Mulato.
