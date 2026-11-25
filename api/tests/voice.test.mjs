import test from "node:test";
import assert from "node:assert/strict";

import { decodeAudio, MAX_AUDIO_BYTES, sttEndpoint, ttsModelPath, validateSpeechText } from "../build/services/voice.js";

test("decodes valid base64 audio and rejects junk", () => {
  const bytes = Buffer.from("RIFFfakeaudio");
  assert.deepEqual(decodeAudio(bytes.toString("base64")), bytes);
  assert.throws(() => decodeAudio("!!!"), /base64/);
  assert.throws(() => decodeAudio(""), /base64/);
});

test("enforces audio and text limits", () => {
  const tooBig = Buffer.alloc(MAX_AUDIO_BYTES + 1).toString("base64");
  assert.throws(() => decodeAudio(tooBig), /3 MB/);
  assert.equal(validateSpeechText("  olá  "), "olá");
  assert.throws(() => validateSpeechText("a".repeat(501)), /500/);
});

test("endpoints default to local-only", () => {
  assert.match(sttEndpoint(), /^http:\/\/127\.0\.0\.1:/);
  assert.match(ttsModelPath(), /\/home\/admin\/models\/voice\//);
});
