#!/bin/bash
# Draft entrypoint for the proposed llm-engine service.
# Starts Ollama, waits for the API, pulls the configured model, then stays alive.
set -euo pipefail

MODEL_NAME="${MODEL_NAME:-qwen3:4b}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"

ollama serve &
SERVER_PID=$!

echo "[llm-engine] waiting for ${OLLAMA_URL}/api/tags"
for _ in $(seq 1 60); do
  if curl -sf "${OLLAMA_URL}/api/tags" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -sf "${OLLAMA_URL}/api/tags" >/dev/null 2>&1; then
  echo "[llm-engine] server did not become ready" >&2
  exit 1
fi

echo "[llm-engine] pulling ${MODEL_NAME}"
ollama pull "${MODEL_NAME}"
echo "[llm-engine] ${MODEL_NAME} ready"

wait "${SERVER_PID}"
