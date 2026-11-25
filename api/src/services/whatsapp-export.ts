/** Pure parser for WhatsApp .txt exports. No file I/O, no DB, no network. */
import { normalizePhone } from "./outreach.js";

export interface ExportEvent {
  timestamp: string;
  sender: string;
  message: string;
  phones: string[];
}

const LINE =
  /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4})(?:,|\s)+(\d{2}:\d{2}(?::\d{2})?)\]?\s*[-–]?\s*([^:]{1,80}):\s?(.*)$/;

function iso(input: string): string {
  const match = /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{2,4})$/.exec(input);
  if (!match) return "";
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  const day = String(match[1]).padStart(2, "0");
  const month = String(match[2]).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Extracts BR phone candidates from free text; dates/times are ignored. */
export function extractPhones(text: string): string[] {
  const candidates = String(text ?? "").match(/\+?\d[\d\s().-]{8,}\d/g) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizePhone(candidate);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

/** Parses one line of a WhatsApp text export. */
export function parseExportLine(line: string): ExportEvent | null {
  const match = LINE.exec(String(line ?? "").trim());
  if (!match) return null;
  const [, rawDate, rawTime, sender, message] = match;
  return {
    timestamp: `${iso(rawDate)}T${rawTime.length === 5 ? `${rawTime}:00` : rawTime}`,
    sender: sender.trim(),
    message: message.trim(),
    phones: extractPhones(`${sender} ${message}`),
  };
}

export function parseExport(text: string): ExportEvent[] {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(parseExportLine)
    .filter((event): event is ExportEvent => event !== null);
}
