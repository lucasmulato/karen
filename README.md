# SynapseVault: The Semantic Second Brain

SynapseVault is a personal knowledge graph system designed to interrelate
ideas, projects, and tasks using a local-first architecture.

## Architecture

- **Storage**: PostgreSQL (Relational Graph Schema).
- **Gateway**: Node.js MCP Gateway — exposes the graph as MCP tools *and* as
  an HTTP REST API used by the UI. One process, two surfaces.
- **Interface**: React + D3.js Force-Directed Graph Dashboard.
- **Reasoning (optional)**: an OpenAI-compatible chat agent. Defaults to a local
  llama.cpp server running Qwen3-4B (`jarvis`), with the `srEth.md` cyber persona.
- **Semantic search (optional)**: `@cf/baai/bge-m3` embeddings via the free
  Cloudflare Workers AI tier (zero data retention), stored in `pgvector`.
  Without credentials the vault falls back to keyword search.

## Services

| Service    | Port | Purpose                                        |
|------------|------|------------------------------------------------|
| `db`       | 5432 | PostgreSQL graph database                      |
| `api`      | 3000 | MCP stdio + HTTP REST (`/api/*`)               |
| `ui`       | 5173 | React dashboard (Vite dev server / production) |

## Getting Started

### 🐳 The Fast Way (Docker)

Ensure you have Docker installed, then run:

```bash
docker-compose up --build
```

This launches the database, API, and UI automatically.

- **UI**: http://localhost:5173
- **API**: http://localhost:3000

### 🛠️ The Manual Way (Local Development)

For the configured local stack (llama.cpp + PostgreSQL + API), run
`./scripts/start_local.sh` after building the API. It is idempotent.

1. **Initialize the database**

   Ensure PostgreSQL is running locally, then initialize the schema:

   ```bash
   ./scripts/setup_local_db.sh
   ```

2. **Run the API (MCP + HTTP)**

   ```bash
   cd api
   cp .env.example .env   # edit if your DB is elsewhere
   npm install
   npm run build
   npm start
   ```

3. **Run the Visual Dashboard (UI)**

   ```bash
   cd ui
   cp .env.example .env   # optional
   npm install
   npm run dev
   ```

4. **Enable the Chat Agent (optional)**

   Point it at the local llama.cpp server (no real API key needed):

   ```bash
   LLM_API_KEY=local
   LLM_BASE_URL=http://127.0.0.1:8080/v1
   LLM_MODEL=karen
   ```

   Recommended llama.cpp launch:

   ```bash
   llama-server -m Qwen3-4B-Q4_K_M.gguf -a karen -c 32768 \
     --port 8080 --host 127.0.0.1 -t 8 --jinja
   ```

   The persona is `api/prompts/karen.md`. To use Groq instead, set a real
   `LLM_API_KEY` and `LLM_BASE_URL=https://api.groq.com/openai/v1`.

5. **Enable semantic search (optional, free)**

   In the Cloudflare dashboard create a Workers AI API token (`Workers AI -
   Read` + `Workers AI - Edit`) and copy your Account ID, then set in `api/.env`:

   ```bash
   CLOUDFLARE_ACCOUNT_ID=...
   CLOUDFLARE_API_TOKEN=...
   EMBEDDING_MODEL=@cf/baai/bge-m3
   EMBEDDING_DIM=1024
   ```

   Index existing nodes with `POST /api/embeddings/backfill` (10k neurons/day
   free covers millions of embedding tokens). In Docker, llama.cpp must listen
   on `0.0.0.0` and `LLM_BASE_URL` must use `host.docker.internal`.

6. **Ingest notes**

   ```bash
   cd api
   DATABASE_URL=... npm run ingest -- ./prompts/karen.md /path/to/note.md https://example.org/doc
   ```

## Dashboard Features

- **Visual Graph**: Interactive D3-powered visualization of your second brain.
- **Node Categories**:
  - 🔵 **Ideas**, 🟢 **Projects**, 🟠 **Tasks**, ⚪ **Labels**.
  - 🟣 **Notes**: ingested documents and writeups.
  - 🔴 **Findings**, 🩷 **Techniques**, 🟠 **CVEs**, 🔵 **Tools**, 🟢 **Fixes**.
- **Interrelation**: Direct visual mapping of how projects contain tasks and
  ideas relate to each other; edges show their relationship labels.
- **Add Nodes**: Click the `+` in the sidebar to create a node from the UI;
  changes appear live on the graph.
- **Connect Nodes**: Click the link icon in the sidebar, pick source node →
  relationship label → target node to create an edge.
- **Persistent Layout**: Drag nodes into place — positions survive reloads.
- **Chat (optional)**: The chat button talks to **KAREN**, the combined cyber +
  lead-gen persona in `api/prompts/karen.md`. It searches the graph in hybrid
  mode (keyword + vectors) and compiles a token-budgeted context before
  answering, then can record findings, link techniques, or call `find_leads`.
