import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyTranscript,
  fallbackPrompts,
  generatePrompts,
  hasNumerals,
} from "../build/services/conversation.js";
import {
  brandsForRole,
  assertBrandAllowed,
  isBrand,
} from "../build/services/brands.js";

test("classificação reconhece interesse explícito", () => {
  const result = classifyTranscript(
    "Oi! Vi o cardápio de vocês. Quanto custa e como funciona? Preciso para o restaurante."
  );
  assert.equal(result.classification, "client");
  assert.ok(result.score >= 0.5);
  assert.match(result.reason, /sinal\(is\) de interesse/);
});

test("recusa explícita nunca vira cliente", () => {
  const result = classifyTranscript(
    "Obrigado, não tenho interesse. Não preciso disso agora, desisti."
  );
  assert.equal(result.classification, "not_client");
  assert.ok(result.score < 0);
});

test("conversa neutra fica incerta, sem inventar cliente", () => {
  const result = classifyTranscript(
    "Bom dia. Só estava olhando o perfil de vocês aqui no Google Maps, obrigado."
  );
  assert.equal(result.classification, "unclear");
});

test("fallback de prompts é específico da marca e não inventa oferta", () => {
  const classified = classifyTranscript("Quanto custa o serviço de vocês?");
  const prompts = fallbackPrompts("climara", classified, "Cliente: quanto custa?");
  assert.match(prompts.system_prompt, /Climara/);
  assert.match(prompts.system_prompt, /energia limpa|solar por assinatura/i);
  assert.match(prompts.system_prompt, /nunca inventar/i);
  assert.equal(hasNumerals(prompts.system_prompt), false);
  assert.equal(hasNumerals(prompts.message), false);
});

test("modelo indisponível não quebra a geração", async () => {
  const previous = process.env.LLM_BASE_URL;
  process.env.LLM_BASE_URL = "http://127.0.0.1:1/v1"; // porta fechada: falha rápida
  const classified = classifyTranscript("Como funciona? Quero saber mais.");
  const result = await generatePrompts("karen", classified, "Cliente: como funciona?");
  assert.equal(result.usedModel, false);
  assert.ok(result.prompts.message.length > 10);
  assert.ok(result.prompts.system_prompt.length > 20);
  if (previous === undefined) delete process.env.LLM_BASE_URL;
  else process.env.LLM_BASE_URL = previous;
});

test("papéis isolam marcas: marketing só vê Climara", () => {
  assert.deepEqual(brandsForRole("marketing", ["karen", "climara"]), ["climara"]);
  assert.deepEqual(brandsForRole("owner"), ["karen", "climara"]);
  assert.equal(assertBrandAllowed("marketing", ["climara"], "climara"), "climara");
  assert.throws(() => assertBrandAllowed("marketing", ["climara"], "karen"), /Sem acesso/);
  assert.throws(() => assertBrandAllowed("owner", undefined, "outra"), /Marca inválida/);
  assert.equal(isBrand("climara"), true);
  assert.equal(isBrand("Nope"), false);
});
