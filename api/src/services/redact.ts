/** Strip credential-shaped values before text leaves KAREN (e.g. embeddings). */
export function redactSecrets(text: string): string {
  return String(text ?? "")
    .replace(/cfat_[A-Za-z0-9_-]{16,}/gi, "[REDACTED]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED]")
    .replace(
      /(TOKEN|PASSWORD|PASSWD|SECRET|API[_-]?KEY)\s*[:=]\s*["']?[A-Za-z0-9_\-]{24,}/gi,
      "$1=[REDACTED]"
    );
}
