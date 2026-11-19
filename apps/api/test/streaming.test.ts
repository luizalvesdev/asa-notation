import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError, createModel, type FetchLike, type ModelRequest } from "../src/ai/anthropic.js";
import { createBedrockModel, type BedrockStream } from "../src/ai/bedrock.js";
import { StreamError, assemble, parseSse, type StreamEvent } from "../src/ai/stream.js";
import { runTurn } from "../src/chat/agent.js";
import { eventStream } from "../src/chat/routes.js";
import { createTestApp, type TestApp } from "./helpers.js";

const enc = new TextEncoder();
const sse = (events: unknown[]) => events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join("");
async function* chunks(text: string, size: number): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < text.length; i += size) yield enc.encode(text.slice(i, i + size));
}
async function* events(list: StreamEvent[]): AsyncGenerator<StreamEvent> {
  yield* list;
}
const collect = async <T>(it: AsyncIterable<T>) => {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
};

const textEvents = (...parts: string[]): StreamEvent[] => [
  { type: "message_start" },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  ...parts.map((text): StreamEvent => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })),
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn" } },
  { type: "message_stop" },
];
const toolEvents = (id: string, name: string, ...json: string[]): StreamEvent[] => [
  { type: "content_block_start", index: 0, content_block: { type: "tool_use", id, name } },
  ...json.map((partial_json): StreamEvent => ({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json } })),
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "tool_use" } },
];

describe("leitor SSE", () => {
  it("junta linhas partidas entre pedaços, em qualquer tamanho", async () => {
    const body = sse([{ type: "a", n: 1 }, { type: "b", n: 2 }, { type: "c", n: 3 }]);
    for (const size of [1, 3, 7, 1000]) expect(await collect(parseSse(chunks(body, size)))).toEqual([{ type: "a", n: 1 }, { type: "b", n: 2 }, { type: "c", n: 3 }]);
  });

  it("aceita CRLF, comentários, [DONE] e JSON quebrado sem travar", async () => {
    const raw = ": ping\r\n\r\ndata: {\"type\":\"ok\"}\r\n\r\ndata: nao-json\n\ndata: [DONE]\n\n";
    expect(await collect(parseSse(chunks(raw, 5)))).toEqual([{ type: "ok" }]);
  });

  it("evento sem linha em branco no fim ainda sai", async () => {
    expect(await collect(parseSse(chunks('data: {"type":"fim"}', 4)))).toEqual([{ type: "fim" }]);
  });

  it("não perde caractere acentuado partido entre pedaços", async () => {
    const bytes = enc.encode('data: {"type":"t","text":"ação ✓"}\n\n');
    async function* split() {
      yield bytes.slice(0, 22);
      yield bytes.slice(22);
    }
    expect(await collect(parseSse(split()))).toEqual([{ type: "t", text: "ação ✓" }]);
  });
});

