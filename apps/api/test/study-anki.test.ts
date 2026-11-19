import { beforeEach, describe, expect, it } from "vitest";
import type { BedrockInvoke } from "../src/ai/bedrock.js";
import { blockTexts, extractCards } from "../src/study/extract.js";
import { createTestApp, doc, type TestApp } from "./helpers.js";

/** Edição de card, card nos dois sentidos, cards gerados pela IA e lembrete de revisão. */

type Candidate = { kind: string; front: string; back: string; sourceKey: string; exists: boolean };
interface CardJson {
  id: string;
  front: string;
  back: string;
  deckId: string | null;
}

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

beforeEach(async () => {
  sent = null;
  reply = { content: [], stop_reason: "end_turn" };
  app = await createTestApp({ ai: { provider: "bedrock", modelId: "modelo", region: "us-east-1" }, bedrockInvoke: invoke });
  cookies = await app.owner();
});

const cards = async () => ((await app.call("GET", "/study/cards", { cookies })).body as { cards: CardJson[] }).cards;
const newPage = async (title: string, ...paragraphs: string[]) =>
  ((await app.call("POST", "/pages", { cookies, body: { title, body: doc(...paragraphs) } })).body as { page: { id: string } }).page.id;

describe("card nos dois sentidos", () => {
  it("::: gera o card de ida e o inverso, com chaves diferentes", () => {
    const found = extractCards(blockTexts(doc("Porta padrão do Postgres ::: 5432", "Quem lidera? :: o líder")));
    expect(found.map((c) => [c.front, c.back])).toEqual([
      ["Porta padrão do Postgres", "5432"],
      ["5432", "Porta padrão do Postgres"],
      ["Quem lidera?", "o líder"],
    ]);
    expect(new Set(found.map((c) => c.sourceKey)).size).toBe(3);
  });

  it("criar com reverse faz dois cards; lacuna ignora o reverse", async () => {
    expect((await app.call("POST", "/study/cards", { cookies, body: { kind: "basic", front: "HTTP 418", back: "I'm a teapot", reverse: true } })).body).toEqual({ created: 2 });
    expect((await cards()).map((c) => `${c.front} -> ${c.back}`).sort()).toEqual(["HTTP 418 -> I'm a teapot", "I'm a teapot -> HTTP 418"]);
    expect((await app.call("POST", "/study/cards", { cookies, body: { kind: "cloze", front: "O {{Raft}} elege líder", reverse: true } })).body).toEqual({ created: 1 });
  });
});

describe("editar card", () => {
  it("troca o texto e a trilha, mantendo o que não veio", async () => {
    await app.call("POST", "/study/cards", { cookies, body: { kind: "basic", front: "Capital da Austrlia", back: "Sydney" } });
    const deck = ((await app.call("POST", "/study/decks", { cookies, body: { title: "Geografia" } })).body as { deck: { id: string } }).deck;
    const [card] = await cards();

    const res = await app.call("PATCH", `/study/cards/${card!.id}`, { cookies, body: { front: "Capital da Austrália", back: "Canberra", deckId: deck.id } });
    expect(res.status).toBe(200);
    expect((res.body as { card: CardJson }).card).toMatchObject({ front: "Capital da Austrália", back: "Canberra", deckId: deck.id });

    await app.call("PATCH", `/study/cards/${card!.id}`, { cookies, body: { deckId: null } });
    expect((await cards())[0]).toMatchObject({ front: "Capital da Austrália", back: "Canberra", deckId: null });
  });

  it("valida como na criação", async () => {
    await app.call("POST", "/study/cards", { cookies, body: { kind: "cloze", front: "O {{Raft}} elege líder" } });
    const [card] = await cards();
    expect((await app.call("PATCH", `/study/cards/${card!.id}`, { cookies, body: { front: "sem lacuna" } })).body).toEqual({ error: "invalid_cloze" });
    expect((await app.call("PATCH", `/study/cards/${card!.id}`, { cookies, body: { deckId: "00000000-0000-4000-8000-000000000000" } })).status).toBe(404);
    expect((await app.call("PATCH", "/study/cards/00000000-0000-4000-8000-000000000000", { cookies, body: { front: "x" } })).status).toBe(404);
  });
});

