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

Pendente: confirmar "AI Safety Residency 2026"/"Private R&D"; definir escopo do
suporte Climara; vídeo/GIF do demo; Lighthouse; EN do site.
