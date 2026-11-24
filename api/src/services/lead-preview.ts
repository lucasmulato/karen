/** Static one-page preview built only from public lead facts (Fase 5). */
export interface PreviewLead {
  title: string;
  address?: string | null;
  neighborhood?: string | null;
  category?: string | null;
  phone?: string | null;
}

function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** No photos, no invented services, no contact link unless the phone is real. */
export function renderLeadPreview(lead: PreviewLead): string {
  const name = esc(lead.title || "Negócio");
  const place = esc([lead.neighborhood, lead.address].filter(Boolean).join(" — "));
  const category = esc(lead.category || "negócio local");
  const phone = lead.phone?.trim()
    ? `<p>Contato público: ${esc(lead.phone.trim())}</p>`
    : "<p>Contato a confirmar.</p>";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prévia — ${name}</title><style>body{font:16px/1.6 system-ui;margin:0;background:#f7f8f5;color:#1c2b22}
main{max-width:40rem;margin:3rem auto;padding:0 1rem}h1{font-size:2rem}p{color:#536357}
.flag{background:#fff3cd;border:1px solid #e0c060;padding:.6rem 1rem;border-radius:8px}</style></head>
<body><main><p class="flag">RASCUNHO DE DEMONSTRAÇÃO — não é um site publicado.</p>
<h1>${name}</h1><p>${category}${place ? ` · ${place}` : ""}</p><p>Uma página simples para apresentar o negócio e facilitar o contato.</p>
${phone}</main></body></html>`;
}
