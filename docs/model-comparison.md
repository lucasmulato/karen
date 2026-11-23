# Comparativo de modelos — 23/11/2026

Teste sem risco: o servidor da KAREN (:8080) foi pausado, o 8B subiu sozinho na :8081,
e depois o 4B voltou. Nenhuma config de produção foi alterada.

| Modelo | Prompt tok/s | Geração tok/s | RSS | Tool call (system_status) |
|---|---|---|---|---|
| Qwen3-4B Q4_K_M (`-c 8192 -t 8`) | 5,17 | 5,27 | 5.338 MiB | correto (4,43 tok/s no probe) |
| Qwen3-8B Q4_K_M (`-c 8192 -t 8`) | 3,45 | 3,47 | 9.271 MiB | correto (3,56 tok/s no probe) |

## Conclusão

O 8B **não compensa agora**: 34% mais lento e ~3,9 GiB a mais de RAM (9,3 GiB de 11 GiB
totais, deixando pouca folga para build/scrape). A hipótese de que o 4B 'descrevia a ferramenta'
não se confirmou como diferença de modelo: com o prompt enxuto, **ambos** chamaram
`system_status` corretamente. O problema anterior era o prompt cheio de tools + memória
longa, não a capacidade do 4B.

O arquivo do 8B foi mantido em `/home/admin/models/Qwen3-8B-Q4_K_M.gguf` (4,7 GB) para
novos testes, mas **não está em uso**. Critério para adotar: geração >= 3,5 tok/s E RSS
<= 8 GiB E tool-call correto — passou em velocidade e tool-call, falhou em memória.

Alternativas já implementadas que atacam a causa real: fast path determinístico (sub-segundo
para perguntas rotineiras) e self-context limitado a 1,4k caracteres.

Comando de referência: `LLM_BASE_URL=http://127.0.0.1:8081/v1 LLM_MODEL=qwen8b
LLAMA_PROCESS_MATCH='llama-server.*qwen8b' node scripts/llama-bench.mjs --label qwen8b-c8192-t8`.
