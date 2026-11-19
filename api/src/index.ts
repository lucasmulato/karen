import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "pg";
import { z } from "zod";
import http from "node:http";
import { connect as tlsConnect } from "node:tls";
import { VaultService, NODE_TYPES, EDGE_LABELS } from "./services/vault.js";
import { GraphAgent, chatConfigFromEnv } from "./services/agent.js";
import { EmbeddingService, embeddingConfigFromEnv } from "./services/embeddings.js";
import { leadProviderFromEnv } from "./services/providers.js";
import { LeadService } from "./services/leads.js";
import { CommandService } from "./services/commands.js";
import { CanvasService } from "./services/canvas.js";
import { VaultFsService } from "./services/vaultfs.js";
import { GardenService } from "./services/garden.js";

// 1. Database Connection
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/synapsevault";
const client = new Client({ connectionString: DATABASE_URL });

async function connectDb() {
  try {
    await client.connect();
    console.error("Connected to PostgreSQL");
  } catch (err) {
    console.error("Failed to connect to PostgreSQL:", err);
    process.exit(1);
  }
}

// 2. Shared service - used by both MCP and HTTP so they can't drift apart.
// Cloudflare embeddings are optional; without credentials the vault uses ILIKE.
const embeddingConfig = embeddingConfigFromEnv();
const embeddings = embeddingConfig ? new EmbeddingService(embeddingConfig) : null;
const vault = new VaultService(client, embeddings);

// KAREN lead engine. Cloud Apify keeps the token server-side; when unconfigured
// the endpoints return a clear 503 instead of failing at request time.
const commands = new CommandService(client);
const canvas = new CanvasService(client, vault);
const notes = new VaultFsService();
const garden = new GardenService(client);

const MAX_PLACES = Number(process.env.APIFY_MAX_PLACES ?? 50);
const WEBSITE_FILTER = process.env.APIFY_WEBSITE_FILTER ?? "placesWithoutWebsite";
const leadProvider = leadProviderFromEnv();
const leads = new LeadService(client, leadProvider, {
  operatorName: process.env.OPERATOR_NAME?.trim() || "[Seu Nome]",
  exampleLink:
    process.env.KAREN_EXAMPLE_LINK?.trim() || "[LINK DO SEU CARDAPIFY DE EXEMPLO]",
});

// Optional reasoning layer: only constructed when LLM_API_KEY is set.
const agent = chatConfigFromEnv()
  ? new GraphAgent(chatConfigFromEnv()!, vault, leads, commands, notes, garden)
  : null;

// 3. MCP Server Setup
const server = new Server(
  {
    name: "synapse-vault-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 4. Define Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "add_node",
        description: "Add a new node to SynapseVault (including cyber taxonomy)",
        inputSchema: {
          type: "object",
          properties: {
            type: { type: "string", enum: [...NODE_TYPES] },
            name: { type: "string" },
            description: { type: "string" },
            properties: { type: "object" },
          },
          required: ["type", "name"],
        },
      },
      {
        name: "add_edge",
        description: "Connect two existing nodes with a relationship",
        inputSchema: {
          type: "object",
          properties: {
            source_id: { type: "string", format: "uuid" },
            target_id: { type: "string", format: "uuid" },
            label: {
              type: "string",
              enum: [...EDGE_LABELS],
            },
            properties: { type: "object" },
          },
          required: ["source_id", "target_id", "label"],
        },
      },
      {
        name: "search_nodes",
        description: "Search for nodes by name or type",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            type: { type: "string" },
          },
        },
      },
      {
        name: "get_graph_data",
        description: "Get the full graph (nodes and edges) for visualization",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "add_finding",
        description: "Record a bug-bounty/security finding as a graph node",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            severity: {
              type: "string",
              enum: ["info", "low", "medium", "high", "critical"],
            },
            scope: { type: "string" },
            evidence: { type: "string" },
            fix: { type: "string" },
            cve: { type: "string" },
          },
          required: ["title", "severity", "evidence"],
        },
      },
      {
        name: "link_technique",
        description: "Link a finding to a technique node",
        inputSchema: {
          type: "object",
          properties: {
            finding_id: { type: "string", format: "uuid" },
            technique: { type: "string" },
            relation: {
              type: "string",
              enum: ["exploits", "observed_in", "mitigated_by", "relates_to"],
            },
            cve: { type: "string" },
          },
          required: ["finding_id", "technique", "relation"],
        },
      },
    ],
  };
});

