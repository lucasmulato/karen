import test from "node:test";
import assert from "node:assert/strict";

import { nextReview, parseFeedback, shouldAskRelevance } from "../build/services/intimacy.js";

test("feedback buttons map to kinds, including accented util", () => {
  assert.deepEqual(parseFeedback("registre feedback: útil"), { kind: "util", note: "" });
  assert.deepEqual(parseFeedback("registre feedback: aprofunde — mais contexto"), {
    kind: "aprofunde",
    note: "mais contexto",
  });
  assert.equal(parseFeedback("obrigado"), null);
});

test("relevance question is asked only for ambiguous or learning messages", () => {
  assert.equal(shouldAskRelevance("quero aprender sobre SSRF"), true);
  assert.equal(shouldAskRelevance("será que vale a pena?"), true);
  assert.equal(shouldAskRelevance("status do sistema"), false);
  assert.equal(shouldAskRelevance(""), false);
});

test("spaced repetition advances only when interval elapsed", () => {
  assert.deepEqual(nextReview(1, 0), { level: 1, intervalDays: 1 });
  assert.deepEqual(nextReview(1, 2), { level: 2, intervalDays: 3 });
  assert.deepEqual(nextReview(4, 20), { level: 5, intervalDays: 30 });
  assert.deepEqual(nextReview(5, 100), { level: 5, intervalDays: 30 });
});
