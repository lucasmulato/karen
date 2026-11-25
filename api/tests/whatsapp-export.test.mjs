import test from "node:test";
import assert from "node:assert/strict";

import { extractPhones, parseExport, parseExportLine } from "../build/services/whatsapp-export.js";

test("parses standard WhatsApp export lines", () => {
  const event = parseExportLine("[25/11/2026, 14:03:12] Loja Madri: Oi, tudo bem?");
  assert.equal(event.sender, "Loja Madri");
  assert.equal(event.message, "Oi, tudo bem?");
  assert.equal(event.timestamp, "2026-11-25T14:03:12");
});

test("parses variant with space and dash separator", () => {
  const event = parseExportLine("25/11/2026 09:05 - Joao: ligue para 47 3275-1774");
  assert.equal(event.sender, "Joao");
  assert.deepEqual(event.phones, ["554732751774"]);
});

test("ignores non-message lines and extracts only real phones", () => {
  assert.equal(parseExportLine("Mensagens e chamadas omitidas"), null);
  const events = parseExport(
    "[25/11/2026, 10:00:00] A: ligue 1198886-9469\n[25/11/2026, 10:01:00] B: ver 25/11/2026 às 10h"
  );
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].phones, ["5511988869469"]);
  assert.deepEqual(events[1].phones, []);
  assert.deepEqual(extractPhones("zem 47 3275 1774 e 47 3275 1774"), ["554732751774"]);
});
