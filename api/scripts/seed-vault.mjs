#!/usr/bin/env node
/**
 * Seeds a small, interconnected Obsidian-compatible starter vault.
 * Safe to re-run: existing notes are never overwritten.
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(process.env.KAREN_VAULT_DIR ?? "/home/admin/models/karen-vault");

const NOTES = {
  "30 Resources/Metodo Zettelkasten.md": `---
type: resource
tags: [second-brain, metodo]
maturity: evergreen
---
# Metodo Zettelkasten

Uma ideia por nota. Titulo afirmativo e curto, corpo com as proprias palavras, links explicitos para [[Notas Atomicas]] e [[Jardim Digital]].

## Regra pratica
Se o titulo precisa de "e", provavelmente sao duas notas. Cada nova nota deve apontar para pelo menos uma existente — e ganhar um [[Backlinks|link de volta]] quando fizer sentido.

Veja tambem [[KAREN Notes Hub]] e [[Wikilinks]].
`,
  "30 Resources/Notas Atomicas.md": `---
type: resource
tags: [second-brain, metodo]
maturity: budding
---
# Notas Atomicas

Nota atomica = uma ideia, autonoma e reutilizavel. E o blocos basico do [[Metodo Zettelkasten]].

- Titulo que faz sentido sozinho
- 1 a 2 frases no inicio
- Um sinal real ou exemplo
- Pelo menos um link para [[Wikilinks]]

Uma nota atomica bem feita vira [[Maturidade das Notas|evergreen]] com o tempo.
`,
  "30 Resources/Jardim Digital.md": `---
type: resource
tags: [second-brain, escrita]
maturity: evergreen
---
# Jardim Digital

Notas nao sao arquivo morto: sao um jardim. Ideias crescem, sao podadas e se conectam. Inspirado em Maggie Appleton e aplicado no [[KAREN Notes Hub]].

O sistema de maturidade esta em [[Maturidade das Notas]]; o mecanismo de ligacao esta em [[Grafo de Notas]].
`,
  "30 Resources/Maturidade das Notas.md": `---
type: resource
tags: [second-brain, metodo]
maturity: budding
---
# Maturidade das Notas

Tres estagios, do [[Jardim Digital]]:

1. **seedling** — rascunho, pode estar errado
2. **budding** — tem fonte e pelo menos um link
3. **evergreen** — reescrita, validada, com exemplo pronto

A maturidade fica no frontmatter e aparece no Jardim do [[KAREN Notes Hub]].
`,
  "30 Resources/Wikilinks.md": `---
type: resource
tags: [second-brain, obsidian]
maturity: evergreen
---
# Wikilinks

Sintaxe \`[[Nome da Nota]]\` (ou \`[[Nome|alias]]\`). E o que torna as notas interativas no [[KAREN Notes Hub]].

- Cada link cria uma aresta no [[Grafo de Notas]]
- O destino ganha uma entrada em [[Backlinks]]
- O arquivo continua sendo markdown puro, aberto no Obsidian

Comece com [[Notas Atomicas]].
`,
  "30 Resources/Backlinks.md": `---
type: resource
tags: [second-brain, obsidian]
maturity: budding
---
# Backlinks

"Quem aponta para esta nota?". E a metade invisivel dos [[Wikilinks]].

No [[KAREN Notes Hub]], o painel de Backlinks aparece abaixo da nota aberta e permite navegar para a origem. O [[Grafo de Notas]] mostra a mesma informacao de forma visual.
`,
  "30 Resources/Grafo de Notas.md": `---
type: resource
tags: [second-brain, visualizacao]
maturity: budding
---
# Grafo de Notas

Cada nota e um no; cada [[Wikilinks|wikilink]] e uma aresta. O Mapa do [[KAREN Notes Hub]] usa esse grafo, com filtros por tipo e tag.

O mesmo desenho pode ser exportado como [[JSON Canvas]] e tambem espelhado no grafo do Postgres via \`graph_id\`.
`,
  "30 Resources/JSON Canvas.md": `---
type: resource
tags: [obsidian, formato-aberto]
maturity: seedling
---
# JSON Canvas

Formato aberto da Obsidian para canvas infinito: nos com posicao, tamanho, cor e texto; arestas com etiquetas.

O [[KAREN Notes Hub]] exporta e importa o grafo nesse formato, entao o mapa nao fica preso a nenhum banco. Relacionado a [[Grafo de Notas]].
`,
  "10 Projects/KAREN Notes Hub.md": `---
type: project
tags: [karen, second-brain]
maturity: budding
---
# KAREN Notes Hub

O segundo cerebro da KAREN: notas markdown no vault, \`[[Wikilinks]]\`, backlinks, Hub com filtros e o Mapa.

## Como usar
- Escreva notas em \`30 Resources/\`, \`20 Areas/\` ou \`00 Inbox/\`
- Use \`[[\` para inserir links
- Filtre por tipo/tag no Hub
- Dê um \`graph_id\` no painel Propriedades para sincronizar com o grafo do Postgres

Leia [[Metodo Zettelkasten]], [[Jardim Digital]] e [[Grafo de Notas]].
`,
  "20 Areas/Prospeccao Local.md": `---
type: area
tags: [leads, vendas]
maturity: budding
---
# Prospeccao Local

Area responsavel por encontrar pequenos negocios locais que precisam de site/cardapio digital.

Ferramentas: leads via OpenStreetMap (gratis), mensagens no estilo da [[Abordagem 1a1]]. Tudo registrado no [[KAREN Notes Hub]].
`,
  "20 Areas/Abordagem 1a1.md": `---
type: area
tags: [leads, vendas]
maturity: seedling
---
# Abordagem 1a1

Primeira mensagem sem link, com o nome real e um sinal concreto do negocio. Objetivo: conseguir uma resposta, nao vender.

Follow-up 24-48h depois com o link do prototipo. Parte da [[Prospeccao Local]].
`,
  "00 Inbox/Ideias de Automacao.md": `---
type: inbox
tags: [ideias]
maturity: seedling
---
# Ideias de Automacao

- Relatorio semanal do [[Jardim Digital]] por email
- Sugestao automatica de links com base em tags
- Revisao de notas seedling paradas ha 30 dias

Ver [[KAREN Notes Hub]] e [[Maturidade das Notas]].
`,
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

let created = 0;
for (const [relative, content] of Object.entries(NOTES)) {
  const path = join(ROOT, relative);
  await mkdir(dirname(path), { recursive: true });
  if (await exists(path)) continue;
  await writeFile(path, content, "utf8");
  created++;
}
console.log(`Vault: ${ROOT} — ${created} not(as) criada(s), ${Object.keys(NOTES).length - created} ja existiam.`);
