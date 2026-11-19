import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, chatApi } from "../src/api";
import { NetworkError } from "../src/capture-outbox";
import { toolLabel } from "../src/chat-logic";

const enc = new TextEncoder();
const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

function sseResponse(text: string, size = 7, status = 200): Response {
  const bytes = enc.encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
}

const handlers = () => {
  const log: string[] = [];
  return { log, h: { onDelta: (t: string) => log.push(`d:${t}`), onStep: () => log.push("step"), onTool: (e: { name: string; phase: string }) => log.push(`${e.phase}:${e.name}`) } };
};
const final = { conversation: { id: "c1", agent: "hermes", title: "oi", updatedAt: "x" }, messages: [{ id: "m", role: "assistant", text: "Olá, mundo", createdAt: "x", drafts: [] }] };

afterEach(() => vi.unstubAllGlobals());

describe("chatApi.stream", () => {
  it("entrega deltas, passos e ferramentas na ordem e devolve o resultado do done", async () => {
    const fetchMock = vi.fn(async () => sseResponse(ev({ type: "tool", name: "list_goals", phase: "start" }) + ev({ type: "tool", name: "list_goals", phase: "end" }) + ev({ type: "step" }) + ev({ type: "delta", text: "Olá, " }) + ev({ type: "delta", text: "mundo" }) + ev({ type: "done", ...final })));
    vi.stubGlobal("fetch", fetchMock);
    const { log, h } = handlers();
    const res = await chatApi.stream("hermes", "oi", null, h);
    expect(log).toEqual(["start:list_goals", "end:list_goals", "step", "d:Olá, ", "d:mundo"]);
    expect(res).toEqual(final);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/chat/stream");
    expect(JSON.parse(init.body as string)).toEqual({ agent: "hermes", text: "oi" });
  });

  it("manda o id da conversa quando existe", async () => {
    const fetchMock = vi.fn(async () => sseResponse(ev({ type: "done", ...final })));
    vi.stubGlobal("fetch", fetchMock);
    await chatApi.stream("renato", "oi", "c9", handlers().h);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ agent: "renato", text: "oi", conversationId: "c9" });
  });

  it("evento error vira ApiError com status e corpo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(ev({ type: "error", status: 412, body: { error: "no_key" } }))));
    const err = await chatApi.stream("hermes", "oi", null, handlers().h).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 412, body: { error: "no_key" } });
  });

  it("resposta HTTP de erro (fora do fluxo) vira ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 })));
    expect(await chatApi.stream("hermes", "oi", null, handlers().h).catch((e) => e)).toMatchObject({ status: 429, body: { error: "rate_limited" } });
  });

  it("servidor antigo (404) cai no /chat/send", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return url.endsWith("/stream") ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(final), { status: 200 });
    }));
    expect(await chatApi.stream("hermes", "oi", null, handlers().h)).toEqual(final);
    expect(calls).toEqual(["/api/chat/stream", "/api/chat/send"]);
  });

  it("conexão cortada antes do done é falha de rede, não sucesso", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(ev({ type: "delta", text: "meio" }))));
    expect(await chatApi.stream("hermes", "oi", null, handlers().h).catch((e) => e)).toBeInstanceOf(NetworkError);
  });

  it("sem conexão: NetworkError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("failed"); }));
    expect(await chatApi.stream("hermes", "oi", null, handlers().h).catch((e) => e)).toBeInstanceOf(NetworkError);
  });

  it("evento final sem linha em branco ainda vale", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(`data: ${JSON.stringify({ type: "done", ...final })}`)));
    expect(await chatApi.stream("hermes", "oi", null, handlers().h)).toEqual(final);
  });
});

describe("toolLabel", () => {
  it("descreve em português o que cada ferramenta faz", () => {
    expect(toolLabel("list_tasks")).toBe("Consultando suas tarefas…");
    expect(toolLabel("search_notes")).toBe("Buscando nas suas notas…");
    expect(toolLabel("append_to_page")).toBe("Preparando o conteúdo…");
    expect(toolLabel("update_task")).toBe("Preparando a alteração…");
    expect(toolLabel("delete_page")).toBe("Preparando a exclusão…");
    expect(toolLabel("qualquer_outra")).toBe("Trabalhando…");
  });
});
