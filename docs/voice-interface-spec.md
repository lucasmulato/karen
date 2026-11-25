# Especificação — interface de voz local (rascunho)

Status: **rascunho Tier 1**, depende de `approve EQ-VOICE-01`. Nada implementado.

## Objetivo

Hands-free sem nuvem: microfone → STT local → KAREN → TTS local → alto-falante.

## Componentes propostos (internos, sem portas publicadas)

- `stt`: whisper.cpp ou faster-whisper com API compatível; modelo small/base em CPU.
- `tts`: Piper com voz **Cori en_GB High (MIT, feminina)**; saída falada em inglês.
- `stt`: o navegador grava webm; o gateway converte para WAV 16 kHz mono com `ffmpeg` antes do whisper.cpp.
- Ambos em `docker-compose` com `expose`, rede interna `karen_internal`.

## Endpoints (propostos)

```
POST /api/voice/transcribe   multipart/form-data: audio (webm/ogg/wav)
  -> { "text": "...", "language": "pt", "engine": "local" }

POST /api/voice/synthesize   application/json: { "text": "...", "voice": "pt-br" }
  -> audio/wav
```

Regras: sessão obrigatória; limite de tamanho; redaction de áudio/transcrição
não sai do host; nada é enviado para nuvem; logs guardam apenas duração e
tamanho, nunca o conteúdo.

## Integração na UI

- Botão de microfone no `ChatPanel` (`MediaRecorder` → blob → `/transcribe`).
- Texto transcrito entra no input; usuário confirma antes de enviar.
- Botão de alto-falante nas respostas (`/synthesize` → `<audio>`).

## Riscos

- Piper é GPL-3.0; uso em produto distributing pode exigir revisão.
- CPU/RAM: modelos pequenos primeiro; medir latência antes de prometer tempo real.
- Nenhum áudio de terceiros deve ser gravado sem consentimento do operador.
