# Threat model — KAREN

Data: 23/11/2026 · Escopo: instância auto-hospedada em VPS, uso pessoal, custo US$ 0.
Método: inventário de assets → fronteiras de confiança → STRIDE por componente →
riscos ranqueados por probabilidade × impacto. Não é uma auditoria formal; é o
mapa de decisões que orienta o que automatizar e o que manter travado.

## 1. Assets

| Asset | O que contém | Sensibilidade |
|---|---|---|
| `/home/admin/models/karen.env` | LLM key, Cloudflare token, SMTP app password, KAREN_API_KEY, segredo TOTP, passphrase de backup | Crítica |
| `/home/admin/models/karen-web-password` | Basic auth do vhost | Crítica |
| Vault (`MEMORY.md`, `decisions/`, notas) | Memória persistente, decisões, contexto pessoal | Alta |
| Postgres `synapsevault` | `nodes`, `edges`, embeddings, `leads`, `command_runs` | Alta |
| Sessões/cookies | Token HMAC assinado, HttpOnly/Secure/SameSite=Lax | Alta |
| `/portal/<token>` | Propostas de clientes | Média |
| Backups cifrados | Dump do banco + vault, offsite | Alta |
| Nome/host público | `KAREN_PUBLIC_HOST` no env (fora do repo) | Média |

## 2. Fronteiras e fluxos

```
Internet ──443/80──> OpenResty (Basic + TLS) ──/api/──> API :3000 ──> Postgres / vault
                                                  │
                                                  ├──> llama.cpp :8080 (local)
                                                  ├──> Cloudflare Workers AI (embeddings)
                                                  └──> NVD / OSM (leitura gratuita)
Operador ──browser──> /app/ (sessão + TOTP) ──> fila de aprovação
Timers systemd ──> scripts determinísticos ──> api/data/*.json
```

Porta 3000 não é exposta (ufw só 80/443). SSH é key-only
(`PasswordAuthentication no`, `PermitRootLogin prohibit-password`).

## 3. STRIDE resumido

| Componente | S | T | R | I | D | D |
|---|---|---|---|---|---|---|
| OpenResty/API | credenciais no vhost | sessão forjada | rate limit | CORS/wildcard | — | DoS por prompt longo |
| Agente/llama | segredo no prompt | jailbreak via nota | tool loop | **injeção via conteúdo recuperado** | escrita indevida | prompt enorme |
| Vault/Postgres | — | — | backup | dados sensíveis em nota | perda/editação | disco |
| Integrações | token Cloudflare | — | API externa muda | texto enviado ao provider | — | rate limit NVD |
| Timers | env | — | relatório stale | — | mutação sem audit | — |

## 4. Riscos ranqueados

### T1 — Injeção de prompt → escrita no vault/memória (PROBÁVEL × ALTO)
Conteúdo de notas, grafo e KB entra no contexto do modelo. Antes das
remediações abaixo, ferramentas como `write_note`, `remember`, `decision_log`,
`add_node` e `add_edge` executavam sem gate — uma nota maliciosa poderia
envenenar `MEMORY.md` de forma persistente.

**Mitigação atual:** trechos recuperados são declarados explicitamente como
dados não-confiáveis; ferramentas de escrita exigem intent explícito na
mensagem do operador (`agent-guard.ts`). `MEMORY.md` continua append-only.

**Residual:** o detector de intenção é defesa em profundidade, não uma prova;
um operador que peça "crie X" de forma ampla abre o gate. Comandos shell seguem
atrás da allowlist e aprovação humana.

### T2 — Segredo enviado a provider externo (POUCO PROBÁVEL × CRÍTICO)
Embeddings e prompts podem incluir texto de notas com tokens. A Cloudflare
declara zero data retention, mas isso não substitui não enviar.

**Mitigação atual:** `redactSecrets()` sanitiza todo input antes de
`/v1/embeddings`; varredura diária no repo/vault; token da Cloudflare fora do
repo; nenhum segredo em log, e-mail ou prompt de teste.

**Residual:** o scan é por padrão — um segredo com formato novo pode passar.

### T3 — Comandos de leitura auto-executados (POUCO PROBÁVEL × MÉDIO)
A allowlist roda comandos `read` automaticamente. Uma injeção poderia forçar
leitura de arquivo e devolver o conteúdo no chat.

**Mitigação:** allowlist fixa, `spawn` sem shell, sem argumentos vindos do
modelo, policy `auto` apenas para leitura; escrita exige aprovação no painel.

### T4 — Sessão/web (POUCO PROBÁVEL × ALTO)
Cookies `HttpOnly; Secure; SameSite=Lax`, TOTP, rate limit, revogação de
sessões, comparação por hash (nunca token em claro), CORS sem wildcard.

**Residual:** não há token CSRF explícito; `SameSite=Lax` mitiga. Basic auth é
camada extra, não substituto de MFA.

### T5 — SSH (PROBÁVEL × BAIXO)
~8.600 falhas/24h de scanners. Como password auth está desligada e root é
`prohibit-password`, é ruído — não vetor de entrada. Correlação é somente
leitura; nenhum bloqueio automático.

**Residual:** volume de log; fail2ban opcional apenas para reduzir ruído.

### T6 — Supply chain e backup (POUCO PROBÁVEL × ALTO)
`npm audit` semanal sem auto-patch; build/publicação com gate de teste e
rollback; backup cifrado com passphrase no env; restore drill já executado.

**Residual:** passphrase e chaves vivem no mesmo env — comprometer o env
compromete tudo. É um single point of failure aceito para manter o custo zero.

## 5. Remediações aplicadas nesta rodada

1. `agent-guard.ts` — conteúdo recuperado marcado como não-confiável e
   ferramentas de escrita exigem pedido explícito do operador.
2. `redact.ts` — sanitização de credenciais antes de qualquer embedding.
3. Varredura de segredos sem achados; nota de exemplo com valor mascarado;
   testes unitários com tokens falsos foram excluídos do scan.

## 6. Riscos aceitos / fora de escopo

- Nenhum envio de WhatsApp/e-mail para terceiros, conta, pagamento ou assinatura.
- Nenhum auto-patch de dependência, restore de backup ou deploy sem aprovação.
- Nenhum bloqueio automático de IP (decisão humana).
- Threat modeling é revisitado quando uma nova integração externa entrar.

## 7. Cadência

Revisar este documento a cada nova ferramenta com acesso a escrita ou novo
provider externo, e sempre que o scan de segredos ou a correlação de auth
apontarem algo novo.
