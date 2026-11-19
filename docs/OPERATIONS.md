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

## Verify the system

```bash
sudo systemctl status karen-llama karen-api
sudo systemctl list-timers karen-morning.timer karen-alerts.timer \
  karen-backup.timer karen-audit.timer karen-watchdog.timer
curl -s http://127.0.0.1:3000/api/health/full
```

## Timers

| Timer | Schedule (America/São_Paulo) | Job |
|---|---|---|
| `karen-morning` | daily 09:00 | credit scan + e-mail digest |
| `karen-alerts` | hourly | action alerts (changes, keys, deps, watchdog) |
| `karen-watchdog` | hourly | units, backup age, disk, cert, llama |
| `karen-backup` | daily 03:00 | Postgres dump + vault tar, 7-day retention |
| `karen-audit` | Monday 08:30 | npm audit report |
| `karen-eva-weekly` | Monday 10:00 | EVA strategy-review e-mail |

Run one manually: `sudo systemctl start <name>.service`. Logs:
`journalctl -u <name>.service -n 50`.

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
