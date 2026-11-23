#!/usr/bin/env node
/**
 * Sends one prompt to a GraphAgent built from the current env (LLM_BASE_URL,
 * LLM_MODEL) and prints the reply + tool actions. Used to compare models
 * without touching the running server.
 *
 *   LLM_BASE_URL=http://127.0.0.1:8081/v1 LLM_MODEL=qwen8b \
 *     node scripts/agent-probe.mjs "Use system_status e cite os números"
 */
import { Client } from "pg";
import { GraphAgent, chatConfigFromEnv } from "../build/services/agent.js";
import { VaultService } from "../build/services/vault.js";
import { VaultFsService } from "../build/services/vaultfs.js";
import { DiagnosisService } from "../build/services/diagnosis.js";
import { BriefService } from "../build/services/brief.js";

const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) { console.error("Uso: agent-probe.mjs <prompt>"); process.exit(1); }

const config = chatConfigFromEnv();
if (!config) { console.error("LLM não configurado no env"); process.exit(1); }

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/synapsevault",
});
await client.connect();
try {
  const diagnosis = new DiagnosisService(client);
  const agent = new GraphAgent(
    config,
    new VaultService(client, null),
    null,
    null,
    null,
    null,
    diagnosis,
    new BriefService(client, new VaultFsService(), diagnosis)
  );
  const result = await agent.chat(prompt);
  console.log(JSON.stringify({ model: config.model, reply: result.reply, actions: result.actions }, null, 2));
} finally {
  await client.end();
}
