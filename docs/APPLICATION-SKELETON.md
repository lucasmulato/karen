# Esqueleto de candidatura (para revisão do Lucas)

## Pergunta de pesquisa

É possível gerar patches de política para agentes de IA que aumentem a
resistência a ataques sem reduzir a utilidade em tarefas reais abaixo de um
limite aceitável, mantendo aprovação humana por padrão?

## Por que importa

Agentes com acesso a ferramentas executam ações. Filtros probabilísticos e
revisão humana sem trilha deixam lacunas; o que falta é evidência reproduzível
de que uma política mais restritiva não destrói a utilidade do agente.

## O que já existe (com teste)

- SAFE-AI: gate determinístico com `PERMIT` / `REJECT` / `ASK_HUMAN`, trilha em
  `/audit` e parser que rejeita comandos compostos. Testes: SAFE-AI `tests/`.
- PAI: Utility Guardian com 10 tarefas reais da Karen, trava de patches por
  24h, rollback com dry-run, Policy-as-Code e modo padrão `propose_only`.
  Testes: PAI `tests/`.

CONF-2 (Reproducible) overall; CONF-3 (Bounded Model Checking) for core
protocol — redação exata do LLM-SEC, sem aumentar o claim.

## Marcos

| Data | Marco | Artefato público |
|---|---|---|
| 2026-12-15 | Baseline de utilidade e trava de patches publicadas | testes no PAI |
| 2027-01-31 | Política gerada validada contra o SAFE-AI em CI | **Antecipado em 27/11/2026**: `SAFE-AI/app/policy_adapter.py`, `tests/test_generated_policy.py`, `.github/workflows/ci.yml` (11/11 testes locais ok) |
| 2027-03-31 | Primeira medição de resistência com suíte adversarial | relatório com dados brutos |

`S` (resistência) hoje é **não medido**. Nenhum número de benchmark é afirmado.

## Orçamento

- Tempo: a estimar com Lucas por marco (não inventar horas).
- Compute: local, modelo 4B; uso adicional de API só com aprovação e teto
  mensal definido por Lucas.

## Limites e riscos

1. Modos autônomos do PAI são experimentais; padrão é `propose_only`.
2. Servidores MCP do PAI são stubs — não há red team evolutivo real ainda.
3. A política gerada precisa passar nos testes do SAFE-AI antes de uso.
4. Não prometer conformidade com LGPD ou marco legal de IA.
5. Submissão é decidida pelo Lucas (Tier 2).
