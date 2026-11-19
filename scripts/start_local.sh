#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LLAMA_BIN="${LLAMA_BIN:-/opt/llama.cpp-b12359/llama-server}"
MODEL="${MODEL:-/home/admin/models/Qwen3-4B-Q4_K_M.gguf}"
PIDDIR="${PIDDIR:-/home/admin/models}"

curl_ok() { curl -sf --max-time 2 "$1" >/dev/null 2>&1; }

if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  echo "PostgreSQL is not running. Start it with:"
  echo "  sudo -u postgres pg_ctl -D /var/lib/postgresql/data -l /var/lib/postgresql/data/server.log -o '-h 127.0.0.1 -p 5432' start"
  exit 1
fi

if ! curl_ok http://127.0.0.1:8080/health; then
  nohup "$LLAMA_BIN" -m "$MODEL" -a karen -c 32768 \
    --port 8080 --host 127.0.0.1 -t 8 --jinja \
    > /home/admin/models/qwen-new.log 2>&1 &
  echo $! > "$PIDDIR/llama.pid"
  for _ in $(seq 1 30); do
    curl_ok http://127.0.0.1:8080/health && break
    sleep 1
  done
fi

if ! curl_ok http://127.0.0.1:3000/api/health; then
  cd "$ROOT/api"
  DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/synapsevault}" \
  LLM_API_KEY="${LLM_API_KEY:-local}" \
  LLM_BASE_URL="${LLM_BASE_URL:-http://127.0.0.1:8080/v1}" \
  LLM_MODEL="${LLM_MODEL:-jarvis}" \
  CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}" \
  CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}" \
  EMBEDDING_MODEL="${EMBEDDING_MODEL:-@cf/baai/bge-m3}" \
  EMBEDDING_DIM="${EMBEDDING_DIM:-1024}" \
  APIFY_TOKEN="${APIFY_TOKEN:-}" \
  APIFY_MAX_PLACES="${APIFY_MAX_PLACES:-50}" \
  APIFY_WEBSITE_FILTER="${APIFY_WEBSITE_FILTER:-placesWithoutWebsite}" \
  OPERATOR_NAME="${OPERATOR_NAME:-}" \
  KAREN_EXAMPLE_LINK="${KAREN_EXAMPLE_LINK:-}" \
  HTTP_PORT=3000 nohup node build/index.js > /home/admin/models/synapse-api.log 2>&1 &
  echo $! > "$PIDDIR/synapse-api.pid"
fi

echo "llama.cpp: $(curl -s http://127.0.0.1:8080/health)"
echo "API:       $(curl -s http://127.0.0.1:3000/api/health)"
echo "status:    $(curl -s http://127.0.0.1:3000/api/chat/status)"
