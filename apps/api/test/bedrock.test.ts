import { beforeEach, describe, expect, it } from "vitest";
import { ProviderError } from "../src/ai/anthropic.js";
import { bedrockBody, bedrockErrorStatus, createBedrockModel, type BedrockInvoke } from "../src/ai/bedrock.js";
import { aiConfigFromEnv } from "../src/ai/provider.js";
import { createTestApp, type TestApp } from "./helpers.js";

const req = { system: "sistema", messages: [{ role: "user" as const, content: "oi" }], tools: [{ name: "t", description: "d", input_schema: { type: "object" } }], maxTokens: 100 };
const MODEL = "us.anthropic.claude-test-v1:0";

describe("corpo da chamada ao Bedrock", () => {
  it("usa o formato de mensagens da Anthropic com anthropic_version", () => {
    const c = { type: "ephemeral" };
    expect(JSON.parse(bedrockBody(req))).toEqual({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 100,
      system: [{ type: "text", text: "sistema", cache_control: c }],
      messages: [{ role: "user", content: [{ type: "text", text: "oi", cache_control: c }] }],
      tools: [{ name: "t", description: "d", input_schema: { type: "object" }, cache_control: c }],
    });
    expect(JSON.parse(bedrockBody({ ...req, cache: false }))).toEqual({ anthropic_version: "bedrock-2023-05-31", max_tokens: 100, system: "sistema", messages: [{ role: "user", content: "oi" }], tools: [{ name: "t", description: "d", input_schema: { type: "object" } }] });
  });
  it("sem ferramentas, não manda o campo tools; max_tokens tem padrão", () => {
    const body = JSON.parse(bedrockBody({ system: "s", messages: [], tools: [] }));
    expect(body.tools).toBeUndefined();
    expect(body.max_tokens).toBe(4000);
  });
});

describe("createBedrockModel", () => {
  const ok = (json: unknown): BedrockInvoke => async () => ({ status: 200, json });

  it("devolve o conteúdo e o motivo de parada", async () => {
    const out = await createBedrockModel(MODEL, ok({ content: [{ type: "text", text: "olá" }], stop_reason: "end_turn" }), 1000)(req);
    expect(out).toEqual({ content: [{ type: "text", text: "olá" }], stopReason: "end_turn" });
  });

  it("chama o modelo certo", async () => {
    let seen = "";
    await createBedrockModel(MODEL, async (i) => { seen = i.modelId; return { status: 200, json: { content: [] } }; }, 1000)(req);
    expect(seen).toBe(MODEL);
  });

  it("erro do serviço vira ProviderError com o status", async () => {
    const model = createBedrockModel(MODEL, async () => ({ status: 429, json: { message: "Too many requests" } }), 1000);
    await expect(model(req)).rejects.toMatchObject({ status: 429, message: "Too many requests" });
    await expect(model(req)).rejects.toBeInstanceOf(ProviderError);
  });

  it("estouro de tempo e rede caída", async () => {
    const hang: BedrockInvoke = ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("x"), { name: "AbortError" }))));
    await expect(createBedrockModel(MODEL, hang, 20)(req)).rejects.toMatchObject({ status: 0, message: "timeout" });
    await expect(createBedrockModel(MODEL, async () => { throw new Error("socket"); }, 1000)(req)).rejects.toMatchObject({ status: 0, message: "network" });
  });
});

describe("bedrockErrorStatus", () => {
  it("traduz os erros conhecidos", () => {
    expect(bedrockErrorStatus("AccessDeniedException")).toBe(403);
    expect(bedrockErrorStatus("ExpiredTokenException")).toBe(403);
    expect(bedrockErrorStatus("ThrottlingException")).toBe(429);
    expect(bedrockErrorStatus("ValidationException")).toBe(400);
    expect(bedrockErrorStatus("ResourceNotFoundException")).toBe(400);
    expect(bedrockErrorStatus("QualquerOutro")).toBe(500);
  });
});