describe("montagem da resposta em fluxo", () => {
  it("texto: avisa cada pedaço e devolve o conjunto", async () => {
    const seen: string[] = [];
    const out = await assemble(events(textEvents("Olá", ", ", "mundo")), (t) => seen.push(t));
    expect(seen).toEqual(["Olá", ", ", "mundo"]);
    expect(out).toEqual({ content: [{ type: "text", text: "Olá, mundo" }], stopReason: "end_turn" });
  });

  it("chamada de ferramenta: junta o JSON em pedaços", async () => {
    const out = await assemble(events(toolEvents("tu1", "list_tasks", '{"from":"2026-', '11-18","to":', '"2026-11-19"}')));
    expect(out).toEqual({ content: [{ type: "tool_use", id: "tu1", name: "list_tasks", input: { from: "2026-11-18", to: "2026-11-19" } }], stopReason: "tool_use" });
  });

  it("ferramenta sem argumentos (JSON vazio) vira objeto vazio", async () => {
    const out = await assemble(events(toolEvents("t", "list_goals")));
    expect(out.content).toEqual([{ type: "tool_use", id: "t", name: "list_goals", input: {} }]);
  });

  it("JSON da ferramenta cortado no meio vira entrada vazia, não exceção", async () => {
    const out = await assemble(events(toolEvents("t", "x", '{"a": [1,')));
    expect(out.content).toEqual([{ type: "tool_use", id: "t", name: "x", input: {} }]);
  });

  it("texto e depois ferramenta, em blocos separados", async () => {
    const out = await assemble(
      events([
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Vou buscar." } },
        { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "t", name: "search_notes" } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"query":"raft"}' } },
        { type: "message_delta", delta: { stop_reason: "tool_use" } },
      ]),
    );
    expect(out.content).toEqual([{ type: "text", text: "Vou buscar." }, { type: "tool_use", id: "t", name: "search_notes", input: { query: "raft" } }]);
  });

  it("max_tokens chega como motivo de parada", async () => {
    const list = textEvents("cortado");
    list[list.length - 2] = { type: "message_delta", delta: { stop_reason: "max_tokens" } };
    expect((await assemble(events(list))).stopReason).toBe("max_tokens");
  });

  it("erro dentro do fluxo vira StreamError", async () => {
    await expect(assemble(events([{ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }]))).rejects.toMatchObject({ kind: "overloaded_error", message: "Overloaded" });
    await expect(assemble(events([{ type: "error", error: { type: "overloaded_error", message: "x" } }]))).rejects.toBeInstanceOf(StreamError);
  });
});

describe("Anthropic em fluxo", () => {
  const stream = (text: string): FetchLike => async (_url, init) => {
    expect(JSON.parse(init.body).stream).toBe(true);
    return { ok: true, status: 200, json: async () => ({}), body: chunks(text, 9) };
  };

  it("pede stream, lê o corpo em pedaços e avisa o texto", async () => {
    const seen: string[] = [];
    const out = await createModel("k", "m", stream(sse(textEvents("Bom ", "dia"))), 1000)({ system: "s", messages: [], tools: [], onText: (t) => seen.push(t) });
    expect(seen).toEqual(["Bom ", "dia"]);
    expect(out.content).toEqual([{ type: "text", text: "Bom dia" }]);
  });

  it("sem onText, não pede stream (resposta inteira, como antes)", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl: FetchLike = async (_u, init) => {
      body = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }) };
    };
    await createModel("k", "m", fetchImpl, 1000)({ system: "s", messages: [], tools: [] });
    expect(body.stream).toBeUndefined();
  });

  it("erro HTTP antes do fluxo continua virando ProviderError com o status", async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "Rate limited" } }), body: chunks("x", 1) });
    await expect(createModel("k", "m", fetchImpl, 1000)({ system: "s", messages: [], tools: [], onText: () => undefined })).rejects.toMatchObject({ status: 429, message: "Rate limited" });
  });

  it("erro no meio do fluxo vira ProviderError com status equivalente", async () => {
    const body = sse([...textEvents("par").slice(0, 3), { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }]);
    await expect(createModel("k", "m", stream(body), 1000)({ system: "s", messages: [], tools: [], onText: () => undefined })).rejects.toMatchObject({ status: 429 });
  });

  it("servidor que não manda corpo em fluxo cai na resposta inteira", async () => {
    const fetchImpl: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "inteira" }], stop_reason: "end_turn" }) });
    const out = await createModel("k", "m", fetchImpl, 1000)({ system: "s", messages: [], tools: [], onText: () => undefined });
    expect(out.content).toEqual([{ type: "text", text: "inteira" }]);
  });
});

