/**
 * Isolation of untrusted text from prospects (Fase 5, rule 4 and 9).
 * External text is a data field, never a source of instructions for tools.
 */
export interface ExternalTextField {
  kind: "external_text";
  value: string;
  source: string;
  trusted: false;
}

/** Wrap text from a prospect/page/issue as inert data. */
export function toExternalText(value: string, source: string): ExternalTextField {
  return { kind: "external_text", value: sanitizeExternalText(value), source, trusted: false };
}

/** Strip control characters and cap size without interpreting content. */
export function sanitizeExternalText(value: string): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

/**
 * Explicit boundary: a command tool only accepts a plain string authored by
 * the operator. Passing an external text field throws.
 */
export function commandInput(value: string | ExternalTextField): string {
  if (typeof value !== "string") {
    throw new Error("Texto externo não pode ser usado como entrada de comando.");
  }
  return value;
}