// 5. Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "add_node": {
        const { type, name, description, properties } = args as any;
        const row = await vault.addNode({
          type,
          name,
          description,
          properties,
        });
        return { content: [{ type: "text", text: JSON.stringify(row) }] };
      }

      case "add_edge": {
        const { source_id, target_id, label, properties } = args as any;
        const row = await vault.addEdge({
          source_id,
          target_id,
          label,
          properties,
        });
        return { content: [{ type: "text", text: JSON.stringify(row) }] };
      }

      case "search_nodes": {
        const { query, type } = args as any;
        const rows = await vault.searchNodes(query, type);
        return { content: [{ type: "text", text: JSON.stringify(rows) }] };
      }

      case "get_graph_data": {
        const graph = await vault.getGraph();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(graph),
            },
          ],
        };
      }

      case "add_finding": {
        const { title, severity, scope, evidence, fix, cve } = args as any;
        const row = await vault.addNode({
          type: "finding",
          name: title,
          description:
            `Evidência: ${evidence}\nMitigação: ${fix ?? "não informada"}\n` +
            `CVE: ${cve ?? "não informado"}`,
          properties: { severity, scope: scope ?? null, cve: cve ?? null },
          source: "mcp:add_finding",
        });
        return { content: [{ type: "text", text: JSON.stringify(row) }] };
      }

      case "link_technique": {
        const { finding_id, technique, relation, cve } = args as any;
        const found = await vault.searchNodes(technique, "technique", 1);
        const node =
          found[0] ??
          (await vault.addNode({
            type: "technique",
            name: technique,
            properties: cve ? { cve } : {},
            source: "mcp:link_technique",
          }));
        const edge = await vault.addEdge({
          source_id: finding_id,
          target_id: node.id,
          label: relation,
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ technique: node, edge }) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// 6. HTTP REST surface for the UI
const addNodeSchema = z.object({
  type: z.enum(NODE_TYPES),
  name: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const addEdgeSchema = z.object({
  source_id: z.string().uuid(),
  target_id: z.string().uuid(),
  label: z.enum(EDGE_LABELS),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const patchNodeSchema = z.object({
  properties: z.record(z.string(), z.unknown()),
});

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
});

const scrapeLeadsSchema = z.object({
  query: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  maxPlaces: z.number().int().min(1).max(200).optional(),
  zoom: z.number().int().min(1).max(21).optional(),
  website: z
    .enum(["allPlaces", "placesWithWebsite", "placesWithoutWebsite"])
    .optional(),
});

const commandRequestSchema = z.object({
  commandId: z.string().min(1).max(100),
  args: z.record(z.string(), z.unknown()).optional(),
});

const approvalSchema = z.object({
  token: z.string().min(10).max(200),
});

const noteWriteSchema = z.object({
  path: z.string().min(1).max(300),
  content: z.string().max(60_000),
});

const leadPhoneSchema = z.object({
  phone: z.string().max(40).nullable(),
});

const canvasImportSchema = z.object({
  nodes: z
    .array(
      z
        .object({
          id: z.string(),
          type: z.string(),
          x: z.number(),
          y: z.number(),
          text: z.string(),
        })
        .passthrough()
    )
    .max(1000)
    .default([]),
  edges: z
    .array(
      z
        .object({
          id: z.string().optional(),
          fromNode: z.string(),
          toNode: z.string(),
          label: z.string().optional(),
        })
        .passthrough()
    )
    .max(4000)
    .default([]),
});

// Simple fixed-window per-IP limiter for mutating requests.
const RATE_LIMIT = { windowMs: 60_000, max: 60 };
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  bucket.count += 1;
  // Opportunistic cleanup so the map cannot grow unbounded.
  if (rateBuckets.size > 10_000) {
    for (const [key, b] of rateBuckets) {
      if (b.resetAt < now) rateBuckets.delete(key);
    }
  }
  return bucket.count > RATE_LIMIT.max;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function handleHttp(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  // Shared-secret auth. OpenResty injects X-KAREN-KEY into proxied /api/*
  // requests; direct :3000 access is blocked by the firewall. /api/health
  // stays public for monitoring.
  const apiKey = process.env.KAREN_API_KEY?.trim();
  if (apiKey && path !== "/api/health" && req.headers["x-karen-key"] !== apiKey) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  // No wildcard CORS by default — the UI is served from the same origin.
  // Set CORS_ORIGIN explicitly only if a separate front-end needs access.
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Karen-Key");
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && path === "/api/health") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (req.method === "GET" && path === "/api/health/full") {
      const checks: Record<string, unknown> = { api: "ok" };
      try {
        await client.query("SELECT 1");
        checks.db = "ok";
      } catch {
        checks.db = "error";
      }
      try {
        const r = await fetch("http://127.0.0.1:8080/health", {
          signal: AbortSignal.timeout(3000),
        });
        checks.llama = r.ok ? "ok" : "error";
      } catch {
        checks.llama = "error";
      }
      try {
        // Inspect the certificate actually served, without needing root access
        // to /etc/letsencrypt/live.
        const host =
          process.env.KAREN_PUBLIC_HOST ?? "karen.164.68.109.252.sslip.io";
        checks.cert = await new Promise((resolve) => {
          const socket = tlsConnect(
            { host, port: 443, servername: host, rejectUnauthorized: false },
            () => {
              const cert = socket.getPeerCertificate();
              const days = cert.valid_to
                ? Math.floor((Date.parse(cert.valid_to) - Date.now()) / 86_400_000)
                : undefined;
              resolve({
                status: days !== undefined && days > 0 ? "ok" : "error",
                days,
                expires: cert.valid_to,
              });
              socket.end();
            }
          );
          socket.setTimeout(4000, () => {
            socket.destroy();
            resolve({ status: "unknown" });
          });
          socket.on("error", () => resolve({ status: "unknown" }));
        });
      } catch {
        checks.cert = { status: "unknown" };
      }
      sendJson(res, 200, checks);
      return;
    }

    if (req.method === "GET" && path === "/api/graph") {
      const graph = await vault.getGraph();
      sendJson(res, 200, graph);
      return;
    }

    if (req.method === "GET" && path === "/api/search") {
      const query = url.searchParams.get("query") ?? undefined;
      const type = url.searchParams.get("type") ?? undefined;
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const rows = await vault.searchNodes(query, type, limit);
      sendJson(res, 200, rows);
      return;
    }

    if (req.method === "GET" && path === "/api/context") {
      const question = url.searchParams.get("query");
      if (!question) {
        sendJson(res, 400, { error: "query is required" });
        return;
      }
      sendJson(res, 200, { context: await vault.contextForQuestion(question) });
      return;
    }

    if (req.method === "POST" && path === "/api/embeddings/backfill") {
      if (isRateLimited(req.socket.remoteAddress ?? "unknown")) {
        sendJson(res, 429, { error: "Too many requests" });
        return;
      }
      if (!embeddings) {
        sendJson(res, 503, {
          error:
            "Embeddings disabled: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
        });
        return;
      }
      const batchSize = 32;
      const pending = await vault.getNodesWithoutEmbedding(500);
      let indexed = 0;
      for (let i = 0; i < pending.length; i += batchSize) {
        const batch = pending.slice(i, i + batchSize);
        const vectors = await embeddings.embed(
          batch.map((n) => `${n.name}\n${n.description ?? ""}`)
        );
        for (let j = 0; j < batch.length; j++) {
          await vault.setEmbedding(batch[j].id, vectors[j], embeddings.model);
          indexed++;
        }
      }
      sendJson(res, 200, { indexed, remaining: pending.length - indexed });
      return;
    }

    if (req.method === "POST" && path === "/api/nodes") {
      if (isRateLimited(req.socket.remoteAddress ?? "unknown")) {
        sendJson(res, 429, { error: "Too many requests" });
        return;
      }
      const parsed = addNodeSchema.safeParse(await readBody(req));
      if (!parsed.success) {
        sendJson(res, 400, { error: z.prettifyError(parsed.error) });
        return;
      }
      const row = await vault.addNode(parsed.data);
      sendJson(res, 201, row);
      return;
    }

    if (req.method === "PATCH" && /^\/api\/nodes\/[\da-f-]+$/i.test(path)) {
      if (isRateLimited(req.socket.remoteAddress ?? "unknown")) {
        sendJson(res, 429, { error: "Too many requests" });
        return;
      }
      const parsed = patchNodeSchema.safeParse(await readBody(req));
      if (!parsed.success) {
        sendJson(res, 400, { error: z.prettifyError(parsed.error) });
        return;
      }
      const id = path.split("/").pop()!;
      const row = await vault.updateNodeProperties(id, parsed.data.properties);
      if (!row) {
        sendJson(res, 404, { error: "Node not found" });
        return;
      }
      sendJson(res, 200, row);
      return;
    }

    if (req.method === "POST" && path === "/api/edges") {
      if (isRateLimited(req.socket.remoteAddress ?? "unknown")) {
        sendJson(res, 429, { error: "Too many requests" });
        return;
      }
      const parsed = addEdgeSchema.safeParse(await readBody(req));
      if (!parsed.success) {
        sendJson(res, 400, { error: z.prettifyError(parsed.error) });
        return;
      }
      const row = await vault.addEdge(parsed.data);
      sendJson(res, 201, row);
      return;
    }

    // --- KAREN lead endpoints -------------------------------------------------
    if (req.method === "GET" && path === "/api/leads") {
      sendJson(res, 200, { leads: await leads.list(Number(url.searchParams.get("limit") ?? 100)) });
      return;
    }

    if (req.method === "GET" && path === "/api/leads/estimate") {
      const maxPlaces = Math.min(
        Math.max(Number(url.searchParams.get("maxPlaces") ?? MAX_PLACES), 1),
        200
      );
      sendJson(res, 200, {
        configured: leads.configured,
        provider: leads.providerName,
        maxPlaces,
        estimatedCostUsd: leads.estimate(maxPlaces),
        websiteFilter: WEBSITE_FILTER,
      });
      return;
    }

    if (req.method === "POST" && path === "/api/leads/scrape") {
      if (isRateLimited(req.socket.remoteAddress ?? "unknown")) {
        sendJson(res, 429, { error: "Too many requests" });
        return;
      }
      const parsed = scrapeLeadsSchema.safeParse(await readBody(req));
      if (!parsed.success) {
        sendJson(res, 400, { error: z.prettifyError(parsed.error) });
        return;
      }
      try {
        const result = await leads.scrape(parsed.data);
        sendJson(res, 200, result);
      } catch (err: any) {
        sendJson(res, 502, { error: err.message });
      }
      return;
    }

    if (req.method === "PATCH" && /^\/api\/leads\/[\da-f-]+$/i.test(path)) {
      const id = path.split("/")[3];
      const parsed = leadPhoneSchema.safeParse(await readBody(req));
      if (!parsed.success) {
        sendJson(res, 400, { error: z.prettifyError(parsed.error) });
        return;
      }
      const row = await leads.setPhone(id, parsed.data.phone);
      if (!row) {
        sendJson(res, 404, { error: "Lead not found" });
        return;
      }
      sendJson(res, 200, row);
      return;
    }

    if (req.method === "POST" && /^\/api\/leads\/[\da-f-]+\/suppress$/i.test(path)) {
      const id = path.split("/")[3];
      const row = await leads.suppress(id);
      if (!row) {
        sendJson(res, 404, { error: "Lead not found" });
        return;
      }
      sendJson(res, 200, row);
      return;
    }

    if (req.method === "GET" && path === "/api/garden/data") {
      sendJson(res, 200, await garden.data());
      return;
    }

    if (req.method === "GET" && path === "/api/garden/report") {
      sendJson(res, 200, { report: await garden.report() });
      return;
    }

    // --- Markdown vault / persistent memory ----------------------------------
    if (req.method === "GET" && path === "/api/notes") {
      sendJson(res, 200, { root: notes.root, files: await notes.list() });
      return;
    }

    if (req.method === "GET" && path === "/api/notes/content") {
      const notePath = url.searchParams.get("path") ?? "";
      try {
        sendJson(res, 200, { path: notePath, content: await notes.read(notePath) });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (req.method === "PUT" && path === "/api/notes/content") {
      const parsed = noteWriteSchema.safeParse(await readBody(req));
      if (!parsed.success) {
        sendJson(res, 400, { error: z.prettifyError(parsed.error) });
        return;
      }
      try {
        await notes.write(parsed.data.path, parsed.data.content);
        sendJson(res, 200, { saved: parsed.data.path });
      } catch (err: any) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // --- JSON Canvas portability ---------------------------------------------
    if (req.method === "GET" && path === "/api/graph/canvas") {
      const data = await canvas.export();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="karen-graph.canvas"',
      });
      res.end(JSON.stringify(data));
      return;
    }

    if (req.method === "POST" && path === "/api/graph/canvas/import") {
      if (isRateLimited(req.socket.remoteAddress ?? "unknown")) {
        sendJson(res, 429, { error: "Too many requests" });
        return;
      }
      const parsed = canvasImportSchema.safeParse(await readBody(req));
      if (!parsed.success) {
        sendJson(res, 400, { error: z.prettifyError(parsed.error) });
        return;
      }
      try {
        const result = await canvas.import(parsed.data as any);
        sendJson(res, 200, result);
      } catch (err: any) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // --- KAREN command permissions -------------------------------------------
    if (req.method === "GET" && path === "/api/commands") {
      sendJson(res, 200, {
        definitions: commands.definitions(),
        runs: await commands.runs(50),
      });
      return;
    }

    if (req.method === "GET" && path === "/api/commands/runs") {
      const limit = Number(url.searchParams.get("limit") ?? 50);
      sendJson(res, 200, { runs: await commands.runs(limit) });
      return;
    }

    if (req.method === "POST" && path === "/api/commands/request") {
      if (isRateLimited(req.socket.remoteAddress ?? "unknown")) {
        sendJson(res, 429, { error: "Too many requests" });
        return;
      }
      const parsed = commandRequestSchema.safeParse(await readBody(req));
      if (!parsed.success) {
        sendJson(res, 400, { error: z.prettifyError(parsed.error) });
        return;
      }
      try {
        const result = await commands.request(parsed.data.commandId, "ui", parsed.data.args ?? {});
        sendJson(res, result.status === "not_found" ? 404 : 200, result);
      } catch (err: any) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (req.method === "POST" && /^\/api\/commands\/[\da-f-]+\/(approve|deny)$/i.test(path)) {
      const parts = path.split("/");
      const runId = parts[3];
      const action = parts[4];
      const parsed = approvalSchema.safeParse(await readBody(req));
      if (!parsed.success) {
        sendJson(res, 400, { error: z.prettifyError(parsed.error) });
        return;
      }
      const result =
        action === "approve"
          ? await commands.approve(runId, parsed.data.token)
          : await commands.deny(runId, parsed.data.token);
      sendJson(res, result.status === "unauthorized" ? 403 : 200, result);
      return;
    }

    if (req.method === "GET" && path === "/api/chat/status") {
      sendJson(res, 200, {
        configured: agent !== null,
        name: "KAREN",
        model: agent ? chatConfigFromEnv()!.model : null,
        persona: "karen.md",
        embeddings: embeddings ? embeddings.model : null,
        leads: {
          configured: leads.configured,
          provider: leads.providerName,
          websiteFilter: WEBSITE_FILTER,
          maxPlaces: MAX_PLACES,
        },
      });
      return;
    }

    if (req.method === "POST" && path === "/api/chat") {
      if (isRateLimited(req.socket.remoteAddress ?? "unknown")) {
        sendJson(res, 429, { error: "Too many requests" });
        return;
      }
      if (!agent) {
        sendJson(res, 503, {
          error:
            "Chat disabled: set LLM_API_KEY (and optionally LLM_BASE_URL / LLM_MODEL) to enable it.",
        });
        return;
      }
      const parsed = chatSchema.safeParse(await readBody(req));
      if (!parsed.success) {
        sendJson(res, 400, { error: z.prettifyError(parsed.error) });
        return;
      }
      const result = await agent.chat(parsed.data.message);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err: any) {
    const status =
      err.code === "23503" || err.code === "23505" ? 409 : 400; // FK / unique violations -> conflict
    sendJson(res, status, { error: err.message });
  }
}

// 7. Start Server
async function main() {
  await connectDb();
  await notes.ensureStructure();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SynapseVault MCP Server running on stdio");

  const httpPort = process.env.HTTP_PORT ?? "3000";
  const httpServer = http.createServer(handleHttp);
  httpServer.listen(Number(httpPort), () => {
    console.error(`SynapseVault HTTP API running on http://localhost:${httpPort}`);
  });
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});