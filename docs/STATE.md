# STATE — Fase 0 (verificado em 2026-11-24)

Repos locais: `karen` (branch `feat/fase0`; branch estacionada
`docs/climara-pricing-and-leads` com 2 commits sem push), `climara-website`
(main), `climara-website-oficial` (main), `karen-backups` (main), `peda`
(master), e `PAI` (clone novo de `lucasmulato/PurpleAgenticInteligence`, main,
HEAD `13dbf2c`).

## SAFE-AI e LLM-SEC
**Não inspecionados.** Não há repos locais nem URLs fornecidas. O teste
`docker compose up` e os bypasses de `/execute` e `/audit` da Fase 0 não
puderam ser executados. Nenhum resultado foi inventado.

## PAI — o que roda
- `python3 core/orchestrator.py` roda e imprime o loop Red → Blue → Guardian →
  "commit". `commit_patch()` **só imprime** — não grava `security_manifest.json`.
- Testes: `/tmp/opencode/pai-venv/bin/python -m pytest -q` em `/home/admin/PAI`
  → **1 falhou, 3 passaram**. A falha é `test_validate_latency_rejection`:
  `time.sleep(0.1)` não atinge o limite de 1200 ms, então o patch é APPROVED.
- Cobertura real: apenas `core/utility_guardian.py`. Sem testes para
  orchestrator, `recovery_manager`, servidores MCP, `rollback.sh` nem manifest.

## PAI — texto vs. código
- `config/ultrarag_pipeline.yaml` está **vazio**, apesar do checkbox
  "ART-T Integration" marcado como feito no README.
- Nomes trocados: `agents/mcp_red_server.py` declara `FastMCP("AgenticBlue")`;
  `agents/mcp_blue_server.py` declara `FastMCP("AgenticRed")`.
- "Corrigir em 1 minuto sem assinatura humana" é texto de visão; o código não
  implementa auto-aplicação e isso contradiz o portão da Karen.
- "Nash Equilibrium" é objetivo de pesquisa, não resultado medido.
- arXiv 2601.13518 = *AgenticRed: Evolving/Optimizing Agentic Systems for
  Red-Teaming* (verificado). arXiv 2512.13526 = *Async Control: Stress-testing
  Asynchronous Control Measures for LLM Agents* (verificado; código em
  `github.com/UKGovernmentBEIS/async-control` — afiliação "UK AISI" inferida
  do código, não explicitada no resumo).
- "AI Safety Residency 2026" e "Private R&D" em repo público: **a confirmar
  com Lucas**.
- Nome: usar **PAI** em todo o texto; repo não renomeado.

## Karen — saídas externas
- Fila de aprovação existe: `/api/dashboard/queue`, com itens de comando
  `severity: critical` / `policy: blocked` e conversas `blocked` (`queue.ts`).
- Saídas: e-mail SMTP para o próprio Lucas (`send-alert.mjs`,
  `send-morning-report.mjs`, `eva-weekly-review.mjs`); links `wa.me` de handoff
  manual (`outreach.ts`); HTTP REST somente em `/api/*` atrás de `auth_request`.
- Nenhum código de envio automático de mensagem a prospect foi encontrado.

## Climara — opções encontradas
- Essencial R$ 397 · Profissional R$ 997 · Premium R$ 1.697 (pagamento único).
- Mensalidade opcional de suporte: 15% do plano (R$ 59,55 / R$ 149,55 /
  R$ 254,55). Escopo do suporte ainda a definir.
- Site público segue **sem preço publicado**; publicar é Tier 2 (EQ-006).
- Contato/WhatsApp para o site: +5511988869469 (número pessoal do Lucas,
  provisório).

## Lacunas
URLs de SAFE-AI/LLM-SEC; vídeo/GIF do demo; vídeos PT/EN; teste Lighthouse;
confirmação de residency/private R&D; escopo do suporte; deploy.
