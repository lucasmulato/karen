#!/bin/bash
# STT service for KAREN: whisper.cpp server, bound to loopback only.
set -euo pipefail
MODEL="${WHISPER_MODEL:-base}"
PORT="${WHISPER_PORT:-9090}"

if [ ! -f "/models/ggml-${MODEL}.bin" ]; then
  echo "[stt] downloading model ${MODEL}"
  /app/models/download-ggml-model.sh "${MODEL}" /models
fi

echo "[stt] starting whisper-server on 127.0.0.1:${PORT}"
exec /app/build/bin/whisper-server --host 127.0.0.1 --port "${PORT}" -m "/models/ggml-${MODEL}.bin"
