/**
 * Defense-in-depth for agent tool calls.
 *
 * Retrieved notes/KB are untrusted data. Mutating tools require an explicit
 * directive from the operator's own message — not from tool results or notes.
 */

export const MUTATING_TOOLS = new Set([
  "add_node",
  "add_edge",
  "add_finding",
  "link_technique",
  "write_note",
  "remember",
  "decision_log",
  "set_context",
  "set_mode",
]);

const MUTATION_INTENT =
  /\b(escreva|escrever|salve|salvar|registre|registrar|anote|anotar|lembre|lembrar|crie|criar|adicione|adicionar|vincule|vincular|mude|mudar|defina|definir|altere|alterar|exclua|excluir|remova|remover|apague|apagar|write|save|record|remember|create|add|link|set|delete|update)\b/i;

/** True only when the operator's own message explicitly asks for a change. */
export function hasMutationIntent(message: string): boolean {
  return MUTATION_INTENT.test(String(message ?? ""));
}

export function isMutatingTool(name: string): boolean {
  return MUTATING_TOOLS.has(name);
}
