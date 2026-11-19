import { beforeEach, describe, expect, it } from "vitest";
import { dueCheckins, localParts } from "../src/notifications/checkins.js";
import { DEFAULT_SETTINGS } from "../src/settings/model.js";
import { verdict, weekMetrics } from "../src/routine/metrics.js";
import { createTestApp, type TestApp } from "./helpers.js";

let app: TestApp;
let cookies: Record<string, string>;

beforeEach(async () => {
  app = await createTestApp();
  cookies = await app.owner();
});

const at = (iso: string) => Date.parse(iso);
const call = (method: string, path: string, init: { query?: Record<string, string>; body?: unknown } = {}) => app.call(method, path, { cookies, ...init });

describe("localParts", () => {
  it("converte para o fuso", () => {
    // 12:00 UTC = 09:00 em São Paulo (UTC-3)
    expect(localParts(at("2026-11-18T12:00:00Z"), "America/Sao_Paulo")).toEqual({ date: "2026-11-18", weekday: 3, minutes: 540 });
    // 01:00 UTC ainda é o dia anterior em São Paulo
    expect(localParts(at("2026-11-18T01:00:00Z"), "America/Sao_Paulo")).toMatchObject({ date: "2026-11-17", weekday: 2, minutes: 22 * 60 });
  });
});

describe("dueCheckins", () => {
  const settings = DEFAULT_SETTINGS; // plano 08:30, quinta 18:00, sábado 10:00, São Paulo
  const keys = (iso: string, s = settings) => dueCheckins(at(iso), s).map((d) => d.dedupeKey);

  it("quarta de manhã: só o plano de hoje", () => {
    expect(keys("2026-11-18T12:00:00Z")).toEqual(["plan:2026-11-18"]);
  });

  it("antes do horário, o de hoje ainda não vence", () => {
    // 10:00 UTC = 07:00 BRT
    expect(keys("2026-11-18T10:00:00Z")).toEqual([]);
  });

  it("quinta depois das 18h inclui as métricas", () => {
    expect(keys("2026-11-19T22:00:00Z")).toContain("thursday:2026-11-19");
    expect(keys("2026-11-19T20:00:00Z")).not.toContain("thursday:2026-11-19"); // 17:00 BRT
  });

  it("sexta ainda mostra a quinta de ontem; sábado depois das 10h traz a revisão", () => {
    expect(keys("2026-11-20T15:00:00Z")).toContain("thursday:2026-11-19");
    expect(keys("2026-11-21T14:00:00Z")).toContain("saturday:2026-11-21");
  });

  it("respeita os desligados", () => {
    const off = { ...settings, checkinsEnabled: { plan: false, thursday: true, saturday: true, study: false } };
    expect(keys("2026-11-18T12:00:00Z", off)).toEqual([]);
  });
});

describe("avaliação por regra", () => {
  const m = (tasksDone: number, tasksTotal: number, activeDays: number) => ({ tasksDone, tasksTotal, studySeconds: 0, cardsReviewed: 0, activeDays, days: 7 });
  it("forte, boa e abaixo do ritmo", () => {
    expect(verdict(m(10, 12, 6)).verdict).toBe("forte");
    expect(verdict(m(5, 10, 4)).verdict).toBe("boa");
    expect(verdict(m(1, 10, 1)).verdict).toBe("abaixo");
  });
  it("sem tarefas planejadas só a constância conta", () => {
    expect(verdict(m(0, 0, 7))).toEqual({ verdict: "forte", score: 100 });
    expect(verdict(m(0, 0, 0)).verdict).toBe("abaixo");
  });
  it("não passa de 100 com mais concluídas que planejadas", () => {
    expect(verdict(m(20, 10, 7)).score).toBe(100);
  });
  it("weekMetrics soma a semana e conta dias ativos", () => {
    const activity = new Map([
      ["2026-11-16", { tasks: 2, reviews: 0, seconds: 0 }],
      ["2026-11-17", { tasks: 0, reviews: 10, seconds: 300 }],
      ["2026-11-23", { tasks: 9, reviews: 9, seconds: 999 }], // fora da semana
    ]);
    expect(weekMetrics("2026-11-16", activity, 2, 5)).toMatchObject({ tasksDone: 2, tasksTotal: 5, cardsReviewed: 10, studySeconds: 300, activeDays: 2 });
  });
});

