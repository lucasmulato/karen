# Convenções de notas da KAREN

Adaptado de práticas públicas: Zettelkasten (groepl/Obsidian-Templates, MIT),
digital gardening (MaggieAppleton/digital-gardeners, MIT) e o formato aberto
JSON Canvas (obsidianmd/jsoncanvas, MIT). Use ao criar ou revisar notas no grafo.

## 1. Nota atômica
- Uma nota = uma ideia. Se o título precisar de "e", provavelmente são duas notas.
- Título em português, curto e afirmativo ("SSRF em metadata service", não "SSRF").
- Comece com 1–2 frases que digam o que é e por que importa.
- Inclua sempre: fonte, data e escopo (autorizado / lab / CTF / defesa).

## 2. Conexões explícitas
- Toda nota deve ter pelo menos uma aresta (`exploits`, `observed_in`,
  `mitigated_by`, `relates_to`, `depends_on`).
- Escreva o link como uma frase que explique a relação, não só um rótulo.

## 3. Maturidade (jardim digital)
- **seedling**: rascunho cru, pode estar errado; registrar a hipótese.
- **budding**: já tem fonte e pelo menos uma conexão; ainda pode mudar.
- **evergreen**: validada, reescrita com as próprias palavras, com exemplo
  pronto para copiar. É a que merece ser reutilizada.

Uma nota não apodrece em pasta: ela ou ganha links e revisões, ou é marcada
como `seedling` e revisitada. Prefira melhorar uma evergreen a criar cinco
rascunhos novos.

## 4. Formato de saída no grafo
- `name`: título da nota.
- `description`: corpo em Markdown simples.
- `properties`: `severity`, `confidence`, `scope`, `source`, `maturity`, `updated_at`.
- Para prospects, use `lead` + mensagens `firstTouch`/`followUp` (nunca envie).

## 5. Portabilidade
- O grafo pode ser exportado como `.canvas` (JSON Canvas 1.0). Posições salvas
  em `properties._x`/`_y` preservam o layout. Nenhum dado fica trancado no banco.
