# Progress

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