describe("notificações", () => {
  const list = async (filter = "all") => (await call("GET", "/notifications", { query: { filter } })).body as { items: { id: string; kind: string; title: string; body: string; link: string | null; read: boolean }[]; unread: number };

  it("exige sessão", async () => {
    expect((await app.call("GET", "/notifications")).status).toBe(401);
  });

  it("gera o plano do dia com contagens e não repete", async () => {
    await call("POST", "/tasks", { body: { title: "A", date: "2026-11-18" } });
    await call("POST", "/tasks", { body: { title: "Atrasada", date: "2026-11-16" } });
    const first = await list();
    expect(first.items).toHaveLength(1);
    const plan = first.items[0];
    expect(plan?.title).toBe("Plano do dia");
    expect(plan?.body).toContain("1 tarefa hoje");
    expect(plan?.body).toContain("1 atrasada");
    expect(plan?.link).toBe("#/hoje");
    expect(first.unread).toBe(first.items.length);
    expect((await list()).items).toHaveLength(first.items.length);
  });

  it("marca como lida, não lida e todas", async () => {
    const { items } = await list();
    expect((await call("PATCH", `/notifications/${items[0]!.id}`, { body: { read: true } })).status).toBe(200);
    expect((await list("unread")).items.some((n) => n.id === items[0]!.id)).toBe(false);
    await call("PATCH", `/notifications/${items[0]!.id}`, { body: { read: false } });
    expect((await list()).unread).toBe(items.length);
    await call("POST", "/notifications/read-all");
    expect((await list()).unread).toBe(0);
    expect(((await call("GET", "/notifications/count")).body as { unread: number }).unread).toBe(0);
  });

  it("valida filtro, corpo e id", async () => {
    expect((await call("GET", "/notifications", { query: { filter: "x" } })).status).toBe(400);
    const { items } = await list();
    expect((await call("PATCH", `/notifications/${items[0]!.id}`, { body: {} })).status).toBe(400);
    expect((await call("PATCH", "/notifications/00000000-0000-4000-8000-000000000000", { body: { read: true } })).status).toBe(404);
  });

  it("check-in desligado não gera", async () => {
    await call("PATCH", "/settings", { body: { checkinsEnabled: { plan: false } } });
    expect((await list()).items).toEqual([]);
  });

  it("quinta à noite traz as métricas com link para a Rotina", async () => {
    app.clock.ms = at("2026-11-19T22:00:00Z");
    cookies = await app.owner();
    const n = (await list()).items.find((i) => i.kind === "thursday");
    expect(n).toMatchObject({ title: "Métricas da quinta", link: "#/rotina/quinta" });
  });
});

