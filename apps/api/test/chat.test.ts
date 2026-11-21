import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Block, ModelMessage, ModelRequest, ModelResponse } from "../src/ai/anthropic.js";
import { ProviderError, createBudgetedModel, createModel } from "../src/ai/anthropic.js";
import { MAX_STEPS, TRUNCATED, runTurn, trimHistory } from "../src/chat/agent.js";
import { markdownToDoc } from "../src/chat/markdown.js";
import { appendBlocks, asDoc, docToMarkdown, outline, readSection, replaceSection } from "../src/chat/doc-edit.js";
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

describe("markdownToDoc rico", () => {
  const types = (md: string) => markdownToDoc(md).content.map((n) => (n as { type: string }).type);

  it("bloco de código com linguagem e bloco mermaid", () => {
    const d = markdownToDoc("Antes\n\n```ts\nconst a = 1;\nconsole.log(a);\n```\n\n```mermaid\nmindmap\n  root((Raft))\n```\n\nDepois");
    expect(types("Antes\n\n```ts\nx\n```\n\n```mermaid\ngraph TD\n```\n\nDepois")).toEqual(["paragraph", "codeBlock", "mermaid", "paragraph"]);
    expect(d.content[1]).toMatchObject({ type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "const a = 1;\nconsole.log(a);" }] });
    expect(d.content[2]).toMatchObject({ type: "mermaid", attrs: { code: "mindmap\n  root((Raft))" } });
  });

  it("cerca sem fechamento vai até o fim do texto", () => {
    expect(markdownToDoc("```py\nprint(1)").content[0]).toMatchObject({ type: "codeBlock", content: [{ text: "print(1)" }] });
  });

  it("dentro da cerca, # e - não viram título nem lista", () => {
    expect(types("```sh\n# comentário\n- item\n```")).toEqual(["codeBlock"]);
  });

  it("lista numerada, citação e divisor", () => {
    expect(types("1. um\n2. dois\n\n> citado\n> em duas linhas\n\n---")).toEqual(["orderedList", "blockquote", "horizontalRule"]);
    expect((markdownToDoc("> a\n> b").content[0] as { content: unknown[] }).content).toHaveLength(2);
  });

  it("marcas no texto: negrito, itálico, código e link", () => {
    const [p] = markdownToDoc("Um **forte**, *itálico*, `code` e [site](https://x.dev).").content as { content: { text: string; marks?: { type: string; attrs?: { href: string } }[] }[] }[];
    const by = (t: string) => p!.content.find((n) => n.text === t)!;
    expect(by("forte").marks).toEqual([{ type: "bold" }]);
    expect(by("itálico").marks).toEqual([{ type: "italic" }]);
    expect(by("code").marks).toEqual([{ type: "code" }]);
    expect(by("site").marks).toEqual([{ type: "link", attrs: { href: "https://x.dev" } }]);
    expect(p!.content.map((n) => n.text).join("")).toBe("Um forte, itálico, code e site.");
  });

  it("link com protocolo perigoso fica como texto puro", () => {
    const json = JSON.stringify(markdownToDoc("[clique](javascript:alert(1)) e [ok](mailto:a@b.dev)"));
    expect(json).not.toContain('"href":"javascript');
    expect(json).toContain('"href":"mailto:a@b.dev"');
  });

  it("título com negrito e tarefa com código", () => {
    const d = markdownToDoc("## Plano **final**\n\n- [ ] rodar `npm test`");
    expect(JSON.stringify(d.content[0])).toContain('"bold"');
    expect(JSON.stringify(d.content[1])).toContain('"code"');
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

describe("tempo do provedor", () => {
  const req = { system: "s", messages: [{ role: "user" as const, content: "oi" }], tools: [] };
  const hang = (_url: string, init: { signal?: AbortSignal }) => new Promise<never>((_, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("abort"), { name: "AbortError" }))));

  it("estourou o tempo da chamada: erro de timeout", async () => {
    await expect(createModel("k", "m", hang as never, 20)(req)).rejects.toMatchObject({ status: 0, message: "timeout" });
  });

  it("rede caída vira erro de rede", async () => {
    const down = async () => { throw new TypeError("fetch failed"); };
    await expect(createModel("k", "m", down as never)(req)).rejects.toMatchObject({ status: 0, message: "network" });
  });

  it("sem tempo sobrando no orçamento, nem chama o provedor", async () => {
    let calls = 0;
    const counting = async () => { calls++; return { ok: true, status: 200, json: async () => ({ content: [], stop_reason: "end_turn" }) }; };
    let now = 0;
    const model = createBudgetedModel("k", "m", counting as never, 10_000, () => now);
    await model(req);
    now = 8_000; // sobram 2 s, menos que o mínimo útil
    await expect(model(req)).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(1);
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

  it("resposta cortada no limite de tokens: não executa a ferramenta incompleta e avisa", async () => {
    const run = vi.fn(async () => "x");
    const model = async (): Promise<ModelResponse> => ({ content: [{ type: "text", text: "Vou criar a página." }, { type: "tool_use", id: "t", name: "propose_page", input: { title: "só o título" } }], stopReason: "max_tokens" });
    const out = await runTurn([], "crie", { system: "s", specs: [], handlers: { propose_page: run }, model });
    expect(run).not.toHaveBeenCalled();
    expect(out.text).toBe(`Vou criar a página.\n\n${TRUNCATED}`);
    // O histórico guardado não leva a chamada incompleta (a API recusaria um tool_use sem tool_result).
    expect(JSON.stringify(out.messages)).not.toContain("tool_use");
  });

  it("resposta cortada sem texto: só o aviso", async () => {
    const model = async (): Promise<ModelResponse> => ({ content: [], stopReason: "max_tokens" });
    expect((await runTurn([], "x", { system: "s", specs: [], handlers: {}, model })).text).toBe(TRUNCATED);
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

/** Tira as marcações de cache (testadas em ai-cache.test.ts) para os testes olharem só o conteúdo. */
function withoutCache(body: Record<string, unknown>) {
  const strip = (v: unknown): unknown => (Array.isArray(v) ? v.map(strip) : typeof v === "object" && v !== null ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "cache_control").map(([k, x]) => [k, strip(x)])) : v);
  const out = strip(body) as { system: unknown; messages: { content: unknown }[] };
  if (Array.isArray(out.system)) out.system = (out.system as { text: string }[]).map((b) => b.text).join("");
  const last = out.messages.at(-1);
  if (last && Array.isArray(last.content) && last.content.length === 1 && (last.content[0] as { type: string }).type === "text") last.content = (last.content[0] as { text: string }).text;
  return out as never;
}

function fakeProvider(replies: Reply[] = []) {
  const calls: { headers: Record<string, string>; body: { messages: ModelMessage[]; tools?: { name: string }[]; system: string; max_tokens: number } }[] = [];
  const fetchImpl = async (_url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ headers: init.headers, body: withoutCache(JSON.parse(init.body)) });
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

  it("usa o Haiku 5.5 por padrão e manda o modelo e o esforço configurados", async () => {
    await put(KEY);
    expect((provider.calls[0]!.body as unknown as { model: string }).model).toBe("claude-haiku-5-5");
    expect(provider.calls[0]!.body).not.toHaveProperty("output_config");

    const other = fakeProvider();
    const configured = await createTestApp({ fetchImpl: other.fetchImpl, ai: { provider: "anthropic", model: "claude-sonnet-5-5", effort: "low" } });
    await configured.call("PUT", "/ai/key", { cookies: await configured.owner(), body: { key: KEY } });
    expect(other.calls[0]!.body).toMatchObject({ model: "claude-sonnet-5-5", output_config: { effort: "low" } });
  });

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
    expect(call.body.system).toContain("rascunho que só vale depois que o usuário aprova");
    expect(call.body.system).toContain("REGRA DE OURO");
    expect(call.body.system).toContain("texto simples");
    const hermes = call.body.tools!.map((t) => t.name);
    expect(hermes).toEqual(expect.arrayContaining(["list_tasks", "list_pages", "propose_tasks", "propose_page", "append_to_page", "update_task", "delete_page", "create_cards"]));
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
    expect((await send({ agent: "hermes", text: "oi" })).body).toMatchObject({ error: "provider_error", status: 500 });
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

  it("Tutor lê os pontos fracos e conversa de forma socrática", async () => {
    await app.call("POST", "/study/cards", { cookies, body: { kind: "basic", front: "O que é quorum?", back: "A maioria" } });
    const queue = ((await app.call("GET", "/study/queue", { cookies, query: { dayStart: "2026-11-18T03:00:00.000Z" } })).body as { cards: { id: string }[] }).cards;
    await app.call("POST", `/study/cards/${queue[0]!.id}/review`, { cookies, body: { rating: 1 } });
    replies.push(ok(tool("list_weak_cards", {})), ok(text("Vamos começar: o que você sabe sobre quorum?")));
    const res = await send({ agent: "tutor", text: "Me ajuda a estudar" });
    expect(provider.calls[0]!.body.tools!.map((t) => t.name)).toEqual(expect.arrayContaining(["list_weak_cards", "list_pages", "search_notes", "read_note"]));
    expect(provider.calls[0]!.body.system).toContain("socrático");
    expect(JSON.stringify(provider.calls[1]!.body.messages.at(-1))).toContain("O que é quorum?");
    expect(messages(res).at(-1)!.text).toContain("quorum");
    expect(messages(res).at(-1)!.drafts).toEqual([]);
  });

  it("resposta vazia do modelo vira uma mensagem clara, nunca um balão em branco", async () => {
    replies.push({ status: 200, body: { content: [], stop_reason: "end_turn" } });
    const res = await send({ agent: "hermes", text: "oi" });
    expect(messages(res).at(-1)!.text).toContain("Não consegui responder");
  });

  it("conversa de um agente não abre com o outro", async () => {
    replies.push(ok(text("ok")));
    const res = await send({ agent: "hermes", text: "oi" });
    expect((await send({ agent: "renato", text: "oi", conversationId: convId(res) })).status).toBe(404);
  });
});

describe("edição de páginas pelos assistentes (doc-edit)", () => {
  const p = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
  const h = (level: number, t: string) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text: t }] });
  const page = { type: "doc", content: [h(2, "Cache"), p("c1"), h(3, "Redis"), p("r1"), h(2, "Filas"), p("f1")] };

  it("vira Markdown e volta (código, mermaid, listas, marcas)", () => {
    const md = "## Título\n\nUm **forte** e `code`.\n\n- a\n- b\n\n1. um\n2. dois\n\n```ts\nconst a = 1;\n```\n\n```mermaid\ngraph TD\n```";
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it("lista as seções", () => {
    expect(outline(page)).toEqual([{ level: 2, text: "Cache" }, { level: 3, text: "Redis" }, { level: 2, text: "Filas" }]);
  });

  it("sem seção vai para o fim", () => {
    const out = appendBlocks(page, [p("novo")]);
    expect(out.placed).toBe("end");
    expect(out.doc.content.at(-1)).toEqual(p("novo"));
    expect(out.doc.content).toHaveLength(7);
  });

  it("com seção entra no fim dela, depois das subseções e antes da próxima do mesmo nível", () => {
    const out = appendBlocks(page, [p("novo")], "cache");
    expect(out.placed).toBe("section");
    expect(out.doc.content.map((n) => (n as { content?: { text?: string }[] }).content?.[0]?.text)).toEqual(["Cache", "c1", "Redis", "r1", "novo", "Filas", "f1"]);
  });

  it("subseção: entra no fim dela só", () => {
    const out = appendBlocks(page, [p("novo")], "Redis");
    expect(out.doc.content.map((n) => (n as { content?: { text?: string }[] }).content?.[0]?.text)).toEqual(["Cache", "c1", "Redis", "r1", "novo", "Filas", "f1"]);
  });

  it("seção que não existe vira seção nova no fim, e acento e # não atrapalham", () => {
    const out = appendBlocks(page, [p("x")], "## Consistência");
    expect(out.placed).toBe("new_section");
    expect(out.doc.content.slice(-2)).toEqual([h(2, "Consistência"), p("x")]);
    expect(appendBlocks({ type: "doc", content: [h(2, "Consistência")] }, [p("y")], "consistencia").placed).toBe("section");
  });

  it("página vazia ou sem corpo", () => {
    expect(appendBlocks(null, [p("a")]).doc.content).toEqual([p("a")]);
    expect(asDoc(undefined)).toEqual({ type: "doc", content: [] });
  });

  it("troca só o miolo da seção; título e vizinhas ficam", () => {
    const out = replaceSection(page, "Filas", [p("novo f")])!;
    expect(out.doc.content.map((n) => (n as { content?: { text?: string }[] }).content?.[0]?.text)).toEqual(["Cache", "c1", "Redis", "r1", "Filas", "novo f"]);
    expect(replaceSection(page, "Nada", [])).toBeNull();
  });

  it("lê uma seção", () => {
    expect(readSection(page, "Redis")).toBe("### Redis\n\nr1");
    expect(readSection(page, "Nada")).toBeNull();
  });
});