describe("Bedrock em fluxo", () => {
  it("usa o fluxo quando há onText e junta os eventos", async () => {
    const seen: string[] = [];
    const bedrockStream: BedrockStream = () => events(textEvents("a", "b"));
    const model = createBedrockModel("m", async () => ({ status: 500, json: {} }), 1000, bedrockStream);
    const out = await model({ system: "s", messages: [], tools: [], onText: (t) => seen.push(t) });
    expect(seen).toEqual(["a", "b"]);
    expect(out.content).toEqual([{ type: "text", text: "ab" }]);
  });

  it("sem onText usa a chamada comum", async () => {
    const bedrockStream: BedrockStream = () => { throw new Error("não devia usar o fluxo"); };
    const model = createBedrockModel("m", async () => ({ status: 200, json: { content: [{ type: "text", text: "inteira" }], stop_reason: "end_turn" } }), 1000, bedrockStream);
    expect((await model({ system: "s", messages: [], tools: [] })).content).toEqual([{ type: "text", text: "inteira" }]);
  });

  it("erro do fluxo (ProviderError) sobe com o status", async () => {
    const bedrockStream: BedrockStream = async function* () { throw new ProviderError(403, "sem acesso"); };
    const model = createBedrockModel("m", async () => ({ status: 200, json: {} }), 1000, bedrockStream);
    await expect(model({ system: "s", messages: [], tools: [], onText: () => undefined })).rejects.toMatchObject({ status: 403 });
  });

  it("erro dentro do fluxo vira ProviderError", async () => {
    const bedrockStream: BedrockStream = () => events([{ type: "error", error: { type: "overloaded_error", message: "x" } }]);
    const model = createBedrockModel("m", async () => ({ status: 200, json: {} }), 1000, bedrockStream);
    await expect(model({ system: "s", messages: [], tools: [], onText: () => undefined })).rejects.toMatchObject({ status: 429 });
  });
});

describe("agente repassa o andamento", () => {
  it("onText, onStep e onTool na ordem certa", async () => {
    const log: string[] = [];
    const replies = [
      { content: [{ type: "text" as const, text: "Vou ver." }, { type: "tool_use" as const, id: "t", name: "list_goals", input: {} }], stopReason: "tool_use" },
      { content: [{ type: "text" as const, text: "Pronto." }], stopReason: "end_turn" },
    ];
    const model = vi.fn(async (req: { onText?: (t: string) => void }) => {
      const r = replies.shift()!;
      for (const b of r.content) if (b.type === "text") req.onText?.(b.text);
      return r;
    });
    await runTurn([], "oi", { system: "s", specs: [], handlers: { list_goals: async () => "[]" }, model, onText: (t) => log.push(`text:${t}`), onStep: () => log.push("step"), onTool: (e) => log.push(`${e.phase}:${e.name}`) });
    expect(log).toEqual(["text:Vou ver.", "start:list_goals", "end:list_goals", "step", "text:Pronto."]);
  });

  it("sem ganchos, o modelo não recebe onText (nada de fluxo à toa)", async () => {
    const model = vi.fn(async (_req: ModelRequest) => ({ content: [{ type: "text" as const, text: "ok" }], stopReason: "end_turn" }));
    await runTurn([], "oi", { system: "s", specs: [], handlers: {}, model });
    expect(model.mock.calls[0]![0]).not.toHaveProperty("onText");
  });
});

describe("eventStream", () => {
  it("entrega os eventos na ordem e fecha com done", async () => {
    const out = await collect(eventStream(async (h) => {
      h.onText?.("a");
      h.onTool?.({ name: "x", phase: "start" });
      await new Promise((r) => setTimeout(r, 5));
      h.onStep?.();
      h.onText?.("b");
      return { status: 200, body: { conversation: { id: "c" }, messages: [] } };
    }));
    expect(out).toEqual([{ type: "delta", text: "a" }, { type: "tool", name: "x", phase: "start" }, { type: "step" }, { type: "delta", text: "b" }, { type: "done", conversation: { id: "c" }, messages: [] }]);
  });

  it("resposta de erro vira evento error com status e corpo", async () => {
    expect(await collect(eventStream(async () => ({ status: 412, body: { error: "no_key" } })))).toEqual([{ type: "error", status: 412, body: { error: "no_key" } }]);
  });

  it("exceção vira error 500 sem lançar", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await collect(eventStream(async () => { throw new Error("boom"); }))).toEqual([{ type: "error", status: 500, body: { error: "internal_error" } }]);
    spy.mockRestore();
  });

  it("eventos emitidos de uma vez, sem esperar, não se perdem", async () => {
    const out = await collect(eventStream(async (h) => {
      for (let i = 0; i < 50; i++) h.onText?.(String(i));
      return { status: 200, body: {} };
    }));
    expect(out).toHaveLength(51);
    expect(out[49]).toEqual({ type: "delta", text: "49" });
  });
});