- **Leads (KAREN)**: The map-pin button opens the lead panel — Google Maps
  scrape → dedupe → two ready-to-copy WhatsApp messages per prospect. Nothing
  is sent automatically.

## API Reference

The gateway exposes the same logic over MCP stdio and HTTP REST:

| Method | Path                | Description                                        |
|--------|---------------------|----------------------------------------------------|
| GET    | `/api/health`       | Health check                                       |
| GET    | `/api/graph`        | All nodes + edges for visualization               |
| POST   | `/api/nodes`        | Create a node (`type`, `name`, ...)               |
| PATCH  | `/api/nodes/:id`    | Merge `properties` into an existing node          |
| POST   | `/api/edges`        | Create an edge (`source_id`, `target_id`, `label`) |
| GET    | `/api/search`       | Hybrid search by `query`, `type` and `limit`      |
| GET    | `/api/context`      | Token-budgeted context block for a `query`        |
| POST   | `/api/embeddings/backfill` | Index nodes without embeddings             |
| GET    | `/api/chat/status`  | KAREN status (model, persona, lead config)        |
| POST   | `/api/chat`         | Chat with the agent (`message`)                   |
| GET    | `/api/leads`        | Saved leads (with drafts)                         |
| GET    | `/api/leads/estimate` | Cost estimate + active limits                   |
| POST   | `/api/leads/scrape` | Scrape leads (`query`, `location`, `maxPlaces`, `zoom`, `website`) |
| POST   | `/api/leads/:id/suppress` | Mark a lead as "do not contact"            |

Mutating routes are rate limited (60 requests/min/IP) and validated with zod.

## KAREN (cyber + lead-gen assistant)

KAREN is the assistant name and this repo is its home. The persona
(`api/prompts/karen.md`) keeps the strict 4-section technical answers and adds
a prospecção mode: find local businesses and draft two 1:1 WhatsApp messages
per lead (first touch **without** a link, follow-up for 24–48h later). Messages
are **draft + copy only** — nothing is sent by the app.

### Lead sources

The default provider is **OpenStreetMap** (Nominatim for geocoding + Overpass
for the query): free, no API key, no per-result charge. It returns public
business data — name, category, address, phone if tagged, website if tagged.
Data completeness varies by region; in Guarulhos most places have no phone tag,
so leads may need a manual number lookup before outreach.

To use the paid Google Maps scraper instead:

```bash
LEAD_PROVIDER=apify
APIFY_TOKEN=apify_api_...
APIFY_MAX_PLACES=50                  # hard ceiling, 1-200
APIFY_WEBSITE_FILTER=placesWithoutWebsite
OPERATOR_NAME="Seu Nome"
KAREN_EXAMPLE_LINK=https://...       # used only in the follow-up
```

Apify costs US$1.50 per 1,000 scraped places (~US$0.08 for 50). Reviews,
contact/social enrichment and competitor analysis are explicitly disabled —
enabling them can raise a run by 40–100x. Leads are deduplicated by provider ID
(`osm:node/...` or Google `placeId`); suppressed leads are skipped on re-runs.

### Always-on runtime (this VPS)

Two systemd units with `Restart=always` run from this repo:

```bash
sudo systemctl status karen-llama karen-api     # -a karen on :8080, API on :3000
sudo journalctl -u karen-api -f
```

The env file is `/home/admin/models/karen.env` (mode 600, outside the repo).

### Public access + security

- Hostname: `https://karen.164.68.109.252.sslip.io/` — free wildcard DNS
  (sslip.io maps the embedded IP to the VPS); no owned domain required.
- TLS: free Let's Encrypt cert via certbot; renewal is handled by
  `certbot-renew.timer`.
- OpenResty vhost: `/etc/openresty/available/karen.conf`. It serves the built UI
  from `/var/www/karen-ui` (copy `ui/dist` there after a rebuild) and proxies
  `/api/*` to `127.0.0.1:3000`.
- **HTTP Basic auth** protects the whole HTTPS vhost (credentials are in
  `/home/admin/models/karen-web-password`, mode 600). The :80 server is left
  open only for ACME challenges and the HTTPS redirect.
- Defense in depth: the API also requires `X-Karen-Key`, injected by OpenResty
  into proxied requests from `KAREN_API_KEY` in the env file. Direct :3000
  access is firewalled. CORS is not wildcard by default.

Only `/api/*` is proxied; the MCP stdio surface stays local. A scrape can take
minutes, so the button shows a spinner while the browser waits.

## Development

- **Lint**: `cd ui && npm run lint`
- **Type-check + build API**: `cd api && npm run build`
- **Smoke tests** (requires Docker/podman): `./scripts/smoke_test.sh` spins up
  an ephemeral Postgres and verifies the full HTTP round-trip.
- **CI**: `.github/workflows/ci.yaml` runs API build + smoke tests + UI
  lint/build on every push and pull request.

## License

MIT License. Created by Lucas Mulato.