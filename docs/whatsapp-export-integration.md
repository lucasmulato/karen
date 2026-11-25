# Integração de exportação do WhatsApp — rascunho

Status: **rascunho**; depende de `approve EQ-WA-01`. Nenhuma escrita no banco.

## Fluxo

1. Lucas exporta o `.txt` localmente e informa o caminho.
2. `scripts/parse-whatsapp-export.mjs` lê o arquivo, extrai telefones e faz
   `SELECT` em `leads` para comparar. Nunca grava.
3. A saída é uma proposta JSON com `approvalId`, `updates` e `skippedSuppressed`.
4. Lucas aprova o `approvalId` na Fila Executiva.
5. Só depois um endpoint autenticado aplica a mudança — ainda não implementado.

## Migração aditiva proposta (após backup/restore-drill)

```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
```

## Endpoint proposto

```
POST /api/leads/:id/engaged
body: { "approvalId": "WA-ENGAGE-2026-11-25", "lastInteractionAt": "ISO" }
```

Regras: sessão obrigatória; `approvalId` precisa existir na Fila Executiva e
estar `approved`; leads `suppressed` nunca são atualizados; nenhuma mensagem é
enviada; resposta devolve o lead com `status: engaged`.

## Privacidade

- O arquivo de exportação é lido localmente e nunca sai do host.
- A proposta guarda apenas telefone normalizado, timestamp e `leadId` — não o
  conteúdo das mensagens.
- Revisar com advogado antes de usar em escala (LGPD).
