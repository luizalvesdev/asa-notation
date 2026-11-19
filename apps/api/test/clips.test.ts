import { beforeEach, describe, expect, it } from "vitest";
import type { BedrockInvoke } from "../src/ai/bedrock.js";
import { markdownToDoc } from "../src/chat/markdown.js";
import { createTestApp, type TestApp } from "./helpers.js";

/** Recortes da extensão: artigo ou transcrição vira página; agenda vira datas para escolher. */

let app: TestApp;
let cookies: Record<string, string>;
let sent: { system: string; user: string } | null;
let reply: unknown;

const invoke: BedrockInvoke = async ({ body }) => {
  const parsed = JSON.parse(body) as { system: unknown; messages: { content: unknown }[] };
  const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  sent = { system: text(parsed.system), user: text(parsed.messages[0]!.content) };
  return { status: 200, json: reply };
};

const token = async () => ((await app.call("POST", "/tokens", { cookies, body: { name: "Extensão", scope: "write" } })).body as { secret: string }).secret;
const viaToken = (secret: string, path: string, body: unknown) => app.call("POST", path, { headers: { authorization: `Bearer ${secret}` }, body, origin: null });

beforeEach(async () => {
  sent = null;
  reply = { content: [], stop_reason: "end_turn" };
  app = await createTestApp({ ai: { provider: "bedrock", modelId: "modelo", region: "us-east-1" }, bedrockInvoke: invoke });
  cookies = await app.owner();
});

describe("salvar recorte", () => {
  it("cria a página em Leituras (criada uma vez), com a fonte e o Markdown convertido", async () => {
    const secret = await token();
    const md = "## Partições\n\nCada tópico tem **partições**.\n\n![diagrama](https://cdn.example.com/a.png)\n\n```java\nproducer.send(r);\n```";
    const res = await viaToken(secret, "/clips", { url: "https://cursos.alura.com.br/artigo/kafka", title: "  Kafka   na prática ", markdown: md });
    expect(res.status).toBe(201);
    const page = (res.body as { page: { id: string; title: string; parentId: string } }).page;
    expect(page.title).toBe("Kafka na prática");

    const second = await viaToken(secret, "/clips", { url: "https://www.youtube.com/watch?v=x", title: "Aula 1", markdown: "Transcrição", kind: "transcript" });
    expect((second.body as { page: { parentId: string } }).page.parentId).toBe(page.parentId);

    const all = ((await app.call("GET", "/pages/tree", { cookies })).body as { pages: { id: string; title: string; parentId: string | null }[] }).pages;
    const folders = all.filter((n) => n.title === "Leituras" && n.parentId === null);
    expect(folders.map((f) => f.id)).toEqual([page.parentId]);
    expect(all.filter((n) => n.parentId === page.parentId)).toHaveLength(2);

    const full = (await app.call("GET", `/pages/${page.id}`, { cookies })).body as { page: { body: { content: { type: string; attrs?: Record<string, unknown> }[] } } };
    const types = full.page.body.content.map((n) => n.type);
    expect(types).toEqual(["paragraph", "heading", "paragraph", "image", "codeBlock"]);
    expect(JSON.stringify(full.page.body.content[0])).toContain("https://cursos.alura.com.br/artigo/kafka");
    expect(full.page.body.content[3]!.attrs).toEqual({ src: "https://cdn.example.com/a.png", alt: "diagrama" });
  });

  it("respeita a pasta escolhida e valida a entrada", async () => {
    const parent = ((await app.call("POST", "/pages", { cookies, body: { title: "Faculdade" } })).body as { page: { id: string } }).page.id;
    const secret = await token();
    const ok = await viaToken(secret, "/clips", { url: "https://a.com/x", title: "T", markdown: "x", parentId: parent });
    expect((ok.body as { page: { parentId: string } }).page.parentId).toBe(parent);
    expect((await viaToken(secret, "/clips", { url: "javascript:alert(1)", title: "T", markdown: "x" })).body).toEqual({ error: "invalid_url" });
    expect((await viaToken(secret, "/clips", { url: "https://a.com", title: " ", markdown: "x" })).body).toEqual({ error: "invalid_title" });
    expect((await viaToken(secret, "/clips", { url: "https://a.com", title: "T", markdown: "  " })).body).toEqual({ error: "invalid_content" });
    expect((await viaToken(secret, "/clips", { url: "https://a.com", title: "T", markdown: "x", parentId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
  });

  it("token de leitura não salva", async () => {
    const { secret } = (await app.call("POST", "/tokens", { cookies, body: { name: "r", scope: "read" } })).body as { secret: string };
    expect((await viaToken(secret, "/clips", { url: "https://a.com", title: "T", markdown: "x" })).status).toBe(403);
  });
});

describe("datas da agenda", () => {
  const AGENDA = "Calendário 2026.2 — Cálculo I: AV1 em 25/11 às 19h. Algoritmos: entrega do trabalho até 02/12. Aula ao vivo 20/11.";
  const events = (list: unknown[]) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "save_events", input: { events: list } }] });

  it("devolve as datas válidas de hoje em diante, com prefixo, em ordem, e marca as que já são tarefa", async () => {
    // Relógio do teste: 18/11/2026 09:00 em São Paulo.
    reply = events([
      { title: "Trabalho de Algoritmos", kind: "entrega", date: "2026-12-02" },
      { title: "AV1 de Cálculo I", kind: "prova", date: "2026-11-25", time: "19:00" },
      { title: "Prova antiga", kind: "prova", date: "2026-10-01" },
      { title: "Sem data", kind: "aula", date: "amanhã" },
      { title: "Data impossível", kind: "aula", date: "2026-02-30" },
      { title: "AV1 de Cálculo I", kind: "prova", date: "2026-11-25", time: "19:00" },
      { title: "Encontro", kind: "esquisito", date: "2026-11-20", time: "25:00" },
    ]);
    await app.call("POST", "/tasks", { cookies, body: { title: "Prova: AV1 de Cálculo I", date: "2026-11-25" } });
    const secret = await token();
    const res = await viaToken(secret, "/clips/dates", { url: "https://aluno.descomplica.com.br/agenda", title: "Agenda", text: AGENDA });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      today: "2026-11-18",
      events: [
        { title: "Encontro", kind: "outro", date: "2026-11-20", time: null, exists: false },
        { title: "Prova: AV1 de Cálculo I", kind: "prova", date: "2026-11-25", time: "19:00", exists: true },
        { title: "Entrega: Trabalho de Algoritmos", kind: "entrega", date: "2026-12-02", time: null, exists: false },
      ],
    });
    expect(sent!.system).toContain("Hoje é 2026-11-18");
    expect(sent!.system).toContain("não instrução");
    expect(sent!.user).toContain("AV1 em 25/11");
  });

  it("texto curto não chama a IA; sem IA configurada avisa", async () => {
    expect((await app.call("POST", "/clips/dates", { cookies, body: { text: "oi" } })).body).toEqual({ error: "text_too_short" });
    expect(sent).toBeNull();
    const plain = await createTestApp();
    const c = await plain.owner();
    expect((await plain.call("POST", "/clips/dates", { cookies: c, body: { text: AGENDA } })).body).toEqual({ error: "ai_not_configured" });
  });
});

describe("markdown com imagem", () => {
  it("imagem só vira nó quando é http(s) e está sozinha na linha", () => {
    const doc = markdownToDoc("![a](https://x.com/a.png)\n![b](javascript:x)\ntexto ![c](https://x.com/c.png)");
    expect(doc.content.map((n) => (n as { type: string }).type)).toEqual(["image", "paragraph", "paragraph"]);
  });
});