describe("assistentes com poder sobre o app", () => {
  let app: TestApp;
  let cookies: Record<string, string>;
  let replies: Reply[];
  let provider: ReturnType<typeof fakeProvider>;
  const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
  const head = (t: string) => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: t }] });

  beforeEach(async () => {
    replies = [];
    provider = fakeProvider(replies);
    app = await createTestApp({ fetchImpl: provider.fetchImpl });
    cookies = await app.owner();
    replies.push(ok(text("ok")));
    await app.call("PUT", "/ai/key", { cookies, body: { key: "sk-ant-api03-chave-de-teste-1234567890-ABCD" } });
    provider.calls.length = 0;
  });

  interface Msg { text: string; drafts: { id: string; kind: string; status: string; payload: Record<string, any>; result: Record<string, any> | null }[] }
  const send = async (agent: string, message: string) => ((await app.call("POST", "/chat/send", { cookies, body: { agent, text: message } })).body as { messages: Msg[] }).messages.at(-1)!;
  const setAuto = (on: boolean) => app.call("PATCH", "/settings", { cookies, body: { aiAutoApply: on } });
  const makePage = async (title: string, content: unknown[]) => ((await app.call("POST", "/pages", { cookies, body: { title, body: { type: "doc", content } } })).body as { page: { id: string } }).page.id;
  const getPage = async (id: string) => ((await app.call("GET", `/pages/${id}`, { cookies })).body as { page: { body: { content: { type: string; content?: { text?: string }[] }[] } } }).page;
  const heads = (page: { body: { content: { type: string; content?: { text?: string }[] }[] } }) => page.body.content.map((n) => n.content?.[0]?.text ?? n.type);
  const lastToolResult = () => JSON.stringify(provider.calls.at(-1)!.body.messages.at(-1));

  it("modo padrão: append_to_page vira rascunho e só mexe na página depois de aprovar", async () => {
    const id = await makePage("System Design", [head("Cache"), para("c1"), head("Filas"), para("f1")]);
    replies.push(ok(tool("append_to_page", { id, section: "Cache", markdown: "### CDN\n\nBorda perto do usuário." })), ok(text("Deixei um rascunho.")));
    const msg = await send("renato", "Estudei CDN");
    expect(msg.drafts).toHaveLength(1);
    expect(msg.drafts[0]).toMatchObject({ kind: "action", status: "pending", payload: { tool: "append_to_page" } });
    expect(msg.drafts[0]!.payload.summary).toContain("System Design");
    expect(heads(await getPage(id))).toEqual(["Cache", "c1", "Filas", "f1"]);

    const res = await app.call("POST", `/chat/drafts/${msg.drafts[0]!.id}/approve`, { cookies });
    expect(res.body).toMatchObject({ status: "approved", result: { pageId: id } });
    expect(heads(await getPage(id))).toEqual(["Cache", "c1", "CDN", "Borda perto do usuário.", "Filas", "f1"]);
  });

  it("modo automático: edita na hora, o modelo recebe 'Feito' e o cartão já vem aprovado", async () => {
    await setAuto(true);
    const id = await makePage("System Design", [head("Cache"), para("c1")]);
    replies.push(ok(tool("append_to_page", { id, markdown: "## Filas\n\nf1" })), ok(text("Acrescentei.")));
    const msg = await send("hermes", "Anota filas");
    expect(msg.drafts[0]).toMatchObject({ kind: "action", status: "approved", result: { pageId: id } });
    expect(lastToolResult()).toContain("Feito: ");
    expect(heads(await getPage(id))).toEqual(["Cache", "c1", "Filas", "f1"]);
    expect(provider.calls[0]!.body.system).toContain("modo automático");
  });

  it("modo automático: criar tarefa e meta direto; editar tarefa pelo id", async () => {
    await setAuto(true);
    const created = (await app.call("POST", "/tasks", { cookies, body: { title: "Velha", date: "2026-11-18" } })).body as { task: { id: string } };
    replies.push(ok(tool("update_task", { id: created.task.id, title: "Nova", date: "2026-11-20", time: "10:00" }, "a"), tool("create_goal", { title: "Certificação", dueDate: "2027-03-01" }, "b")), ok(text("Pronto.")));
    const msg = await send("hermes", "Reagenda e cria meta");
    expect(msg.drafts.map((d) => d.status)).toEqual(["approved", "approved"]);
    const tasks = (await app.call("GET", "/tasks", { cookies, query: { from: "2026-11-20", to: "2026-11-20", today: "2026-11-18" } })).body as { days: { title: string; time: string }[] };
    expect(tasks.days[0]).toMatchObject({ title: "Nova", time: "10:00" });
    expect(((await app.call("GET", "/goals", { cookies })).body as { goals: { title: string }[] }).goals.map((g) => g.title)).toContain("Certificação");
  });

  it("rotina: cria tarefa recorrente e liga/desliga/muda horário dos check-ins", async () => {
    await setAuto(true);
    replies.push(
      ok(tool("propose_tasks", { tasks: [{ title: "Leitura", date: "2026-11-20", time: "21:00", recurrence: "daily" }] }, "a"), tool("update_checkins", { checkinsEnabled: { study: false }, checkins: { plan: "07:30" } }, "b")),
      ok(text("Pronto.")),
    );
    const msg = await send("hermes", "Leitura todo dia e check-ins");
    expect(msg.drafts.map((d) => d.status)).toEqual(["approved", "approved"]);
    const tasks = (await app.call("GET", "/tasks", { cookies, query: { from: "2026-11-21", to: "2026-11-22", today: "2026-11-20" } })).body as { days: { title: string }[] };
    expect(tasks.days.map((t) => t.title)).toEqual(["Leitura", "Leitura"]);
    const settings = (await app.call("GET", "/settings", { cookies })).body as { settings: { checkins: { plan: string }; checkinsEnabled: { study: boolean } } };
    expect(settings.settings.checkins.plan).toBe("07:30");
    expect(settings.settings.checkinsEnabled.study).toBe(false);
  });

  it("estudo: Tutor edita baralho e card; apagar card pede aprovação", async () => {
    await setAuto(true);
    replies.push(ok(tool("create_deck", { title: "Redes" }, "a")), ok(text("ok")));
    await send("tutor", "Cria baralho Redes");
    const deck = (await app.call("GET", "/study/overview", { cookies, query: { dayStart: "2026-11-18T03:00:00.000Z" } })).body as { decks: { id: string; title: string }[] };
    const deckId = deck.decks.find((d) => d.title === "Redes")!.id;
    replies.push(ok(tool("create_cards", { deckId, cards: [{ front: "TCP?", back: "x" }] }, "a")), ok(text("ok")));
    await send("tutor", "Cria card");
    replies.push(ok(tool("list_cards", { deckId }, "a")), ok(text("ok")));
    await send("tutor", "Lista cards");
    const cardId = ((await app.call("GET", "/study/cards", { cookies, query: { deckId } })).body as { cards: { id: string }[] }).cards[0]!.id;
    expect(lastToolResult()).toContain(cardId);
    replies.push(ok(tool("update_card", { id: cardId, back: "Protocolo confiável" }, "a"), tool("update_deck", { id: deckId, title: "Redes 2" }, "b"), tool("delete_card", { id: cardId }, "c")), ok(text("ok")));
    const msg = await send("tutor", "Corrige, renomeia e apaga");
    expect(msg.drafts.map((d) => d.status)).toEqual(["approved", "approved", "pending"]);
    replies.push(ok(tool("list_cards", { deckId }, "a")), ok(text("ok")));
    await send("tutor", "Lista de novo");
    expect(lastToolResult()).toContain("Protocolo confiável");
  });

  it("apagar SEMPRE pede aprovação, mesmo no modo automático; aprovado vai para a lixeira", async () => {
    await setAuto(true);
    const id = await makePage("Velha", [para("x")]);
    replies.push(ok(tool("delete_page", { id })), ok(text("Deixei para você aprovar.")));
    const msg = await send("renato", "Apaga a página Velha");
    expect(msg.drafts[0]).toMatchObject({ status: "pending", payload: { danger: true } });
    expect(lastToolResult()).toContain("Aguardando a aprovação");
    expect((await app.call("GET", `/pages/${id}`, { cookies })).status).toBe(200);
    await app.call("POST", `/chat/drafts/${msg.drafts[0]!.id}/approve`, { cookies });
    expect((await app.call("GET", `/pages/${id}`, { cookies })).status).toBe(404);
    const trash = (await app.call("GET", "/pages/trash", { cookies })).body as { items: { id: string }[] };
    expect(trash.items.map((i) => i.id)).toContain(id);
  });

  it("reescrever a página inteira também exige aprovação", async () => {
    await setAuto(true);
    const id = await makePage("P", [para("a")]);
    replies.push(ok(tool("rewrite_page", { id, markdown: "# Novo" })), ok(text("ok")));
    expect((await send("hermes", "reescreve")).drafts[0]!.status).toBe("pending");
  });

  it("id inexistente: o erro volta ao modelo e nenhum rascunho fica", async () => {
    await setAuto(true);
    replies.push(ok(tool("append_to_page", { id: "00000000-0000-4000-8000-000000000000", markdown: "x" })), ok(text("Não achei a página.")));
    const msg = await send("hermes", "anota");
    expect(msg.drafts).toEqual([]);
    expect(lastToolResult()).toContain("Página não encontrada");
  });

  it("falha na execução automática não deixa rascunho para trás", async () => {
    await setAuto(true);
    const id = await makePage("P", [head("A"), para("a")]);
    replies.push(ok(tool("replace_section", { id, section: "Inexistente", markdown: "x" })), ok(text("Seção não existe.")));
    const msg = await send("hermes", "troca");
    expect(msg.drafts).toEqual([]);
    expect(lastToolResult()).toContain("não encontrada");
  });

  it("aprovar quando a página sumiu: 422 e o rascunho continua pendente", async () => {
    const id = await makePage("Some", [para("a")]);
    replies.push(ok(tool("append_to_page", { id, markdown: "novo" })), ok(text("ok")));
    const msg = await send("renato", "anota");
    await app.call("DELETE", `/pages/${id}`, { cookies });
    const res = await app.call("POST", `/chat/drafts/${msg.drafts[0]!.id}/approve`, { cookies });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: "action_failed" });
    expect(((await app.call("GET", `/chat/conversations`, { cookies, query: { agent: "renato" } })).body as { conversations: unknown[] }).conversations).toHaveLength(1);
  });

  it("não edita databases nem quadros", async () => {
    const db = ((await app.call("POST", "/pages", { cookies, body: { title: "DB", kind: "database" } })).body as { page: { id: string } }).page.id;
    replies.push(ok(tool("append_to_page", { id: db, markdown: "x" })), ok(text("ok")));
    await send("hermes", "anota");
    expect(lastToolResult()).toContain("database ou um quadro");
  });

  it("read_note devolve Markdown e as seções; com section, só ela", async () => {
    const id = await makePage("SD", [head("Cache"), para("c1"), head("Filas"), para("f1")]);
    replies.push(ok(tool("read_note", { id }, "a"), tool("read_note", { id, section: "Filas" }, "b")), ok(text("ok")));
    await send("renato", "lê");
    const result = provider.calls.at(-1)!.body.messages.at(-1)!.content as { content: string }[];
    expect(JSON.parse(result[0]!.content)).toMatchObject({ title: "SD", sections: ["## Cache", "## Filas"], markdown: "## Cache\n\nc1\n\n## Filas\n\nf1" });
    expect(JSON.parse(result[1]!.content)).toEqual({ title: "SD", section: "## Filas\n\nf1" });
  });

  it("list_pages mostra a árvore para evitar duplicar assunto", async () => {
    const parent = await makePage("System Design", [para("x")]);
    await app.call("POST", "/pages", { cookies, body: { title: "Cache", parentId: parent } });
    replies.push(ok(tool("list_pages", {})), ok(text("ok")));
    await send("renato", "o que tenho?");
    const out = JSON.parse((provider.calls.at(-1)!.body.messages.at(-1)!.content as { content: string }[])[0]!.content) as { title: string; parentId: string | null }[];
    expect(out.map((n) => n.title).sort()).toEqual(["Cache", "System Design"]);
    expect((out as unknown as { title: string; path: string }[]).find((n) => n.title === "Cache")!.path).toBe("System Design / Cache");
    expect(out.find((n) => n.title === "Cache")!.parentId).toBe(parent);
  });

  it("o prompt manda criar página só se o assunto não tem relação (perguntar antes)", async () => {
    replies.push(ok(text("ok")));
    await send("renato", "oi");
    const system = provider.calls[0]!.body.system;
    expect(system).toContain("append_to_page");
    expect(system).toContain("pergunte ao usuário se quer uma página nova");
    expect(system).toContain("NÃO peça confirmação por texto");
    expect(system).toContain("NÃO escolha uma");
  });

  it("tutor também tem poder sobre o app (estudo, metas, rotina)", async () => {
    replies.push(ok(text("ok")));
    await send("tutor", "oi");
    expect(provider.calls[0]!.body.tools!.map((t) => t.name)).toEqual(expect.arrayContaining(["create_cards", "update_card", "delete_card", "update_deck", "create_goal", "propose_tasks", "update_checkins"]));
  });

  it("cards e baralhos pelo assistente", async () => {
    await setAuto(true);
    replies.push(ok(tool("create_deck", { title: "CAP" }, "a")), ok(text("ok")));
    await send("renato", "cria baralho");
    const deck = ((await app.call("GET", "/study/overview", { cookies, query: { dayStart: new Date().toISOString() } })).body as { decks: { id: string; title: string }[] }).decks[0]!;
    expect(deck.title).toBe("CAP");
    replies.push(ok(tool("create_cards", { deckId: deck.id, cards: [{ front: "O que é CAP?", back: "Consistência, disponibilidade, partição" }] })), ok(text("ok")));
    const msg = await send("renato", "cria card");
    expect(msg.drafts[0]).toMatchObject({ status: "approved", result: { message: "1 card criado." } });
  });

  it("configuração aiAutoApply valida o tipo", async () => {
    expect((await app.call("PATCH", "/settings", { cookies, body: { aiAutoApply: "sim" } })).status).toBe(400);
    expect((await setAuto(true)).body).toMatchObject({ settings: { aiAutoApply: true } });
  });
});
