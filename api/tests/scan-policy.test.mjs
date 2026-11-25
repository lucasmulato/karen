import test from "node:test";
import assert from "node:assert/strict";

import { leadKey, shouldRefresh } from "../build/services/scan-policy.js";

test("lead key uses public name and normalized phone", () => {
  assert.equal(leadKey({ name: "Padaria  Central", phone: "(47) 3275-1774" }), "padaria central|4732751774");
  assert.equal(leadKey({ name: "Padaria Central" }), "padaria central");
});

test("cache refresh respects TTL and force", () => {
  const now = Date.parse("2026-11-25T12:00:00Z");
  assert.equal(shouldRefresh(null, now, 10), true);
  assert.equal(shouldRefresh("2026-11-25T11:55:00Z", now, 10), false);
  assert.equal(shouldRefresh("2026-11-25T11:49:00Z", now, 10), true);
  assert.equal(shouldRefresh("2026-11-25T11:59:00Z", now, 10, true), true);
});
