# KAREN — Operations runbook

Practical procedures for the VPS deployment. Keep secrets out of this document
and out of git. Live credentials are in `/home/admin/models/karen.env` (mode 600).

## Login and sessions

Public landing: `/`. Login page: `/login.html`. Protected app: `/app/`.
- Users are stored in `KAREN_USERS_FILE` (default `/home/admin/models/karen-users.json`, mode 600) as scrypt hashes.
- Sessions are HMAC-signed with `KAREN_SESSION_SECRET` and stored in an HttpOnly/Secure cookie for 7 days.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- Logout clears the cookie; to revoke a stolen token, rotate `KAREN_SESSION_SECRET` (invalidates every session).
- `/portal/<token>` is intentionally public and does not use sessions. Every other `/api/*` route requires the session cookie via `auth_request`; only `/api/auth/login` and the internal `/api/auth/verify` are public. A 401 from any API call redirects the SPA to `/login.html`.
- **MFA (TOTP)** is enabled for `karen`. Enroll with `POST /api/auth/mfa/setup` (returns a `otpauth://` URI) and confirm with `POST /api/auth/mfa/enable`. Login then returns `mfaRequired`, and `POST /api/auth/mfa/complete` exchanges the 6-digit code for the session cookie. The login page shows the code field automatically.
- `POST /api/auth/revoke-all` increments the user's session version and invalidates every existing cookie. Rotating `KAREN_SESSION_SECRET` has the same global effect.
- Failed logins are logged to `api/data/auth-failures.json`; the watchdog raises an e-mail action item after 3 in 24h.
- Google OAuth can be added later behind the same auth layer.

## Approval / attention queue

`GET /api/dashboard/queue` merges pending command approvals, action items,
missing keys, dependency advisories and credit changes. Items carry `source`,
`severity`, `policy` (`auto` / `propose` / `blocked`), and a `route`. Tokens are
never included. Digests and urgent alerts point to `/app/?pane=commands`, which
opens the approval panel directly.

Approval of a pending command is authenticated by the session cookie; the old
token parameter is still accepted for backwards compatibility. Comparison uses
the stored SHA-256 hash, and new runs no longer persist the plaintext token.

### EVA nightly triage

`api/scripts/eva-nightly-triage.mjs` collects pending command approvals, action
items and notes newer than 48h in `00 Inbox`, then makes **one batched call** to
the local llama model with the EVA persona. It writes a read-only side file,
`api/data/eva-triage.json`, with `auto` / `propose` / `blocked` per item.

The model only classifies — it never executes anything. Deterministic rules in
`api/scripts/lib/eva-triage.mjs` override it: a pending command approval is
never `auto`, `write` commands are `blocked`, and anything involving money,
accounts, logins, messages or secret values is `blocked`. Titles/details are
sanitized before they reach the prompt or the output file.

The queue overlays those policies onto its items; `GET /api/dashboard/attention`
hides `auto` items (and reports the triage counts), so the badge reflects only
what still needs you. The morning/evening digest shows a triagem summary.

Manual runs from `api/`:

```bash
node scripts/eva-nightly-triage.mjs --offline   # deterministic only, no LLM, prints JSON
node scripts/eva-nightly-triage.mjs --dry-run   # calls the LLM, prints JSON, does not write
node scripts/eva-nightly-triage.mjs             # calls the LLM and writes the side file
```

If the LLM is unavailable the script still writes a valid file (all items fall
back to `propose`, with `llm_error` recorded) — the queue never breaks.

## Verify the system

```bash
sudo systemctl status karen-llama karen-api
sudo systemctl list-timers karen-morning.timer karen-evening.timer \
  karen-backup.timer karen-audit.timer karen-watchdog.timer karen-eva-triage.timer
curl -s http://127.0.0.1:3000/api/health/full
```

## Timers

| Timer | Schedule (America/São_Paulo) | Job |
|---|---|---|
| `karen-morning` | daily 09:00 | credit scan + e-mail digest (report + pending findings) |
| `karen-evening` | daily 21:00 | e-mail digest (report + pending findings, no re-scan) |
| `karen-watchdog` | hourly | units, backup age, disk, cert, llama, failed logins; e-mails only for new/urgent findings |
| `karen-backup` | daily 03:00 | Postgres dump + vault tar, 7-day retention |
| `karen-audit` | Monday 08:30 | npm audit report |
| `karen-eva-weekly` | Monday 10:00 | EVA strategy-review e-mail |
| `karen-eva-triage` | daily 23:30 | EVA classifies queue items (`auto` / `propose` / `blocked`) |
| `karen-vault-garden` | daily 05:00 | orphan backlink suggestions + MEMORY.md draft (never applies) |

