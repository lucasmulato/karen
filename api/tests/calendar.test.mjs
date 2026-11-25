import test from "node:test";
import assert from "node:assert/strict";

import { freeWindows } from "../build/services/calendar.js";

test("finds free windows between meetings", () => {
  const windows = freeWindows(
    [
      { start: "2026-11-26T10:00:00", end: "2026-11-26T11:00:00" },
      { start: "2026-11-26T14:00:00", end: "2026-11-26T15:30:00" },
    ],
    "09:00",
    "17:00"
  );
  assert.deepEqual(windows, [
    { start: "09:00", end: "10:00", minutes: 60 },
    { start: "11:00", end: "14:00", minutes: 180 },
    { start: "15:30", end: "17:00", minutes: 90 },
  ]);
});

test("all-day events do not consume work hours", () => {
  const windows = freeWindows([{ start: "2026-11-26T00:00:00", end: "2026-11-27T00:00:00", allDay: true }], "09:00", "10:00");
  assert.deepEqual(windows, [{ start: "09:00", end: "10:00", minutes: 60 }]);
});

test("windows shorter than 30 minutes are dropped", () => {
  const windows = freeWindows([{ start: "2026-11-26T10:00:00", end: "2026-11-26T10:20:00" }], "09:00", "10:40");
  assert.equal(windows.some((w) => w.minutes === 20), false);
});