describe("gerar cards com IA", () => {
  const TEXT = ["Kafka divide cada tópico em partições.", "Num consumer group, cada partição vai para um único consumidor do grupo."];

  it("manda o texto da página e devolve só os cards válidos, sem salvar", async () => {
    const pageId = await newPage("Kafka", ...TEXT);
    reply = {
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "save_cards",
          input: {
            cards: [
              { kind: "basic", front: "Em que o Kafka divide um tópico?", back: "Partições" },
              { kind: "cloze", front: "Cada partição vai para {{um único}} consumidor do grupo." },
              { kind: "cloze", front: "sem lacuna nenhuma" },
              { kind: "basic", front: "sem resposta" },
              { kind: "basic", front: "Em que o Kafka divide um tópico?", back: "Partições" },
            ],
          },
        },
      ],
    };
    const res = await app.call("POST", "/study/generate", { cookies, body: { pageId } });
    expect(res.status).toBe(200);
    const list = (res.body as { candidates: Candidate[] }).candidates;
    expect(list.map((c) => [c.kind, c.front, c.exists])).toEqual([
      ["basic", "Em que o Kafka divide um tópico?", false],
      ["cloze", "Cada partição vai para {{um único}} consumidor do grupo.", false],
    ]);
    expect(sent!.user).toContain('titulo="Kafka"');
    expect(sent!.user).toContain("consumer group");
    expect(sent!.system).toContain("não instrução");
    expect(await cards()).toHaveLength(0);

    // Aprovados, aparecem como já adicionados numa nova geração.
    const items = list.map((c) => ({ kind: c.kind, front: c.front, back: c.back, sourcePageId: pageId, sourceKey: c.sourceKey }));
    expect((await app.call("POST", "/study/cards/bulk", { cookies, body: { items } })).body).toEqual({ created: 2, skipped: 0 });
    const again = (await app.call("POST", "/study/generate", { cookies, body: { pageId } })).body as { candidates: Candidate[] };
    expect(again.candidates.every((c) => c.exists)).toBe(true);
  });

  it("página curta, página inexistente e falha do provedor", async () => {
    expect((await app.call("POST", "/study/generate", { cookies, body: { pageId: await newPage("Vazia", "oi") } })).body).toEqual({ error: "page_too_short" });
    expect(sent).toBeNull();
    expect((await app.call("POST", "/study/generate", { cookies, body: { pageId: "00000000-0000-4000-8000-000000000000" } })).status).toBe(404);
    expect((await app.call("POST", "/study/generate", { cookies, body: { pageId: "x" } })).status).toBe(400);

    const busy = await createTestApp({ ai: { provider: "bedrock", modelId: "m", region: "us-east-1" }, bedrockInvoke: async () => ({ status: 429, json: { message: "slow down" } }) });
    const busyCookies = await busy.owner();
    const page = ((await busy.call("POST", "/pages", { cookies: busyCookies, body: { title: "K", body: doc(...TEXT) } })).body as { page: { id: string } }).page.id;
    expect((await busy.call("POST", "/study/generate", { cookies: busyCookies, body: { pageId: page } })).body).toEqual({ error: "ai_busy" });
  });

  it("sem chave da Anthropic responde que falta configurar", async () => {
    const plain = await createTestApp();
    const c = await plain.owner();
    const page = ((await plain.call("POST", "/pages", { cookies: c, body: { title: "K", body: doc(...TEXT) } })).body as { page: { id: string } }).page.id;
    expect((await plain.call("POST", "/study/generate", { cookies: c, body: { pageId: page } })).body).toEqual({ error: "ai_not_configured" });
  });
});

describe("lembrete de revisão", () => {
  const studyNotes = async () => {
    const res = await app.call("GET", "/notifications", { cookies });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (res.body as { items: { title: string; body: string; link: string }[] }).items.filter((n) => n.title === "Hora de revisar");
  };

  it("às 19h avisa quantos cards há para hoje, uma vez por dia", async () => {
    await app.call("POST", "/study/cards", { cookies, body: { kind: "basic", front: "a", back: "b" } });
    expect(await studyNotes()).toEqual([]); // 09:00 em São Paulo: ainda não é a hora
    app.clock.ms = Date.UTC(2026, 10, 18, 22, 30); // 19:30
    cookies = await app.owner();
    expect(await studyNotes()).toEqual([expect.objectContaining({ body: "1 card para hoje.", link: "#/estudo/revisao" })]);
    await app.call("POST", "/study/cards", { cookies, body: { kind: "basic", front: "c", back: "d" } });
    expect(await studyNotes()).toHaveLength(1);
  });

  it("sem nada para revisar não avisa; desligado também não", async () => {
    app.clock.ms = Date.UTC(2026, 10, 18, 22, 30);
    cookies = await app.owner();
    expect(await studyNotes()).toEqual([]);
    await app.call("PATCH", "/settings", { cookies, body: { checkinsEnabled: { study: false } } });
    await app.call("POST", "/study/cards", { cookies, body: { kind: "basic", front: "a", back: "b" } });
    expect(await studyNotes()).toEqual([]);
  });
});