Run one manually: `sudo systemctl start <name>.service`. Logs:
`journalctl -u <name>.service -n 50`.

### E-mail cadence

Two digests per day (09:00 and 21:00) carry the credit/notes report plus all
open action items. There is no hourly alert timer anymore: the hourly watchdog
only *detects* findings, and a **new or changed** finding triggers
`send-alert.mjs --urgent` immediately (6h cooldown per topic, tracked in
`api/data/alert-state.json` under `urgent:` keys). Optional keys
(`APIFY_TOKEN`, `CLOUDFLARE_API_TOKEN`) appear as info in the digest only.

Preview without sending:
`node scripts/send-morning-report.mjs --evening --dry-run` and
`node scripts/send-alert.mjs --urgent --dry-run` (from `api/`).

## Search: FTS + RRF

`nodes.search_tsv` is a generated `tsvector` (Portuguese stemming, name weighted
`A`, description `B`) with a GIN index, declared in `scripts/schema.sql`.
`VaultService.searchNodes` fuses **ILIKE + PostgreSQL FTS + pgvector** results
with reciprocal rank fusion; any failing source degrades gracefully. `search_kb`
uses FTS first and falls back to ILIKE. This means a query such as `seguranca`
matches accented notes that a raw `ILIKE '%seguranca%'` would miss.

Embeddings are Cloudflare Workers AI `@cf/baai/bge-m3` (1024 dims), configured
via `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` in `karen.env`. The free
Workers allocation (10,000 Neurons/day) covers the 7,573-node backfill and
ongoing queries. Backfill: `POST /api/embeddings/backfill` (repeat until it
indexes 0 — the endpoint processes at most 500 nodes per call).

## Vault garden (read-only maintenance)

`api/scripts/vault-garden.mjs` runs daily. It finds orphan graph notes, suggests
backlinks from the existing embeddings (cosine similarity, threshold 0.55) and
drafts MEMORY.md lines from recent decisions not yet in memory. It writes only
`api/data/vault-maintenance.json` — **nothing is applied automatically**, and
MEMORY.md remains append-only via `remember`. The digest reports the counts.

Manual run: `node scripts/vault-garden.mjs --dry-run` from `api/`.

## EVA brief

`GET /api/eva/brief` returns a deterministic Chief-of-Staff brief: pending
decisions with policy/severity, opportunities with trade-offs, garden status,
next steps and the deterministic health report. The **Brief** button in the EVA
panel renders it; the agent exposes it as the `eva_brief` tool. As with
`system_status`, the model only narrates — it never supplies the numbers.

Command policies are now explicit: `GET /api/commands` includes `policy`
(`auto` for reads, `propose` for reversible writes, `blocked` for
`restart_api` / `reload_web`), and the command panel shows the badge.

## llama.cpp tuning

Measured on this VPS (6 cores, no GPU, Qwen3-4B Q4_K_M) with
`node scripts/llama-bench.mjs --label <name>` from `api/`. The script performs a
warm-up call then N identical calls with a fixed ~470-token prompt and records
llama.cpp's own `timings` plus server RSS into `api/data/llama-bench.jsonl`.

| Config | Prompt tok/s | Gen tok/s | RSS |
|---|---|---|---|
| `-c 32768 -t 8` (anterior) | 5,20 | 5,49 | 7.739 MiB |
| `-c 8192 -t 6` | 0,62 | 0,64 | 5.100 MiB |
| `-c 8192 -t 8` (**atual**) | 5,17 | 5,27 | 5.338 MiB |

`-t 6` matched the physical core count but collapsed generation ~8× on this
CPU — probably thread-pool contention. Keep `-t 8`. Reducing the context from
32k to 8k saved ~2,4 GiB RSS with negligible speed loss. The largest real
prompt observed in `llama.log` was 5.674 tokens, and agent replies are capped
at 1.200 tokens, so 8.192 leaves enough headroom.

To re-measure after any change: edit
`/etc/systemd/system/karen-llama.service`, then
`sudo systemctl daemon-reload && sudo systemctl restart karen-llama` and run the
benchmark. Wait for the model to answer (not just `/health`) before measuring.
The previous unit is kept at `/home/admin/karen-llama.service.bak`.

## Self-diagnosis (`/diagnosis`)

KAREN can report her own state from deterministic data instead of guessing:

- `GET /api/diagnosis` — read-only JSON report, cached for 60 s. Collects
  systemd unit state, next timers, llama health/RSS/context/threads and last
  benchmark, queue policy counts, EVA triage summary, garden counts, dependency
  advisories, certificate days (read over TLS, no root needed) and backup age.
  Failed sources become `"indisponível"` and are listed in `issues`. No env
  values, tokens, command args or stack traces are returned.
- `/diagnosis` typed in the chat (or chosen from the `/` palette) renders the
  same report as a card. The **Narrar com EVA** button asks the model to explain
  those numbers in natural language; it cannot change them.
- `POST /api/chat` with `{"message":"/diagnosis"}` returns the text version
  (`source: "diagnosis"`) and works even when the LLM is disabled.
- The agent also has a read-only `system_status` tool backed by the same
  collector, so it can cite its own state in any conversation.

Diagnostic fields are whitelisted in `api/src/services/diagnosis.ts`; add new
sources there rather than passing raw files or env vars to the model.

## Restore a backup

```bash
cd /home/admin/karen/api
node scripts/restore-drill.mjs     # restore into temp DB, verify, drop
cat data/restore-drill.json
```

The drill never touches production. To do a real restore, stop the API, replace
the database from the chosen dump, then restart and check `/api/health/full`.

## Client proposal portal

Create `proposals/<Cliente>.md` in the vault with frontmatter:

```yaml
---
type: proposal
token: <random-hex>
client: Nome do Cliente
status: enviada
expires: 2026-12-31
---
```

The public URL is `https://<host>/portal/<token>` — no Basic auth, no login.
OpenResty disables auth for `/portal/` only; the API treats it as a public path.
The page is `noindex` + `no-store` and exposes only that note. Rotate the token
by changing the frontmatter. Bad tokens return 404. A past `expires:` date in
the frontmatter also returns 404.

## Offsite backup

Encrypted copies of the newest dump + vault archive are pushed daily (04:00) to
a **private** git repo `karen-backups` via SSH. The local clone is
`/home/admin/karen-backups` (`KAREN_OFFSITE_DIR`) and the remote is in
`KAREN_OFFSITE_REPO`. The timer is `karen-offsite.timer`; run manually with
`sudo systemctl start karen-offsite.service`.

The AES-256 passphrase is `KAREN_BACKUP_PASSPHRASE` in the env file **and must be
saved in your password manager**. Without it the offsite copies cannot be
restored. To restore one:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -in <file>.enc -out <file>
```

The offsite repo must exist and be private before enabling the timer:

```bash
git ls-remote git@github.com:lucasmulato/karen-backups.git HEAD
```

Monthly OS update checks use `karen-osupdates.timer` and only raise an e-mail
action item — they never upgrade automatically.

## Rotate a secret

1. Generate the new value at the provider.
2. Edit `/home/admin/models/karen.env` (keep mode 600).
3. `sudo systemctl restart karen-api` and the relevant timers.
4. Revoke the old value at the provider.
5. Confirm the attention badge / `key_status` shows `configured`.

Never put a token in chat, logs, `.env.example`, or the repository.

## Add an allowlisted command

Edit `api/src/services/commands.ts`:
- unique `id`, short `label`, `risk: "read" | "write"`;
- fixed `steps` with absolute binary paths and **no shell**;
- no arguments coming from the model.

Then `cd api && npm run build && sudo systemctl restart karen-api`. The new
command appears in `GET /api/commands` and in the Command console.

## Add a security KB source

1. Add the repo to `SOURCES` in `api/scripts/ingest-security-kb.mjs` with its
   licence and a path filter.
2. Record attribution in `docs/security-sources.md`.
3. Run `node scripts/ingest-security-kb.mjs` (idempotent).

## Debug the notes/vault

- Vault root: `KAREN_VAULT_DIR` in the env file.
- `MEMORY.md` is append-only via `remember`; `CONTEXT.md` holds the active
  context; `MODE.md` holds KAREN/EVA.
- Read with `GET /api/notes`, `GET /api/notes/graph`, `GET /api/notes/context`.

## Update the OS

```bash
sudo pacman -Syu
sudo /opt/openresty/bin/openresty -t
find /etc -name '*.pacnew'
```

Check the health strip and timers afterwards. Dependency updates are separate:
see `api/data/dependency-audit.json` (weekly audit, e-mail alerts on high/critical).

## E-mail delivery

SMTP uses a Gmail app password. Alerts and digest are deterministic templates;
no secret is included in the body. If delivery fails, the pending setup is
written to `api/data/email-setup-pending.md` and an e-mail alert is raised once
delivery is restored.