describe("POST /chat/stream", () => {
  let app: TestApp;
  let cookies: Record<string, string>;
  const KEY = "sk-ant-api03-chave-de-teste-1234567890-ABCD";
  let script: string[];
  let calls: { stream?: boolean; messages: unknown[] }[];

  beforeEach(async () => {
    script = [];
    calls = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      const body = JSON.parse(init.body) as { stream?: boolean; messages: unknown[]; max_tokens: number };
      if (body.max_tokens === 8) return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }) };
      calls.push(body);
      const next = script.shift() ?? sse(textEvents("ok"));
      return { ok: true, status: 200, json: async () => ({}), body: chunks(next, 11) };
    };
    app = await createTestApp({ fetchImpl });
    cookies = await app.owner();
    await app.call("PUT", "/ai/key", { cookies, body: { key: KEY } });
  });

  const stream = async (body: Record<string, unknown>) => {
    const res = await app.call("POST", "/chat/stream", { cookies, body });
    return { res, events: res.stream ? ((await collect(res.stream)) as Record<string, any>[]) : [] };
  };

  it("responde em fluxo: deltas e, no fim, done com as mensagens", async () => {
    script.push(sse(textEvents("Bom ", "dia", "!")));
    const { res, events } = await stream({ agent: "hermes", text: "oi" });
    expect(res.status).toBe(200);
    expect(events.filter((e) => e.type === "delta").map((e) => e.text)).toEqual(["Bom ", "dia", "!"]);
    const done = events.at(-1)!;
    expect(done.type).toBe("done");
    expect(done.messages.map((m: { role: string; text: string }) => [m.role, m.text])).toEqual([["user", "oi"], ["assistant", "Bom dia!"]]);
    expect(done.conversation.title).toBe("oi");
    expect(calls[0]!.stream).toBe(true);
  });

  it("com ferramenta: tool start/end, step e o texto final só do último passo", async () => {
    script.push(sse([...toolEvents("t1", "list_goals", "{}")]), sse(textEvents("Sem metas.")));
    const { events } = await stream({ agent: "hermes", text: "metas?" });
    expect(events.map((e) => e.type === "tool" ? `tool:${e.phase}` : e.type)).toEqual(["tool:start", "tool:end", "step", "delta", "done"]);
    expect(events.at(-1)!.messages.at(-1).text).toBe("Sem metas.");
  });

  it("a conversa fica igual à do /chat/send (histórico reenviado ao modelo)", async () => {
    script.push(sse(textEvents("Olá")), sse(textEvents("De novo")));
    const first = await stream({ agent: "renato", text: "um" });
    const id = first.events.at(-1)!.conversation.id;
    await stream({ agent: "renato", text: "dois", conversationId: id });
    expect(calls[1]!.messages).toHaveLength(3);
    const open = await app.call("GET", `/chat/conversations/${id}`, { cookies });
    expect((open.body as { messages: { text: string }[] }).messages.map((m) => m.text)).toEqual(["um", "Olá", "dois", "De novo"]);
  });

  it("rascunho criado durante o fluxo vem no done", async () => {
    script.push(sse(toolEvents("t1", "propose_capture", '{"text":"estudar raft"}')), sse(textEvents("Deixei um rascunho.")));
    const { events } = await stream({ agent: "renato", text: "anota" });
    expect(events.at(-1)!.messages.at(-1).drafts).toHaveLength(1);
  });

  it("erros de validação e de chave chegam como evento error", async () => {
    expect((await stream({ agent: "x", text: "oi" })).events).toEqual([{ type: "error", status: 400, body: { error: "invalid_agent" } }]);
    await app.call("DELETE", "/ai/key", { cookies });
    expect((await stream({ agent: "hermes", text: "oi" })).events).toEqual([{ type: "error", status: 412, body: { error: "no_key" } }]);
  });

  it("exige sessão", async () => {
    expect((await app.call("POST", "/chat/stream", { body: { agent: "hermes", text: "oi" } })).status).toBe(401);
  });
});
