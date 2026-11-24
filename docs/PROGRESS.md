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

Pendente: URLs/ repos de SAFE-AI e LLM-SEC; `docker compose up` e testes de
bypass; confirmar "AI Safety Residency 2026"/"Private R&D"; definir escopo do
suporte Climara; vídeo/GIF do demo; Lighthouse; EN do site.
