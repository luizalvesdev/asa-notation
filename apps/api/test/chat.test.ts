import { beforeEach, describe, expect, it } from "vitest";
import type { Block, ModelMessage, ModelRequest, ModelResponse } from "../src/ai/anthropic.js";
import { MAX_STEPS, runTurn, trimHistory } from "../src/chat/agent.js";
import { markdownToDoc } from "../src/chat/markdown.js";
import { decryptSecret, encryptSecret, secretsKey } from "../src/secrets/crypto.js";
import { createTestApp, doc, type TestApp } from "./helpers.js";

describe("cofre de segredos", () => {
  const key = secretsKey("s".repeat(40));
  it("cifra e decifra", () => {
    const enc = encryptSecret("sk-ant-segredo-1234", key);
    expect(enc).not.toContain("segredo");
    expect(decryptSecret(enc, key)).toBe("sk-ant-segredo-1234");
  });
  it("cada cifra é diferente (iv novo)", () => {
    expect(encryptSecret("x".repeat(20), key)).not.toBe(encryptSecret("x".repeat(20), key));
  });
  it("chave errada ou valor adulterado dão null", () => {
    const enc = encryptSecret("abc-12345678901234567890", key);
    expect(decryptSecret(enc, secretsKey("outra-chave-bem-longa-0123456789012"))).toBeNull();
    const raw = Buffer.from(enc, "base64");
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 1;
    expect(decryptSecret(raw.toString("base64"), key)).toBeNull();
    expect(decryptSecret("curto", key)).toBeNull();
  });
});

describe("markdownToDoc", () => {
  it("títulos, parágrafos, listas e tarefas", () => {
    const d = markdownToDoc("# Plano\n\ntexto\n\n- a\n- b\n\n- [x] feito\n- [ ] falta");
    expect(d.content.map((n) => (n as { type: string }).type)).toEqual(["heading", "paragraph", "bulletList", "taskList"]);
    const tasks = (d.content[3] as { content: { attrs: { checked: boolean } }[] }).content;
    expect(tasks.map((t) => t.attrs.checked)).toEqual([true, false]);
  });
  it("vazio vira um parágrafo vazio", () => {
    expect(markdownToDoc("").content).toEqual([{ type: "paragraph", content: [] }]);
  });
});

// ---- agente com modelo de mentira ----------------------------------------------------------

const say = (text: string): ModelResponse => ({ content: [{ type: "text", text }], stopReason: "end_turn" });
const useTool = (name: string, input: Record<string, unknown>, id = "t1"): ModelResponse => ({ content: [{ type: "tool_use", id, name, input }], stopReason: "tool_use" });

function scripted(responses: ModelResponse[]) {
  const requests: ModelRequest[] = [];
  return { requests, model: async (req: ModelRequest) => { requests.push(JSON.parse(JSON.stringify(req))); return responses.shift() ?? say("fim"); } };
}

