# Progress

## Fase 0 — 2026-11-24

Mudou: branch `feat/fase0` criada a partir de `main`; PAI clonado em
`/home/admin/PAI`; `docs/STATE.md`, `docs/DECISIONS.md` e este arquivo escritos
com fatos verificados e lacunas. Nada foi publicado, enviado ou pushed.

Como testar (comandos exatos executados):

```
cd /home/admin/PAI && python3 core/orchestrator.py
# saída: loop Red → Blue → Guardian → "Patch committed" (apenas print)
cd /home/admin/PAI && /tmp/opencode/pai-venv/bin/python -m pytest -q
# saída: 1 failed, 3 passed (test_validate_latency_rejection falha)
git -C /home/admin/karen status -sb
# ## feat/fase0
```

Fase 0 complementada em 2026-11-24 com SAFE-AI e LLM-SEC clonados. Uvicorn
local substituiu `docker compose` (Docker ausente). Os 3 exemplos do README
passaram; bypasses por `;`, `&&`, pipe e `$(...)` foram confirmados como
PERMIT indevido e alimentarão a Fase 1.

## Fase 1 — 2026-11-24

SAFE-AI em `feat/fase1`: parser normalizado (shlex + rejeição de operadores de
shell), 8 testes verdes, demo com injeção de prompt e ASK_HUMAN interativo,
`--fast`, README com limites, README.en.md e roteiro PT/EN. Bypasses de `;`,
`&&`, pipe e `$(...)` agora retornam REJECT.

## Fase 2 — 2026-11-24

PAI em `feat/fase2`: README em duas camadas, nome PAI, modo padrão
`propose_only`, Utility Guardian com 10 tarefas da Karen, trava de patches por
24h, rollback com dry-run testado, Policy-as-Code para SAFE-AI, threat model e
pergunta de pesquisa. 10 testes verdes.

## Fase 3 — 2026-11-24

PAI em `feat/fase3`: pacote `service/` com escopo de 5 etapas, templates,
checklist de inventário, vertical financeiro, one-pagers PT/EN, proposta
white-label e checklist LGPD. Sem preço inventado e sem promessa de
conformidade. 16 testes verdes.

## Fase 4 — 2026-11-24

Site estático em `PAI/site/`: PT/EN gerados de JSON, `/pai` escondido sem link
no menu, sem backend e sem analytics, transcrição real do demo. 5 testes de
build/conteúdo verdes. Sem deploy.

Pendente: confirmar "AI Safety Residency 2026"/"Private R&D"; definir escopo do
suporte Climara; vídeo/GIF do demo; Lighthouse (não medido); e-mail oficial do
site; `SITE_URL` real.

## Fase 5 — 2026-11-24

Branch `feat/fase5` (sem push). Pipeline Climara como serviços testáveis,
sem envio automático.

Mudou: config de nicho/cidade (`api/config/climara-pipeline.json`), score
explicável de leads, `consent_ledger` append-only com opt-out, Fila Executiva
com no máximo 7 itens e tempo de leitura, gate SAFE-AI fail-closed, isolamento
de texto externo (não vira comando), template de primeiro contato com nota de
revisão jurídica, gerador de prévia estática marcada "rascunho de
demonstração" e relatório de sexta com números "não medido" quando ausentes.

Como testar:

```
cd /home/admin/karen/api
npm test
# 36 tests pass
node scripts/climara-weekly-report.mjs
# imprime cinco números, todos "não medido" sem arquivo de métricas
```

Pendente: integrar o scan OSM ao pipeline com cache/rate limit configurados;
ligar a Fila Executiva à UI; gerar previews em lote; validar a política gerada
com o SAFE-AI em CI; definir canal de envio com o Lucas; revisar o template de
contato com advogado.