describe("rotina semanal", () => {
  const week = (start = "2026-11-16") => call("GET", "/routine/week", { query: { start, tz: "America/Sao_Paulo" } });

  it("calcula as métricas da semana", async () => {
    const done = ((await call("POST", "/tasks", { body: { title: "Feita", date: "2026-11-17" } })).body as { task: { id: string } }).task;
    await call("POST", "/tasks", { body: { title: "Aberta", date: "2026-11-18" } });
    await call("POST", `/tasks/${done.id}/done`, { body: { done: true } });
    await call("POST", "/study/cards", { body: { kind: "basic", front: "a", back: "b" } });
    const queue = ((await call("GET", "/study/queue", { query: { dayStart: "2026-11-18T03:00:00.000Z" } })).body as { cards: { id: string }[] }).cards;
    await call("POST", `/study/cards/${queue[0]!.id}/review`, { body: { rating: 3, durationMs: 30_000 } });

    const res = (await week()).body as { metrics: Record<string, number>; verdict: string; score: number; review: unknown };
    expect(res.metrics).toMatchObject({ tasksDone: 1, tasksTotal: 2, cardsReviewed: 1, studySeconds: 30, activeDays: 1 });
    expect(["forte", "boa", "abaixo"]).toContain(res.verdict);
    expect(res.review).toBeNull();
  });

  it("recorrentes entram nas métricas por dia", async () => {
    const rec = ((await call("POST", "/tasks", { body: { title: "Treino", date: "2026-11-16", recurrence: "daily" } })).body as { task: { id: string } }).task;
    await call("POST", `/tasks/${rec.id}/done`, { body: { done: true, date: "2026-11-16" } });
    await call("POST", `/tasks/${rec.id}/done`, { body: { done: true, date: "2026-11-17" } });
    const res = (await week()).body as { metrics: Record<string, number> };
    expect(res.metrics).toMatchObject({ tasksDone: 2, tasksTotal: 7, activeDays: 2 });
  });

  it("valida a consulta", async () => {
    expect((await call("GET", "/routine/week", { query: { start: "x", tz: "UTC" } })).status).toBe(400);
    expect((await call("GET", "/routine/week", { query: { start: "2026-11-16", tz: "Nao/Existe" } })).status).toBe(400);
  });

  it("salva a revisão por partes e devolve junto das métricas", async () => {
    await call("PUT", "/routine/review", { body: { weekStart: "2026-11-16", rating: 4, worked: "Estudei" } });
    await call("PUT", "/routine/review", { body: { weekStart: "2026-11-16", blocked: "Proposta parada", focus: ["Enviar proposta", "  Estudar Raft  "] } });
    const { review } = (await week()).body as { review: Record<string, unknown> };
    expect(review).toEqual({ weekStart: "2026-11-16", rating: 4, worked: "Estudei", blocked: "Proposta parada", focus: ["Enviar proposta", "Estudar Raft"], applied: false });
  });

  it("valida a revisão", async () => {
    for (const body of [{}, { weekStart: "x", rating: 3 }, { weekStart: "2026-11-16", rating: 6 }, { weekStart: "2026-11-16", worked: 5 }, { weekStart: "2026-11-16", focus: ["a", "b", "c", "d"] }, { weekStart: "2026-11-16", focus: [" "] }, { weekStart: "2026-11-16" }]) {
      expect((await call("PUT", "/routine/review", { body })).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("aplicar cria tarefas na segunda seguinte, uma vez só", async () => {
    await call("PUT", "/routine/review", { body: { weekStart: "2026-11-16", focus: ["Enviar proposta", "Estudar Raft"] } });
    const res = await call("POST", "/routine/review/apply", { body: { weekStart: "2026-11-16" } });
    expect(res.body).toEqual({ created: 2, date: "2026-11-23" });
    const tasks = (await call("GET", "/tasks", { query: { from: "2026-11-23", to: "2026-11-23", today: "2026-11-23" } })).body as { days: { title: string }[] };
    expect(tasks.days.map((t) => t.title).sort()).toEqual(["Enviar proposta", "Estudar Raft"]);
    expect((await call("POST", "/routine/review/apply", { body: { weekStart: "2026-11-16" } })).status).toBe(409);
    expect(((await week()).body as { review: { applied: boolean } }).review.applied).toBe(true);
  });

  it("aplicar sem foco dá 400", async () => {
    expect((await call("POST", "/routine/review/apply", { body: { weekStart: "2026-11-16" } })).status).toBe(400);
    await call("PUT", "/routine/review", { body: { weekStart: "2026-11-16", rating: 3 } });
    expect((await call("POST", "/routine/review/apply", { body: { weekStart: "2026-11-16" } })).status).toBe(400);
  });
});

describe("progresso", () => {
  const progress = async (query: Record<string, string>) => (await call("GET", "/progress", { query: { tz: "America/Sao_Paulo", ...query } })).body as {
    weeks: { start: string; tasks: number; reviews: number; seconds: number; activeDays: number }[];
    days: { day: string; tasks: number; reviews: number }[];
    streak: number;
  };

  it("monta semanas terminando na de hoje, com todos os dias", async () => {
    const p = await progress({ today: "2026-11-18", weeks: "3" });
    expect(p.weeks.map((w) => w.start)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(p.days).toHaveLength(21);
    expect(p.days[0]!.day).toBe("2026-11-02");
    expect(p.streak).toBe(0);
  });

  it("soma por semana e conta a sequência", async () => {
    for (const date of ["2026-11-16", "2026-11-17", "2026-11-18"]) {
      const t = ((await call("POST", "/tasks", { body: { title: date, date } })).body as { task: { id: string } }).task;
      await call("POST", `/tasks/${t.id}/done`, { body: { done: true } });
    }
    const p = await progress({ today: "2026-11-18", weeks: "2" });
    // todas as conclusões acontecem "agora" (18/11), no relógio dos testes
    expect(p.weeks[1]).toMatchObject({ tasks: 3, activeDays: 1 });
    expect(p.streak).toBe(1);
  });

  it("valida o período", async () => {
    for (const query of [{ today: "x" } as Record<string, string>, { today: "2026-11-18", weeks: "0" }, { today: "2026-11-18", weeks: "99" }, { today: "2026-11-18", tz: "Nao/Existe" }]) {
      expect((await call("GET", "/progress", { query })).status).toBe(400);
    }
  });
});