describe("aiConfigFromEnv", () => {
  it("padrão é Anthropic", () => {
    expect(aiConfigFromEnv({})).toEqual({ provider: "anthropic" });
    expect(aiConfigFromEnv({ AI_PROVIDER: "anthropic", BEDROCK_MODEL_ID: "x" })).toEqual({ provider: "anthropic" });
  });
  it("Bedrock exige o modelo e a região (BEDROCK_REGION ou AWS_REGION)", () => {
    expect(aiConfigFromEnv({ AI_PROVIDER: "bedrock", BEDROCK_MODEL_ID: " m ", AWS_REGION: "us-east-1" })).toEqual({ provider: "bedrock", modelId: "m", region: "us-east-1" });
    expect(aiConfigFromEnv({ AI_PROVIDER: "bedrock", BEDROCK_MODEL_ID: "m", BEDROCK_REGION: "sa-east-1", AWS_REGION: "us-east-1" })).toMatchObject({ region: "sa-east-1" });
    expect(() => aiConfigFromEnv({ AI_PROVIDER: "bedrock", AWS_REGION: "us-east-1" })).toThrow("BEDROCK_MODEL_ID");
    expect(() => aiConfigFromEnv({ AI_PROVIDER: "bedrock", BEDROCK_MODEL_ID: "m" })).toThrow("REGION");
  });
});

describe("chat com Bedrock pela API", () => {
  let app: TestApp;
  let cookies: Record<string, string>;
  let calls: { modelId: string; body: { system: string; tools?: { name: string }[]; messages: { content: unknown }[] } }[];
  let replies: unknown[];

  beforeEach(async () => {
    calls = [];
    replies = [];
    const bedrockInvoke: BedrockInvoke = async ({ modelId, body }) => {
      calls.push({ modelId, body: JSON.parse(body) });
      return { status: 200, json: replies.shift() ?? { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" } };
    };
    app = await createTestApp({ ai: { provider: "bedrock", modelId: MODEL, region: "us-east-1" }, bedrockInvoke });
    cookies = await app.owner();
  });

  it("status mostra o provedor e dispensa chave", async () => {
    expect((await app.call("GET", "/ai/status", { cookies })).body).toEqual({ provider: "bedrock", configured: true, last4: null, model: MODEL, autoApply: false });
  });

  it("chave e remoção não se aplicam: o servidor cuida do acesso", async () => {
    expect((await app.call("PUT", "/ai/key", { cookies, body: { key: "x".repeat(30) } })).body).toEqual({ error: "managed_by_server" });
    expect((await app.call("DELETE", "/ai/key", { cookies })).status).toBe(409);
  });

  it("conversa sem precisar de chave, com as ferramentas do agente e o modelo configurado", async () => {
    replies.push({ content: [{ type: "tool_use", id: "tu1", name: "propose_tasks", input: { tasks: [{ title: "Enviar proposta" }] } }], stop_reason: "tool_use" }, { content: [{ type: "text", text: "Rascunho pronto." }], stop_reason: "end_turn" });
    const res = await app.call("POST", "/chat/send", { cookies, body: { agent: "hermes", text: "cria uma tarefa" } });
    expect(res.status).toBe(200);
    const last = (res.body as { messages: { text: string; drafts: { kind: string }[] }[] }).messages.at(-1)!;
    expect(last.text).toBe("Rascunho pronto.");
    expect(last.drafts.map((d) => d.kind)).toEqual(["tasks"]);
    expect(calls.map((c) => c.modelId)).toEqual([MODEL, MODEL]);
    expect(calls[0]!.body.tools!.map((t) => t.name)).toContain("propose_tasks");
  });

  it("erro de acesso do Bedrock vira invalid_key (permissão do servidor)", async () => {
    const denied = await createTestApp({ ai: { provider: "bedrock", modelId: MODEL, region: "us-east-1" }, bedrockInvoke: async () => ({ status: 403, json: { message: "denied" } }) });
    const c = await denied.owner();
    const res = await denied.call("POST", "/chat/send", { cookies: c, body: { agent: "hermes", text: "oi" } });
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "invalid_key" });
  });
});
