import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.js";

let app: TestApp;
let cookies: Record<string, string>;

beforeEach(async () => {
  app = await createTestApp();
  cookies = await app.owner();
});

interface TaskJson {
  id: string;
  title: string;
  date: string | null;
  time: string | null;
  recurrence: string | null;
  done: boolean;
  subtasks: { id: string; title: string; done: boolean }[];
}

interface ListJson {
  days: TaskJson[];
  late: TaskJson[];
  undated: TaskJson[];
}

// O relógio dos testes está em 2026-11-18 (quarta-feira); a semana vai de 16 a 22.
const WEEK = { from: "2026-11-16", to: "2026-11-22", today: "2026-11-18" };

async function create(body: Record<string, unknown>): Promise<TaskJson> {
  const res = await app.call("POST", "/tasks", { cookies, body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { task: TaskJson }).task;
}

async function list(query: Record<string, string> = WEEK): Promise<ListJson> {
  const res = await app.call("GET", "/tasks", { cookies, query });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as ListJson;
}

const done = (id: string, body: Record<string, unknown>) => app.call("POST", `/tasks/${id}/done`, { cookies, body });

describe("acesso", () => {
  it("exige sessão", async () => {
    expect((await app.call("GET", "/tasks", { query: WEEK })).status).toBe(401);
    expect((await app.call("POST", "/tasks", { body: { title: "x" } })).status).toBe(401);
  });
});

describe("criar", () => {
  it("cria tarefa sem data", async () => {
    const task = await create({ title: "  Organizar a Inbox  " });
    expect(task).toMatchObject({ title: "Organizar a Inbox", date: null, time: null, recurrence: null, done: false, subtasks: [] });
  });

  it("cria com data, hora e recorrência", async () => {
    const task = await create({ title: "Daily", date: "2026-11-18", time: "09:30", recurrence: "weekdays" });
    expect(task).toMatchObject({ date: "2026-11-18", time: "09:30", recurrence: "weekdays" });
  });

  it("rejeita título vazio, data inválida, hora inválida e recorrência desconhecida", async () => {
    for (const body of [{ title: "   " }, { title: "x", date: "2026-02-30" }, { title: "x", date: "2026-11-18", time: "25:00" }, { title: "x", date: "2026-11-18", recurrence: "monthly" }]) {
      expect((await app.call("POST", "/tasks", { cookies, body })).status).toBe(400);
    }
  });

  it("hora e recorrência exigem data", async () => {
    expect((await app.call("POST", "/tasks", { cookies, body: { title: "x", time: "09:00" } })).status).toBe(400);
    expect((await app.call("POST", "/tasks", { cookies, body: { title: "x", recurrence: "daily" } })).status).toBe(400);
  });

  it("cria subtarefa, e ela não aceita data nem vira filha de subtarefa", async () => {
    const parent = await create({ title: "Post", date: "2026-11-18" });
    const sub = await create({ title: "Esboço", parentId: parent.id });
    expect(sub.date).toBeNull();
    expect((await app.call("POST", "/tasks", { cookies, body: { title: "x", parentId: parent.id, date: "2026-11-18" } })).status).toBe(400);
    expect((await app.call("POST", "/tasks", { cookies, body: { title: "x", parentId: sub.id } })).status).toBe(404);
    expect((await list()).days[0]!.subtasks.map((s) => s.title)).toEqual(["Esboço"]);
  });
});

describe("listar", () => {
  it("separa dia, atrasadas e sem data", async () => {
    await create({ title: "Hoje 14h", date: "2026-11-18", time: "14:00" });
    await create({ title: "Hoje 9h", date: "2026-11-18", time: "09:00" });
    await create({ title: "Ontem", date: "2026-11-17" });
    await create({ title: "Sem prazo" });
    await create({ title: "Semana que vem", date: "2026-11-25" });

    const res = await list();
    expect(res.days.map((t) => t.title)).toEqual(["Ontem", "Hoje 9h", "Hoje 14h"]);
    expect(res.late.map((t) => t.title)).toEqual(["Ontem"]);
    expect(res.undated.map((t) => t.title)).toEqual(["Sem prazo"]);
  });

  it("tarefa concluída não é atrasada nem sem prazo, mas continua no dia", async () => {
    const past = await create({ title: "Passada", date: "2026-11-17" });
    const loose = await create({ title: "Solta" });
    await done(past.id, { done: true });
    await done(loose.id, { done: true });
    const res = await list();
    expect(res.late).toEqual([]);
    expect(res.undated).toEqual([]);
    expect(res.days.find((t) => t.id === past.id)?.done).toBe(true);
  });

  it("expande recorrentes por dia e ignora lixeira", async () => {
    await create({ title: "Daily", date: "2026-11-16", recurrence: "weekdays" });
    const trashed = await create({ title: "Apagada", date: "2026-11-18" });
    await app.call("DELETE", `/tasks/${trashed.id}`, { cookies });
    const res = await list();
    expect(res.days.map((t) => t.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
    expect(res.late).toEqual([]);
  });

  it("recorrente que ainda não começou não aparece", async () => {
    await create({ title: "Futura", date: "2026-12-01", recurrence: "daily" });
    expect((await list()).days).toEqual([]);
  });

  it("valida o intervalo", async () => {
    for (const query of [{ from: "2026-11-22", to: "2026-11-16", today: "2026-11-18" }, { from: "x", to: "2026-11-16", today: "2026-11-18" }, { from: "2026-01-01", to: "2026-12-31", today: "2026-11-18" }, { from: "2026-11-16", to: "2026-11-22" } as Record<string, string>]) {
      expect((await app.call("GET", "/tasks", { cookies, query })).status).toBe(400);
    }
  });
});

describe("concluir", () => {
  it("conclui e reabre tarefa simples", async () => {
    const task = await create({ title: "A", date: "2026-11-18" });
    expect((await done(task.id, { done: true })).status).toBe(200);
    expect((await list()).days[0]!.done).toBe(true);
    await done(task.id, { done: false });
    expect((await list()).days[0]!.done).toBe(false);
  });

  it("recorrente conclui só o dia informado", async () => {
    const task = await create({ title: "Treino", date: "2026-11-16", recurrence: "daily" });
    expect((await done(task.id, { done: true, date: "2026-11-18" })).status).toBe(200);
    const states = Object.fromEntries((await list()).days.map((t) => [t.date, t.done]));
    expect(states).toMatchObject({ "2026-11-17": false, "2026-11-18": true, "2026-11-19": false });
    await done(task.id, { done: false, date: "2026-11-18" });
    expect((await list()).days.every((t) => !t.done)).toBe(true);
  });

  it("recorrente exige dia que seja ocorrência", async () => {
    const task = await create({ title: "Daily", date: "2026-11-16", recurrence: "weekdays" });
    expect((await done(task.id, { done: true })).status).toBe(400);
    expect((await done(task.id, { done: true, date: "2026-11-21" })).status).toBe(400); // sábado
    expect((await done(task.id, { done: true, date: "2026-11-10" })).status).toBe(400); // antes do início
  });

  it("concluir duas vezes o mesmo dia não duplica", async () => {
    const task = await create({ title: "Treino", date: "2026-11-16", recurrence: "daily" });
    await done(task.id, { done: true, date: "2026-11-18" });
    expect((await done(task.id, { done: true, date: "2026-11-18" })).status).toBe(200);
  });

  it("subtarefa conclui como tarefa simples", async () => {
    const parent = await create({ title: "Post", date: "2026-11-18" });
    const sub = await create({ title: "Esboço", parentId: parent.id });
    await done(sub.id, { done: true });
    expect((await list()).days[0]!.subtasks[0]!.done).toBe(true);
  });

  it("valida corpo e id", async () => {
    const task = await create({ title: "A" });
    expect((await done(task.id, {})).status).toBe(400);
    expect((await done("00000000-0000-4000-8000-000000000000", { done: true })).status).toBe(404);
  });
});

describe("editar", () => {
  it("muda título, data e hora", async () => {
    const task = await create({ title: "A" });
    const res = await app.call("PATCH", `/tasks/${task.id}`, { cookies, body: { title: "B", date: "2026-11-19", time: "10:00" } });
    expect(res.status).toBe(200);
    expect((res.body as { task: TaskJson }).task).toMatchObject({ title: "B", date: "2026-11-19", time: "10:00" });
  });

  it("tirar a data limpa hora e recorrência", async () => {
    const task = await create({ title: "A", date: "2026-11-18", time: "10:00", recurrence: "daily" });
    const res = await app.call("PATCH", `/tasks/${task.id}`, { cookies, body: { date: null } });
    expect((res.body as { task: TaskJson }).task).toMatchObject({ date: null, time: null, recurrence: null });
  });

  it("subtarefa não aceita data", async () => {
    const parent = await create({ title: "P" });
    const sub = await create({ title: "S", parentId: parent.id });
    expect((await app.call("PATCH", `/tasks/${sub.id}`, { cookies, body: { date: "2026-11-18" } })).status).toBe(400);
  });

  it("rejeita patch vazio e id inexistente", async () => {
    const task = await create({ title: "A" });
    expect((await app.call("PATCH", `/tasks/${task.id}`, { cookies, body: {} })).status).toBe(400);
    expect((await app.call("PATCH", "/tasks/00000000-0000-4000-8000-000000000000", { cookies, body: { title: "x" } })).status).toBe(404);
  });
});

describe("reagendar em lote", () => {
  it("move tarefas simples e ignora recorrentes e subtarefas", async () => {
    const a = await create({ title: "A", date: "2026-11-16" });
    const b = await create({ title: "B", date: "2026-11-17" });
    const rec = await create({ title: "R", date: "2026-11-16", recurrence: "daily" });
    const sub = await create({ title: "S", parentId: a.id });
    const res = await app.call("POST", "/tasks/reschedule", { cookies, body: { ids: [a.id, b.id, rec.id, sub.id], date: "2026-11-18" } });
    expect(res.body).toEqual({ updated: 2 });
    expect((await list()).late).toEqual([]);
  });

  it("valida ids e data", async () => {
    expect((await app.call("POST", "/tasks/reschedule", { cookies, body: { ids: [], date: "2026-11-18" } })).status).toBe(400);
    expect((await app.call("POST", "/tasks/reschedule", { cookies, body: { ids: ["x"], date: "2026-11-18" } })).status).toBe(400);
  });
});

describe("lixeira", () => {
  it("apaga com subtarefas e restaura", async () => {
    const parent = await create({ title: "P", date: "2026-11-18" });
    await create({ title: "S", parentId: parent.id });
    expect((await app.call("DELETE", `/tasks/${parent.id}`, { cookies })).status).toBe(200);
    expect((await list()).days).toEqual([]);
    const res = await app.call("POST", `/tasks/${parent.id}/restore`, { cookies });
    expect(res.status).toBe(200);
    expect((await list()).days[0]!.subtasks).toHaveLength(1);
  });

  it("restaurar não traz de volta subtarefa apagada antes", async () => {
    const parent = await create({ title: "P", date: "2026-11-18" });
    const sub = await create({ title: "S", parentId: parent.id });
    await app.call("DELETE", `/tasks/${sub.id}`, { cookies });
    app.clock.ms += 1000;
    await app.call("DELETE", `/tasks/${parent.id}`, { cookies });
    await app.call("POST", `/tasks/${parent.id}/restore`, { cookies });
    expect((await list()).days[0]!.subtasks).toEqual([]);
  });

  it("apagar duas vezes dá 404", async () => {
    const task = await create({ title: "A" });
    await app.call("DELETE", `/tasks/${task.id}`, { cookies });
    expect((await app.call("DELETE", `/tasks/${task.id}`, { cookies })).status).toBe(404);
  });
});
