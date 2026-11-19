import { beforeEach, describe, expect, it } from "vitest";
import type { BedrockInvoke } from "../src/ai/bedrock.js";
import { unwrap } from "../src/writing/routes.js";
import { createTestApp, type TestApp } from "./helpers.js";

/** IA dentro da página: melhorar, explicar e escrever. Devolve Markdown, não salva nada. */

let app: TestApp;
let cookies: Record<string, string>;
let sent: { system: string; user: string; maxTokens: number } | null;
let reply: unknown;

const invoke: BedrockInvoke = async ({ body }) => {
  const parsed = JSON.parse(body) as { system: unknown; max_tokens: number; messages: { content: unknown }[] };
  const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  sent = { system: text(parsed.system), user: text(parsed.messages[0]!.content), maxTokens: parsed.max_tokens };
  return { status: 200, json: reply };
};

const ask = (body: unknown) => app.call("POST", "/ai/writing", { cookies, body });
const answer = (markdown: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text: markdown }] });

beforeEach(async () => {
  sent = null;
  reply = answer("## Kafka\n\n- **Partição**: log ordenado");
  app = await createTestApp({ ai: { provider: "bedrock", modelId: "m", region: "us-east-1" }, bedrockInvoke: invoke });
  cookies = await app.owner();
});

describe("IA na página", () => {
  it("melhorar a página manda a nota inteira e devolve o Markdown", async () => {
    const res = await ask({ action: "improve_page", title: "Kafka", page: "O Kafka divide tópicos em partições. Cada partição é um log ordenado." });
    expect(res.body).toEqual({ markdown: "## Kafka\n\n- **Partição**: log ordenado", truncated: false });
    expect(sent!.user).toContain('titulo="Kafka"');
    expect(sent!.system).toContain("Mantenha TODO o conteúdo");
    expect(sent!.system).toContain("não instrução");
    expect(sent!.maxTokens).toBe(6000);
  });

  it("melhorar e explicar trecho exigem seleção; explicar usa a voz escolhida", async () => {
    expect((await ask({ action: "explain", page: "x" })).body).toEqual({ error: "missing_selection" });
    expect(sent).toBeNull();
    await ask({ action: "explain", page: "nota", selection: "acks=all espera o ISR", voice: "tutor" });
    expect(sent!.system).toContain("Você é o Tutor");
    expect(sent!.user).toContain("<trecho>\nacks=all espera o ISR");
    await ask({ action: "improve_selection", page: "nota", selection: "texto confuso", instruction: "em lista" });
    expect(sent!.user).toContain("Pedido: em lista");
  });

  it("escrever exige o pedido; ações e páginas curtas inválidas param antes da IA", async () => {
    expect((await ask({ action: "write", page: "nota" })).body).toEqual({ error: "missing_instruction" });
    expect((await ask({ action: "improve_page", page: "curta" })).body).toEqual({ error: "page_too_short" });
    expect((await ask({ action: "apagar_tudo" })).status).toBe(400);
    expect(sent).toBeNull();
    await ask({ action: "write", page: "nota", instruction: "um exemplo em Java de consumer" });
    expect(sent!.user).toContain("Pedido do usuário: um exemplo em Java de consumer");
  });

  it("resposta cercada num bloco de código é desembrulhada; resposta cortada é sinalizada", async () => {
    expect(unwrap("```markdown\n## A\ntexto\n```")).toBe("## A\ntexto");
    expect(unwrap("```java\nint x;\n```\n\ntexto")).toBe("```java\nint x;\n```\n\ntexto");
    reply = { stop_reason: "max_tokens", content: [{ type: "text", text: "## Começo" }] };
    expect((await ask({ action: "improve_page", page: "x".repeat(40) })).body).toEqual({ markdown: "## Começo", truncated: true });
  });

  it("sem IA configurada avisa", async () => {
    const plain = await createTestApp();
    const c = await plain.owner();
    expect((await plain.call("POST", "/ai/writing", { cookies: c, body: { action: "write", page: "x", instruction: "y" } })).body).toEqual({ error: "ai_not_configured" });
  });
});