describe("runTurn", () => {
  it("resposta simples: uma ida ao modelo", async () => {
    const { model, requests } = scripted([say("Oi!")]);
    const out = await runTurn([], "olá", { system: "s", specs: [], handlers: {}, model });
    expect(out.text).toBe("Oi!");
    expect(out.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(requests).toHaveLength(1);
  });

  it("executa a ferramenta e devolve o resultado ao modelo", async () => {
    const { model, requests } = scripted([useTool("soma", { a: 2 }), say("Deu 5")]);
    const out = await runTurn([], "soma", { system: "s", specs: [], handlers: { soma: async (i) => String(Number(i.a) + 3) }, model });
    expect(out.text).toBe("Deu 5");
    expect(out.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    const result = (requests[1]!.messages[2]!.content as Block[])[0]!;
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t1", content: "5" });
  });

  it("ferramenta que falha ou não existe vira resultado com erro, sem derrubar o turno", async () => {
    const { model, requests } = scripted([{ content: [{ type: "tool_use", id: "a", name: "quebra", input: {} }, { type: "tool_use", id: "b", name: "nada", input: {} }], stopReason: "tool_use" }, say("ok")]);
    const out = await runTurn([], "x", { system: "s", specs: [], handlers: { quebra: async () => { throw new Error("falhou"); } }, model });
    expect(out.text).toBe("ok");
    const results = requests[1]!.messages[2]!.content as { is_error?: boolean; content: string }[];
    expect(results.map((r) => [r.is_error, r.content])).toEqual([[true, "falhou"], [true, "Ferramenta desconhecida: nada"]]);
  });

  it("para depois de MAX_STEPS idas e vindas", async () => {
    const loop = Array.from({ length: MAX_STEPS + 2 }, () => ({ content: [{ type: "text", text: "pensando" } as Block, { type: "tool_use", id: "x", name: "t", input: {} } as Block], stopReason: "tool_use" }));
    const { model, requests } = scripted(loop);
    const out = await runTurn([], "x", { system: "s", specs: [], handlers: { t: async () => "r" }, model });
    expect(requests).toHaveLength(MAX_STEPS);
    expect(out.text).toBe("pensando");
  });

  it("corta o resultado de ferramenta muito grande", async () => {
    const { model, requests } = scripted([useTool("grande", {}), say("ok")]);
    await runTurn([], "x", { system: "s", specs: [], handlers: { grande: async () => "a".repeat(50_000) }, model });
    expect(((requests[1]!.messages[2]!.content as { content: string }[])[0]!).content.length).toBe(8000);
  });
});

describe("trimHistory", () => {
  const u = (t: string): ModelMessage => ({ role: "user", content: t });
  const a = (t: string): ModelMessage => ({ role: "assistant", content: [{ type: "text", text: t }] });

  it("mantém tudo quando é curto", () => {
    expect(trimHistory([u("1"), a("r1")])).toHaveLength(2);
  });
  it("corta no começo de um turno e nunca separa chamada de resultado", () => {
    const history: ModelMessage[] = [];
    for (let i = 0; i < 5; i++) {
      history.push(u(`p${i}`), { role: "assistant", content: [{ type: "tool_use", id: `t${i}`, name: "x", input: {} }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: "r" }] }, a(`r${i}`));
    }
    const out = trimHistory(history, 2);
    expect(out[0]).toEqual(u("p3"));
    expect(out).toHaveLength(8);
  });
});

// ---- rotas ------------------------------------------------------------------------------------

interface Reply { status: number; body: unknown }

function fakeProvider(replies: Reply[] = []) {
  const calls: { headers: Record<string, string>; body: { messages: ModelMessage[]; tools?: { name: string }[]; system: string; max_tokens: number } }[] = [];
  const fetchImpl = async (_url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ headers: init.headers, body: JSON.parse(init.body) });
    const r = replies.shift() ?? { status: 200, body: { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" } };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { calls, fetchImpl };
}

const ok = (...content: Block[]): Reply => ({ status: 200, body: { content, stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn" } });
const text = (t: string): Block => ({ type: "text", text: t });
const tool = (name: string, input: Record<string, unknown>, id = "tu1"): Block => ({ type: "tool_use", id, name, input });

describe("chave de IA", () => {
  let app: TestApp;
  let cookies: Record<string, string>;
  let provider: ReturnType<typeof fakeProvider>;
  const KEY = "sk-ant-api03-chave-de-teste-1234567890-ABCD";

  beforeEach(async () => {
    provider = fakeProvider();
    app = await createTestApp({ fetchImpl: provider.fetchImpl });
    cookies = await app.owner();
  });

  const put = (key: string) => app.call("PUT", "/ai/key", { cookies, body: { key } });

  it("guarda depois de testar, mostra só o final e nunca devolve a chave", async () => {
    const res = await put(KEY);
    expect(res.body).toEqual({ configured: true, last4: "ABCD" });
    expect(provider.calls[0]!.headers["x-api-key"]).toBe(KEY);
    expect(provider.calls[0]!.body.max_tokens).toBe(8);
    const status = await app.call("GET", "/ai/status", { cookies });
    expect(JSON.stringify(status.body)).not.toContain("chave-de-teste");
    expect(status.body).toMatchObject({ configured: true, last4: "ABCD" });
    const stored = await app.db.query("select ciphertext from secrets");
    expect(JSON.stringify(stored.rows)).not.toContain("chave-de-teste");
  });

  it("chave recusada pelo provedor não é guardada", async () => {
    provider = fakeProvider([{ status: 401, body: { error: { message: "invalid x-api-key" } } }]);
    app = await createTestApp({ fetchImpl: provider.fetchImpl });
    cookies = await app.owner();
    const res = await put(KEY);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "key_rejected" });
    expect((await app.call("GET", "/ai/status", { cookies })).body).toMatchObject({ configured: false });
  });

  it("valida o formato e exige a sessão do dono", async () => {
    expect((await put("curta")).status).toBe(400);
    expect((await put("com espaço no meio da chave 1234567890")).status).toBe(400);
    const { secret } = ((await app.call("POST", "/tokens", { cookies, body: { name: "t", scope: "write" } })).body as { secret: string });
    expect((await app.call("PUT", "/ai/key", { headers: { authorization: `Bearer ${secret}` }, body: { key: KEY }, origin: null })).status).toBe(403);
  });

  it("remove a chave", async () => {
    await put(KEY);
    expect((await app.call("DELETE", "/ai/key", { cookies })).status).toBe(200);
    expect((await app.call("DELETE", "/ai/key", { cookies })).status).toBe(404);
  });
});

describe("conversa com os assistentes", () => {
  let app: TestApp;
  let cookies: Record<string, string>;
  let replies: Reply[];
  let provider: ReturnType<typeof fakeProvider>;

  beforeEach(async () => {
    replies = [];
    provider = fakeProvider(replies);
    app = await createTestApp({ fetchImpl: provider.fetchImpl });
    cookies = await app.owner();
    replies.push(ok(text("ok"))); // teste da chave
    await app.call("PUT", "/ai/key", { cookies, body: { key: "sk-ant-api03-chave-de-teste-1234567890-ABCD" } });
    provider.calls.length = 0;
  });

  interface Msg { id: string; role: string; text: string; drafts: { id: string; kind: string; status: string; payload: Record<string, unknown> }[] }
  const send = (body: Record<string, unknown>) => app.call("POST", "/chat/send", { cookies, body });
  const messages = (res: { body: unknown }) => (res.body as { messages: Msg[] }).messages;
  const convId = (res: { body: unknown }) => (res.body as { conversation: { id: string } }).conversation.id;

  it("exige chave configurada", async () => {
    await app.call("DELETE", "/ai/key", { cookies });
    const res = await send({ agent: "hermes", text: "oi" });
    expect(res.status).toBe(412);
    expect(res.body).toEqual({ error: "no_key" });
  });

  it("valida agente e texto", async () => {
    expect((await send({ agent: "x", text: "oi" })).status).toBe(400);
    expect((await send({ agent: "hermes", text: "  " })).status).toBe(400);
    expect((await send({ agent: "hermes", text: "a".repeat(4001) })).status).toBe(400);
    expect((await send({ agent: "hermes", text: "oi", conversationId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
  });

  it("resposta simples cria a conversa com o título da primeira pergunta", async () => {
    replies.push(ok(text("Bom dia!")));
    const res = await send({ agent: "hermes", text: "Bom dia, Hermes" });
    expect(messages(res).map((m) => [m.role, m.text])).toEqual([["user", "Bom dia, Hermes"], ["assistant", "Bom dia!"]]);
    const list = (await app.call("GET", "/chat/conversations", { cookies, query: { agent: "hermes" } })).body as { conversations: { title: string }[] };
    expect(list.conversations.map((c) => c.title)).toEqual(["Bom dia, Hermes"]);
    expect(((await app.call("GET", "/chat/conversations", { cookies, query: { agent: "renato" } })).body as { conversations: unknown[] }).conversations).toEqual([]);
  });

  it("o prompt traz a data de hoje e só as ferramentas do agente", async () => {
    replies.push(ok(text("ok")));
    await send({ agent: "hermes", text: "oi" });
    const call = provider.calls[0]!;
    expect(call.body.system).toContain("2026-11-18");
    expect(call.body.system).toContain("NUNCA cria");
    expect(call.body.tools!.map((t) => t.name)).toEqual(["list_tasks", "list_goals", "propose_tasks"]);
    replies.push(ok(text("ok")));
    await send({ agent: "renato", text: "oi" });
    expect(provider.calls[1]!.body.tools!.map((t) => t.name)).toContain("search_notes");
  });

  it("continua a conversa mandando o histórico", async () => {
    replies.push(ok(text("primeira")));
    const first = await send({ agent: "hermes", text: "um" });
    replies.push(ok(text("segunda")));
    await send({ agent: "hermes", text: "dois", conversationId: convId(first) });
    const sent = provider.calls[1]!.body.messages;
    expect(sent.map((m) => (typeof m.content === "string" ? m.content : "bloco"))).toEqual(["um", "bloco", "dois"]);
  });

  it("Hermes propõe tarefas: vira rascunho e nada é criado antes de aprovar", async () => {
    replies.push(ok(tool("propose_tasks", { tasks: [{ title: "Enviar proposta", date: "2026-11-19", time: "10:00" }, { title: "Treino" }] })), ok(text("Deixei um rascunho com 2 tarefas.")));
    const res = await send({ agent: "hermes", text: "Planeja amanhã" });
    const last = messages(res).at(-1)!;
    expect(last.text).toBe("Deixei um rascunho com 2 tarefas.");
    expect(last.drafts).toHaveLength(1);
    expect(last.drafts[0]).toMatchObject({ kind: "tasks", status: "pending" });
    const before = (await app.call("GET", "/tasks", { cookies, query: { from: "2026-11-18", to: "2026-11-30", today: "2026-11-18" } })).body as { days: unknown[]; undated: unknown[] };
    expect(before.days).toEqual([]);
    expect(before.undated).toEqual([]);

    const approve = await app.call("POST", `/chat/drafts/${last.drafts[0]!.id}/approve`, { cookies });
    expect(approve.body).toMatchObject({ status: "approved", result: { created: 2 } });
    const after = (await app.call("GET", "/tasks", { cookies, query: { from: "2026-11-18", to: "2026-11-30", today: "2026-11-18" } })).body as { days: { title: string }[]; undated: { title: string }[] };
    expect(after.days.map((t) => t.title)).toEqual(["Enviar proposta"]);
    expect(after.undated.map((t) => t.title)).toEqual(["Treino"]);
    expect((await app.call("POST", `/chat/drafts/${last.drafts[0]!.id}/approve`, { cookies })).status).toBe(409);
  });

  it("rascunho descartado não cria nada e não pode ser aprovado depois", async () => {
    replies.push(ok(tool("propose_tasks", { tasks: [{ title: "X" }] })), ok(text("Rascunho pronto.")));
    const res = await send({ agent: "hermes", text: "cria X" });
    const draft = messages(res).at(-1)!.drafts[0]!;
    expect((await app.call("POST", `/chat/drafts/${draft.id}/discard`, { cookies })).body).toEqual({ status: "discarded" });
    expect((await app.call("POST", `/chat/drafts/${draft.id}/approve`, { cookies })).status).toBe(409);
    expect(((await app.call("GET", "/tasks", { cookies, query: { from: "2026-11-18", to: "2026-11-18", today: "2026-11-18" } })).body as { undated: unknown[] }).undated).toEqual([]);
  });

  it("ferramenta com entrada inválida devolve erro ao modelo, que se corrige", async () => {
    replies.push(ok(tool("propose_tasks", { tasks: [{ title: "X", date: "amanhã" }] })), ok(tool("propose_tasks", { tasks: [{ title: "X", date: "2026-11-19" }] }, "tu2")), ok(text("Corrigido.")));
    const res = await send({ agent: "hermes", text: "cria X" });
    expect(messages(res).at(-1)!.drafts).toHaveLength(1);
    const retry = provider.calls[1]!.body.messages.at(-1)!.content as { is_error?: boolean; content: string }[];
    expect(retry[0]).toMatchObject({ is_error: true });
    expect(retry[0]!.content).toContain("Data inválida");
  });

  it("Hermes lê as tarefas e as metas antes de planejar", async () => {
    await app.call("POST", "/tasks", { cookies, body: { title: "Já existe", date: "2026-11-19" } });
    await app.call("POST", "/goals", { cookies, body: { title: "Certificação" } });
    replies.push(ok(tool("list_tasks", { from: "2026-11-18", to: "2026-11-25" }), tool("list_goals", {}, "tu2")), ok(text("Você tem 1 tarefa.")));
    await send({ agent: "hermes", text: "o que tenho?" });
    const results = provider.calls[1]!.body.messages.at(-1)!.content as { content: string }[];
    expect(results[0]!.content).toContain("Já existe");
    expect(results[1]!.content).toContain("Certificação");
  });

  it("Renato busca, lê e propõe uma página; aprovar cria a página", async () => {
    const page = ((await app.call("POST", "/pages", { cookies, body: { title: "Idempotência", body: doc("Retry seguro com chave de idempotência.") } })).body as { page: { id: string } }).page;
    replies.push(
      ok(tool("search_notes", { query: "idempotencia" })),
      ok(tool("read_note", { id: page.id }, "tu2")),
      ok(tool("propose_page", { title: "Resumo de idempotência", markdown: "# Resumo\n\n- retry seguro\n- chave única" }, "tu3")),
      ok(text("Achei 1 nota e deixei um resumo como rascunho.")),
    );
    const res = await send({ agent: "renato", text: "O que anotei sobre idempotência?" });
    expect(provider.calls[1]!.body.messages.at(-1)!.content).toEqual([expect.objectContaining({ content: expect.stringContaining("Idempotência") })]);
    expect(JSON.stringify(provider.calls[1]!.body.messages.at(-1)!.content)).not.toContain("\u0001");
    const draft = messages(res).at(-1)!.drafts[0]!;
    const approve = await app.call("POST", `/chat/drafts/${draft.id}/approve`, { cookies });
    const created = ((approve.body as { result: { pageId: string } }).result).pageId;
    const saved = ((await app.call("GET", `/pages/${created}`, { cookies })).body as { page: { title: string; body: { content: { type: string }[] } } }).page;
    expect(saved.title).toBe("Resumo de idempotência");
    expect(saved.body.content.map((n) => n.type)).toEqual(["heading", "bulletList"]);
  });

  it("Renato propõe uma captura e um diagrama", async () => {
    replies.push(ok(tool("propose_capture", { text: "Estudar Raft #estudo", kind: "study" }), tool("propose_diagram", { title: "Mapa de Raft", mermaid: "```mermaid\nmindmap\n  root((Raft))\n```" }, "tu2")), ok(text("Dois rascunhos.")));
    const res = await send({ agent: "renato", text: "organiza" });
    const drafts = messages(res).at(-1)!.drafts;
    expect(drafts.map((d) => d.kind)).toEqual(["capture", "page"]);
    expect(drafts[1]!.payload.mermaid).toBe("mindmap\n  root((Raft))");
    const cap = await app.call("POST", `/chat/drafts/${drafts[0]!.id}/approve`, { cookies });
    expect(cap.status).toBe(200);
    expect(((await app.call("GET", "/captures", { cookies })).body as { items: { text: string; kind: string }[] }).items[0]).toMatchObject({ text: "Estudar Raft #estudo", kind: "study" });
    const page = await app.call("POST", `/chat/drafts/${drafts[1]!.id}/approve`, { cookies });
    const id = (page.body as { result: { pageId: string } }).result.pageId;
    expect(((await app.call("GET", `/pages/${id}`, { cookies })).body as { page: { body: { content: { type: string; attrs: { code: string } }[] } } }).page.body.content[0]).toMatchObject({ type: "mermaid" });
  });

  it("erros do provedor viram respostas claras", async () => {
    replies.push({ status: 401, body: { error: { message: "x" } } });
    expect((await send({ agent: "hermes", text: "oi" })).body).toEqual({ error: "invalid_key" });
    replies.push({ status: 429, body: {} });
    expect((await send({ agent: "hermes", text: "oi" })).status).toBe(429);
    replies.push({ status: 500, body: {} });
    expect((await send({ agent: "hermes", text: "oi" })).body).toEqual({ error: "provider_error" });
  });

  it("lista, abre e apaga conversas (levando os rascunhos)", async () => {
    replies.push(ok(tool("propose_tasks", { tasks: [{ title: "X" }] })), ok(text("ok")));
    const res = await send({ agent: "hermes", text: "cria X" });
    const id = convId(res);
    const open = (await app.call("GET", `/chat/conversations/${id}`, { cookies })).body as { messages: Msg[] };
    expect(open.messages).toHaveLength(2);
    expect((await app.call("DELETE", `/chat/conversations/${id}`, { cookies })).status).toBe(200);
    expect((await app.call("GET", `/chat/conversations/${id}`, { cookies })).status).toBe(404);
    expect((await app.db.query("select count(*)::int as n from ai_drafts")).rows[0]).toEqual({ n: 0 });
    expect((await app.call("GET", "/chat/conversations", { cookies, query: { agent: "x" } })).status).toBe(400);
  });

  it("conversa de um agente não abre com o outro", async () => {
    replies.push(ok(text("ok")));
    const res = await send({ agent: "hermes", text: "oi" });
    expect((await send({ agent: "renato", text: "oi", conversationId: convId(res) })).status).toBe(404);
  });
});
