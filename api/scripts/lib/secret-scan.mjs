/**
 * Pure secret-pattern matching for the local scan job. Returns only the
 * pattern name and line number — never the matched value.
 */

export const PATTERNS = [
  { name: "cloudflare_token", re: /cfat_[A-Za-z0-9_-]{16,}/ },
  { name: "aws_access_key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "openai_key", re: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: "github_token", re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "private_key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: "assigned_secret",
    re: /(?:TOKEN|PASSWORD|PASSWD|SECRET|API[_-]?KEY)\s*[:=]\s*["']?[A-Za-z0-9_\-]{24,}/i,
  },
];

const PLACEHOLDER = /(?:example|placeholder|your[_-]?|xxx+|<[^>]+>|\[REDACTED\]|preenchido)/i;

/** Find secrets in text; line numbers are 1-based, values are discarded. */
export function findSecrets(text, source = "") {
  const findings = [];
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (PLACEHOLDER.test(line)) return;
    for (const pattern of PATTERNS) {
      if (pattern.re.test(line)) {
        findings.push({ source, line: index + 1, pattern: pattern.name });
        break;
      }
    }
  });
  return findings;
}
