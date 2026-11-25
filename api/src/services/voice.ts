/** Pure validation helpers for the local voice endpoints. No I/O, no cloud. */
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
export const MAX_SPEECH_CHARS = 500;

export function decodeAudio(base64: unknown): Buffer {
  const value = String(base64 ?? "");
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/=]+$/.test(value)) {
    throw new Error("Áudio inválido: use base64.");
  }
  const buffer = Buffer.from(value, "base64");
  if (buffer.length === 0) throw new Error("Áudio vazio.");
  if (buffer.length > MAX_AUDIO_BYTES) throw new Error("Áudio acima do limite de 3 MB.");
  return buffer;
}

export function validateSpeechText(text: unknown): string {
  const value = String(text ?? "").trim();
  if (!value) throw new Error("Texto vazio.");
  if (value.length > MAX_SPEECH_CHARS) throw new Error("Texto acima de 500 caracteres.");
  return value;
}

export function sttEndpoint(): string {
  return process.env.KAREN_STT_URL ?? "http://127.0.0.1:9090/inference";
}

export function ttsModelPath(): string {
  return (
    process.env.KAREN_TTS_MODEL ??
    "/home/admin/models/voice/pt_BR-cadu-medium.onnx"
  );
}

export function ttsBinary(): string {
  return process.env.KAREN_TTS_BIN ?? "/home/admin/models/voice-venv/bin/piper";
}
