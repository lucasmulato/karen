/**
 * Read-only client proposal portal. A single unguessable token reveals one
 * markdown proposal — nothing else from the vault or the database.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { VaultFsService } from "./vaultfs.js";
import { parseFrontmatter } from "./notelinks.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

function markdownToHtml(text: string): string {
  const lines = text.replace(/^---\n[\s\S]*?\n---\n?/, "").split("\n");
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      if (inList) { out.push("</ul>"); inList = false; }
      const level = heading[1].length;
      out.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${escapeHtml(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (/^\d+\.\s+/.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${escapeHtml(line.replace(/^\d+\.\s+/, ""))}</li>`);
    } else if (!line.trim()) {
      if (inList) { out.push("</ul>"); inList = false; }
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

export interface Proposal {
  client: string;
  title: string;
  status: string;
  expires: string;
  body: string;
  path: string;
}

export class PortalService {
  constructor(private readonly vault: VaultFsService) {}

  async findByToken(token: string): Promise<Proposal | null> {
    if (!/^[a-f0-9]{16,64}$/i.test(token)) return null;
    const dir = join(resolve(this.vault.root), "proposals");
    const files = await readdir(dir).catch(() => []);
    for (const name of files) {
      if (!name.endsWith(".md")) continue;
      const path = `proposals/${name}`;
      const body = await this.vault.read(path).catch(() => "");
      const meta = parseFrontmatter(body);
      const expected = (meta.token ?? "").trim();
      if (expected && expected === token) {
        const title = meta.title || body.split("\n").find((l) => l.startsWith("# "))?.replace(/^#\s*/, "") || name.replace(/\.md$/, "");
        return {
          client: meta.client || "Cliente",
          title,
          status: meta.status || "enviada",
          expires: meta.expires || "",
          body: markdownToHtml(body),
          path,
        };
      }
    }
    return null;
  }

  render(proposal: Proposal): string {
    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Proposta — ${escapeHtml(proposal.client)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#09090b; color:#e4e4e7; font-family:system-ui,-apple-system,sans-serif; line-height:1.6; }
  main { max-width:720px; margin:0 auto; padding:48px 24px; }
  .badge { display:inline-block; border:1px solid #3f3f46; border-radius:999px; padding:4px 12px; font-size:12px; color:#a1a1aa; }
  h1 { font-size:28px; margin:24px 0 8px; }
  h2 { font-size:18px; margin-top:32px; color:#fafafa; }
  h3 { font-size:16px; color:#fafafa; }
  p, li { color:#a1a1aa; }
  ul { padding-left:20px; }
  footer { margin-top:48px; border-top:1px solid #27272a; padding-top:16px; font-size:12px; color:#71717a; }
</style>
</head>
<body><main>
<span class="badge">Proposta · ${escapeHtml(proposal.status)}</span>
<h1>${escapeHtml(proposal.title)}</h1>
<p>Preparada para <strong style="color:#e4e4e7">${escapeHtml(proposal.client)}</strong>${proposal.expires ? ` · válida até ${escapeHtml(proposal.expires)}` : ""}</p>
${proposal.body}
<footer>Documento privado · gerado pela KAREN · não compartilhe este link.</footer>
</main></body></html>`;
  }
}
