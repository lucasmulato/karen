/** Pure helpers for EVA's calendar awareness. No I/O, no dependency on node-ical. */
export interface CalendarEvent {
  start: string | Date;
  end: string | Date;
  allDay?: boolean;
}

export interface FreeWindow {
  start: string;
  end: string;
  minutes: number;
}

function minutes(value: string | Date): number {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return -1;
  return date.getHours() * 60 + date.getMinutes();
}

function clockMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return -1;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return -1;
  return h * 60 + m;
}

function clock(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Free windows inside work hours, after removing busy intervals. */
export function freeWindows(
  events: CalendarEvent[],
  workStart = "09:00",
  workEnd = "18:00"
): FreeWindow[] {
  const start = clockMinutes(workStart);
  const end = clockMinutes(workEnd);
  if (start < 0 || end <= start) return [];

  const busy = events
    .filter((event) => !event.allDay)
    .map((event) => [minutes(event.start), minutes(event.end)] as const)
    .filter(([from, to]) => from >= 0 && to > from)
    .sort((a, b) => a[0] - b[0]);

  const windows: FreeWindow[] = [];
  let cursor = start;
  for (const [from, to] of busy) {
    if (to <= cursor || from >= end) continue;
    if (from > cursor) {
      windows.push({ start: clock(cursor), end: clock(Math.min(from, end)), minutes: Math.min(from, end) - cursor });
    }
    cursor = Math.max(cursor, Math.min(to, end));
  }
  if (cursor < end) windows.push({ start: clock(cursor), end: clock(end), minutes: end - cursor });
  return windows.filter((window) => window.minutes >= 30);
}
