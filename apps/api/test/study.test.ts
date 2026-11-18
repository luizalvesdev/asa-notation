import { beforeEach, describe, expect, it } from "vitest";
import { blockTexts, extractCards } from "../src/study/extract.js";
import { createTestApp, doc, type TestApp } from "./helpers.js";

let app: TestApp;
let cookies: Record<string, string>;

beforeEach(async () => {
  app = await createTestApp();
  cookies = await app.owner();
});

const DAY_START = "2026-11-18T03:00:00.000Z"; // meia-noite em São Paulo

interface CardJson {
  id: string;
  kind: string;
  front: string;
  back: string;
  state: number;
  dueAt: string;
  deckId: string | null;
  sourceTitle: string | null;
  preview: Record<string, string>;
}
interface OverviewJson {
  dueReview: number;
  newAvailable: number;
  totalCards: number;
  avgSeconds: number;
  decks: { id: string; title: string; cards: number; due: number; learned: number; goalTitle: string | null }[];
  weak: { id: string; lapses: number }[];
}

async function addCard(body: Record<string, unknown>) {
  const res = await app.call("POST", "/study/cards", { cookies, body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}
const queue = async () => ((await app.call("GET", "/study/queue", { cookies, query: { dayStart: DAY_START } })).body as { cards: CardJson[] }).cards;
const overview = async () => (await app.call("GET", "/study/overview", { cookies, query: { dayStart: DAY_START } })).body as OverviewJson;
const rate = (id: string, rating: number, durationMs?: number) => app.call("POST", `/study/cards/${id}/review`, { cookies, body: durationMs === undefined ? { rating } : { rating, durationMs } });

describe("extração", () => {
  it("lê parágrafos e títulos, ignorando blocos vazios", () => {
    const body = { type: "doc", content: [{ type: "heading", content: [{ type: "text", text: "Raft" }] }, { type: "paragraph" }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item" }] }] }] }] };
    expect(blockTexts(body)).toEqual(["Raft", "item"]);
  });

  it("acha cards básicos e de lacuna, sem repetir", () => {
    const found = extractCards(["Quem é o líder? :: O nó que replica o log", "O líder envia {{heartbeats}} periódicos", "texto comum", "Quem é o líder? :: O nó que replica o log", " :: sem frente", "sem verso ::"]);
    expect(found.map((c) => c.kind)).toEqual(["basic", "cloze"]);
    expect(found[0]).toMatchObject({ front: "Quem é o líder?", back: "O nó que replica o log" });
    expect(found[1]).toMatchObject({ front: "O líder envia {{heartbeats}} periódicos", back: "" });
  });
});

describe("cards", () => {
  it("exige sessão", async () => {
    expect((await app.call("GET", "/study/overview", { query: { dayStart: DAY_START } })).status).toBe(401);
  });

  it("valida os campos", async () => {
    for (const body of [{ kind: "x", front: "a", back: "b" }, { kind: "basic", front: "a" }, { kind: "basic", front: " ", back: "b" }, { kind: "cloze", front: "sem lacuna" }, { kind: "basic", front: "a", back: "b", deckId: "x" }, { kind: "basic", front: "a", back: "b", sourceKey: "k" }]) {
      expect((await app.call("POST", "/study/cards", { cookies, body })).status).toBe(400);
    }
    expect((await app.call("POST", "/study/cards", { cookies, body: { kind: "basic", front: "a", back: "b", deckId: "00000000-0000-4000-8000-000000000000" } })).status).toBe(404);
  });

  it("cria card de lacuna sem verso e lista", async () => {
    await addCard({ kind: "cloze", front: "Raft usa {{eleição}} de líder", back: "ignorado" });
    const list = (await app.call("GET", "/study/cards", { cookies })).body as { cards: CardJson[] };
    expect(list.cards[0]).toMatchObject({ kind: "cloze", back: "", state: 0 });
  });

  it("apaga card", async () => {
    await addCard({ kind: "basic", front: "a", back: "b" });
    const [card] = await queue();
    expect((await app.call("DELETE", `/study/cards/${card!.id}`, { cookies })).status).toBe(200);
    expect(await queue()).toEqual([]);
    expect((await app.call("DELETE", `/study/cards/${card!.id}`, { cookies })).status).toBe(404);
  });
});

describe("trilhas", () => {
  it("cria, liga a uma meta, edita e apaga soltando os cards", async () => {
    const goal = ((await app.call("POST", "/goals", { cookies, body: { title: "Certificação" } })).body as { goal: { id: string } }).goal;
    const res = await app.call("POST", "/study/decks", { cookies, body: { title: "Sistemas distribuídos", goalId: goal.id } });
    expect(res.status).toBe(201);
    const deck = (res.body as { deck: { id: string; goalTitle: string } }).deck;
    expect(deck.goalTitle).toBe("Certificação");

    await addCard({ kind: "basic", front: "a", back: "b", deckId: deck.id });
    expect((await overview()).decks[0]).toMatchObject({ cards: 1, learned: 0 });

    const renamed = await app.call("PATCH", `/study/decks/${deck.id}`, { cookies, body: { title: "SD", goalId: null } });
    expect((renamed.body as { deck: { title: string; goalTitle: string | null } }).deck).toMatchObject({ title: "SD", goalTitle: null });

    expect((await app.call("DELETE", `/study/decks/${deck.id}`, { cookies })).status).toBe(200);
    expect((await overview()).decks).toEqual([]);
    expect((await queue())[0]!.deckId).toBeNull();
  });

  it("valida título e meta", async () => {
    expect((await app.call("POST", "/study/decks", { cookies, body: { title: " " } })).status).toBe(400);
    expect((await app.call("POST", "/study/decks", { cookies, body: { title: "x", goalId: "00000000-0000-4000-8000-000000000000" } })).status).toBe(404);
  });
});

describe("fila e revisão", () => {
  it("cards novos entram na fila com prévia das quatro notas", async () => {
    await addCard({ kind: "basic", front: "a", back: "b" });
    const [card] = await queue();
    expect(Object.keys(card!.preview).sort()).toEqual(["1", "2", "3", "4"]);
    expect(Date.parse(card!.preview["1"]!)).toBeLessThan(Date.parse(card!.preview["4"]!));
  });

  it("nota boa tira o card da fila; errar traz de volta em minutos", async () => {
    await addCard({ kind: "basic", front: "bom", back: "b" });
    await addCard({ kind: "basic", front: "ruim", back: "b" });
    const cards = await queue();
    const good = cards.find((c) => c.front === "bom")!;
    const bad = cards.find((c) => c.front === "ruim")!;
    expect((await rate(good.id, 3)).status).toBe(200);
    const again = (await rate(bad.id, 1)).body as { dueAt: string; state: number };
    expect(again.state).toBe(1);
    expect(Date.parse(again.dueAt) - app.clock.ms).toBeLessThan(15 * 60_000);

    expect(await queue()).toEqual([]);
    app.clock.ms += 20 * 60_000;
    expect((await queue()).map((c) => c.front)).toEqual(["ruim"]);
  });

  it("limita os novos por dia, contando os já revisados hoje", async () => {
    for (let i = 0; i < 12; i++) await addCard({ kind: "basic", front: `c${i}`, back: "b" });
    expect(await queue()).toHaveLength(10);
    expect((await overview()).newAvailable).toBe(10);
    const [first, second, third] = await queue();
    for (const c of [first!, second!, third!]) await rate(c.id, 3);
    // 3 novos já vistos: sobram 7 dos 9 que continuam novos
    expect((await queue()).filter((c) => c.state === 0)).toHaveLength(7);
    expect((await overview()).newAvailable).toBe(7);
  });

  it("card revisado vence de novo no dia certo e conta como aprendido", async () => {
    await addCard({ kind: "basic", front: "a", back: "b" });
    const [card] = await queue();
    const res = (await rate(card!.id, 4)).body as { dueAt: string; state: number };
    expect(res.state).toBe(2);
    expect(Date.parse(res.dueAt)).toBeGreaterThan(app.clock.ms + 24 * 3_600_000);
    expect((await overview()).decks).toEqual([]);
    app.clock.ms = Date.parse(res.dueAt) + 1000;
    cookies = await app.owner(); // a sessão (1 h) expirou com o salto
    const due = await queue();
    expect(due).toHaveLength(1);
    expect(due[0]!.state).toBe(2);
    expect((await overview()).dueReview).toBe(1);
  });

  it("valida nota, duração e id", async () => {
    await addCard({ kind: "basic", front: "a", back: "b" });
    const [card] = await queue();
    expect((await rate(card!.id, 5)).status).toBe(400);
    expect((await rate(card!.id, 0)).status).toBe(400);
    expect((await rate(card!.id, 3, -1)).status).toBe(400);
    expect((await rate("00000000-0000-4000-8000-000000000000", 3)).status).toBe(404);
  });

  it("exige dayStart válido", async () => {
    expect((await app.call("GET", "/study/queue", { cookies, query: {} })).status).toBe(400);
    expect((await app.call("GET", "/study/overview", { cookies, query: { dayStart: "ontem" } })).status).toBe(400);
  });

  it("pontos fracos: card errado duas vezes na semana", async () => {
    await addCard({ kind: "basic", front: "difícil", back: "b" });
    const [card] = await queue();
    await rate(card!.id, 1);
    expect((await overview()).weak).toEqual([]);
    await rate(card!.id, 1);
    expect((await overview()).weak).toEqual([expect.objectContaining({ id: card!.id, lapses: 2 })]);
  });

  it("tempo médio vem das revisões", async () => {
    await addCard({ kind: "basic", front: "a", back: "b" });
    expect((await overview()).avgSeconds).toBe(40);
    const [card] = await queue();
    await rate(card!.id, 3, 20_000);
    expect((await overview()).avgSeconds).toBe(20);
  });
});

describe("extrair de uma página", () => {
  it("sugere cards, marca os que já existem e não duplica ao aprovar", async () => {
    const body = doc("Quem lidera o Raft? :: O líder eleito", "O líder envia {{heartbeats}}", "texto comum");
    const page = ((await app.call("POST", "/pages", { cookies, body: { title: "Consenso com Raft", body } })).body as { page: { id: string } }).page;

    const first = (await app.call("POST", "/study/extract", { cookies, body: { pageId: page.id } })).body as { candidates: { kind: string; front: string; back: string; sourceKey: string; exists: boolean }[] };
    expect(first.candidates.map((c) => [c.kind, c.exists])).toEqual([["basic", false], ["cloze", false]]);

    const items = first.candidates.slice(0, 1).map((c) => ({ kind: c.kind, front: c.front, back: c.back, sourcePageId: page.id, sourceKey: c.sourceKey }));
    const saved = await app.call("POST", "/study/cards/bulk", { cookies, body: { items } });
    expect(saved.body).toEqual({ created: 1, skipped: 0 });
    const again = await app.call("POST", "/study/cards/bulk", { cookies, body: { items } });
    expect(again.body).toEqual({ created: 0, skipped: 1 });

    const second = (await app.call("POST", "/study/extract", { cookies, body: { pageId: page.id } })).body as { candidates: { exists: boolean }[] };
    expect(second.candidates.map((c) => c.exists)).toEqual([true, false]);
    expect((await queue())[0]!.sourceTitle).toBe("Consenso com Raft");
  });

  it("página inexistente dá 404 e id ruim dá 400", async () => {
    expect((await app.call("POST", "/study/extract", { cookies, body: { pageId: "00000000-0000-4000-8000-000000000000" } })).status).toBe(404);
    expect((await app.call("POST", "/study/extract", { cookies, body: { pageId: "x" } })).status).toBe(400);
  });

  it("bulk valida os itens e a trilha", async () => {
    expect((await app.call("POST", "/study/cards/bulk", { cookies, body: { items: [] } })).status).toBe(400);
    expect((await app.call("POST", "/study/cards/bulk", { cookies, body: { items: [{ kind: "basic", front: "a" }] } })).status).toBe(400);
    expect((await app.call("POST", "/study/cards/bulk", { cookies, body: { deckId: "00000000-0000-4000-8000-000000000000", items: [{ kind: "basic", front: "a", back: "b" }] } })).status).toBe(404);
  });
});

describe("estatísticas", () => {
  const stats = async (query: Record<string, string> = { tz: "America/Sao_Paulo" }) => (await app.call("GET", "/study/stats", { cookies, query })).body as {
    days: { day: string; reviews: number; seconds: number; remembered: number }[];
    retention: number | null;
    reviews: number;
    seconds: number;
    states: Record<string, number>;
    hardest: { id: string; lapses: number }[];
    upcoming: { day: string; due: number }[];
  };

  it("sem revisões: tudo zerado e retenção nula", async () => {
    const s = await stats();
    expect(s).toMatchObject({ days: [], retention: null, reviews: 0, seconds: 0 });
  });

  it("agrupa por dia no fuso, soma tempo e calcula retenção só sobre cards em revisão", async () => {
    await addCard({ kind: "basic", front: "a", back: "b" });
    await addCard({ kind: "basic", front: "b", back: "b" });
    const cards = await queue();
    await rate(cards[0]!.id, 4, 10_000); // novo -> revisão
    await rate(cards[1]!.id, 1, 5_000); // novo, errou
    expect((await stats()).retention).toBeNull();

    app.clock.ms += 30 * 24 * 3_600_000;
    cookies = await app.owner();
    await rate(cards[0]!.id, 3, 8_000); // revisão lembrada
    await rate(cards[0]!.id, 1, 2_000); // errou ainda em revisão: não lembrou
    const s = await stats({ tz: "America/Sao_Paulo", days: "60" });
    expect(s.reviews).toBe(4);
    expect(s.seconds).toBe(25);
    expect(s.days.map((d) => d.day)).toEqual(["2026-11-18", "2026-12-18"]);
    expect(s.days[0]).toMatchObject({ reviews: 2, seconds: 15, remembered: 1 });
    expect(s.retention).toBe(0.5); // dois cards em revisão, um lembrado
    expect(s.hardest[0]!.lapses).toBe(1);
  });

  it("conta cards por estado e prevê os próximos dias", async () => {
    await addCard({ kind: "basic", front: "a", back: "b" });
    await addCard({ kind: "basic", front: "b", back: "b" });
    const [a] = await queue();
    await rate(a!.id, 3);
    const s = await stats();
    expect(s.states).toMatchObject({ new: 1, review: 1 });
    expect(s.upcoming.every((u) => /^\d{4}-\d{2}-\d{2}$/.test(u.day))).toBe(true);
  });

  it("valida o fuso e o período", async () => {
    for (const query of [{ tz: "Nao/Existe" } as Record<string, string>, { tz: "x; drop table cards" }, { tz: "UTC", days: "0" }, { tz: "UTC", days: "400" }]) {
      expect((await app.call("GET", "/study/stats", { cookies, query })).status).toBe(400);
    }
  });
});
