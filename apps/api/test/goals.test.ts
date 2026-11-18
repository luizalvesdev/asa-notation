import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.js";

let app: TestApp;
let cookies: Record<string, string>;

beforeEach(async () => {
  app = await createTestApp();
  cookies = await app.owner();
});

interface GoalJson {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  done: boolean;
  tasksTotal: number;
  tasksDone: number;
}

interface TaskJson {
  id: string;
  title: string;
  goalId: string | null;
  goalTitle: string | null;
  done: boolean;
}

async function createGoal(body: Record<string, unknown>): Promise<GoalJson> {
  const res = await app.call("POST", "/goals", { cookies, body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { goal: GoalJson }).goal;
}

async function createTask(body: Record<string, unknown>): Promise<TaskJson> {
  const res = await app.call("POST", "/tasks", { cookies, body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { task: TaskJson }).task;
}

const listGoals = async () => ((await app.call("GET", "/goals", { cookies })).body as { goals: GoalJson[] }).goals;
const done = (id: string, value: boolean, date?: string) => app.call("POST", `/tasks/${id}/done`, { cookies, body: date ? { done: value, date } : { done: value } });

describe("metas", () => {
  it("exige sessão", async () => {
    expect((await app.call("GET", "/goals")).status).toBe(401);
  });

  it("cria com valores padrão e valida a entrada", async () => {
    const goal = await createGoal({ title: "  Certificação  " });
    expect(goal).toMatchObject({ title: "Certificação", description: "", dueDate: null, done: false, tasksTotal: 0, tasksDone: 0 });
    for (const body of [{ title: " " }, { title: "x", dueDate: "2026-02-30" }, { title: "x", description: 5 }]) {
      expect((await app.call("POST", "/goals", { cookies, body })).status).toBe(400);
    }
  });

  it("lista ordenando por prazo, sem prazo por último", async () => {
    await createGoal({ title: "Sem prazo" });
    await createGoal({ title: "Dezembro", dueDate: "2026-12-31" });
    await createGoal({ title: "Março", dueDate: "2027-03-31" });
    expect((await listGoals()).map((g) => g.title)).toEqual(["Dezembro", "Março", "Sem prazo"]);
  });

  it("edita título, descrição e prazo; limpa o prazo com null", async () => {
    const goal = await createGoal({ title: "A", dueDate: "2026-12-31" });
    const res = await app.call("PATCH", `/goals/${goal.id}`, { cookies, body: { title: "B", description: "texto", dueDate: null } });
    expect((res.body as { goal: GoalJson }).goal).toMatchObject({ title: "B", description: "texto", dueDate: null });
    expect((await app.call("PATCH", `/goals/${goal.id}`, { cookies, body: {} })).status).toBe(400);
  });

  it("conclui e reabre", async () => {
    const goal = await createGoal({ title: "A" });
    const concluded = await app.call("PATCH", `/goals/${goal.id}`, { cookies, body: { done: true } });
    expect((concluded.body as { goal: GoalJson }).goal.done).toBe(true);
    const reopened = await app.call("PATCH", `/goals/${goal.id}`, { cookies, body: { done: false } });
    expect((reopened.body as { goal: GoalJson }).goal.done).toBe(false);
  });

  it("apaga e restaura", async () => {
    const goal = await createGoal({ title: "A" });
    expect((await app.call("DELETE", `/goals/${goal.id}`, { cookies })).status).toBe(200);
    expect(await listGoals()).toEqual([]);
    expect((await app.call("GET", `/goals/${goal.id}`, { cookies })).status).toBe(404);
    expect((await app.call("POST", `/goals/${goal.id}/restore`, { cookies })).status).toBe(200);
    expect(await listGoals()).toHaveLength(1);
  });
});

describe("tarefas ligadas", () => {
  it("cria tarefa ligada e mostra o título da meta", async () => {
    const goal = await createGoal({ title: "Freelas" });
    const task = await createTask({ title: "Proposta", goalId: goal.id });
    expect(task).toMatchObject({ goalId: goal.id, goalTitle: "Freelas" });
  });

  it("o progresso conta só tarefas simples e principais", async () => {
    const goal = await createGoal({ title: "Posts" });
    const a = await createTask({ title: "A", goalId: goal.id });
    await createTask({ title: "B", goalId: goal.id });
    await createTask({ title: "Treino", goalId: goal.id, date: "2026-11-16", recurrence: "daily" });
    await createTask({ title: "Sub", parentId: a.id });
    await done(a.id, true);
    expect((await listGoals())[0]).toMatchObject({ tasksTotal: 2, tasksDone: 1 });
  });

  it("tarefa apagada sai da conta", async () => {
    const goal = await createGoal({ title: "X" });
    const task = await createTask({ title: "A", goalId: goal.id });
    await app.call("DELETE", `/tasks/${task.id}`, { cookies });
    expect((await listGoals())[0]).toMatchObject({ tasksTotal: 0 });
  });

  it("GET /goals/:id devolve a meta e as tarefas, abertas primeiro", async () => {
    const goal = await createGoal({ title: "X" });
    const first = await createTask({ title: "Feita", goalId: goal.id });
    await createTask({ title: "Aberta", goalId: goal.id });
    await createTask({ title: "Outra meta" });
    await done(first.id, true);
    const res = await app.call("GET", `/goals/${goal.id}`, { cookies });
    const body = res.body as { goal: GoalJson; tasks: TaskJson[] };
    expect(body.tasks.map((t) => t.title)).toEqual(["Aberta", "Feita"]);
  });

  it("liga, troca e desliga pela edição da tarefa", async () => {
    const a = await createGoal({ title: "A" });
    const b = await createGoal({ title: "B" });
    const task = await createTask({ title: "T" });
    const link = await app.call("PATCH", `/tasks/${task.id}`, { cookies, body: { goalId: a.id } });
    expect((link.body as { task: TaskJson }).task.goalTitle).toBe("A");
    const swap = await app.call("PATCH", `/tasks/${task.id}`, { cookies, body: { goalId: b.id } });
    expect((swap.body as { task: TaskJson }).task.goalTitle).toBe("B");
    const unlink = await app.call("PATCH", `/tasks/${task.id}`, { cookies, body: { goalId: null } });
    expect((unlink.body as { task: TaskJson }).task.goalId).toBeNull();
  });

  it("editar outro campo não desliga a meta", async () => {
    const goal = await createGoal({ title: "A" });
    const task = await createTask({ title: "T", goalId: goal.id });
    const res = await app.call("PATCH", `/tasks/${task.id}`, { cookies, body: { title: "T2" } });
    expect((res.body as { task: TaskJson }).task.goalId).toBe(goal.id);
  });

  it("meta inexistente ou apagada dá 404; subtarefa não liga", async () => {
    const goal = await createGoal({ title: "A" });
    const ghost = "00000000-0000-4000-8000-000000000000";
    expect((await app.call("POST", "/tasks", { cookies, body: { title: "T", goalId: ghost } })).status).toBe(404);
    const parent = await createTask({ title: "P" });
    expect((await app.call("POST", "/tasks", { cookies, body: { title: "S", parentId: parent.id, goalId: goal.id } })).status).toBe(400);
    const sub = await createTask({ title: "S", parentId: parent.id });
    expect((await app.call("PATCH", `/tasks/${sub.id}`, { cookies, body: { goalId: goal.id } })).status).toBe(400);
    await app.call("DELETE", `/goals/${goal.id}`, { cookies });
    expect((await app.call("PATCH", `/tasks/${parent.id}`, { cookies, body: { goalId: goal.id } })).status).toBe(404);
    expect((await app.call("POST", "/tasks", { cookies, body: { title: "T", goalId: "x" } })).status).toBe(400);
  });

  it("apagar a meta solta as tarefas na listagem e restaurar religa", async () => {
    const goal = await createGoal({ title: "A" });
    const task = await createTask({ title: "T", goalId: goal.id });
    await app.call("DELETE", `/goals/${goal.id}`, { cookies });
    const query = { from: "2026-11-16", to: "2026-11-22", today: "2026-11-18" };
    const loose = (await app.call("GET", "/tasks", { cookies, query })).body as { undated: TaskJson[] };
    expect(loose.undated[0]).toMatchObject({ id: task.id, goalId: null, goalTitle: null });
    await app.call("POST", `/goals/${goal.id}/restore`, { cookies });
    const back = (await app.call("GET", "/tasks", { cookies, query })).body as { undated: TaskJson[] };
    expect(back.undated[0]!.goalTitle).toBe("A");
  });
});
