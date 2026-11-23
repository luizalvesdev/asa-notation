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

describe("meta ligada a uma página", () => {
  const item = (text: string, checked: boolean) => ({ type: "taskItem", attrs: { checked }, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const doc = (items: unknown[]) => ({ type: "doc", content: [{ type: "taskList", content: items }] });
  const makePage = async (title: string, body: unknown) => {
    const res = await app.call("POST", "/pages", { cookies, body: { title, body } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return (res.body as { page: { id: string } }).page.id;
  };
  type Linked = GoalJson & { page: { id: string; title: string } | null; target: number | null; checked: number; checkboxes: number };
  const get = async (id: string) => ((await app.call("GET", `/goals/${id}`, { cookies })).body as { goal: Linked }).goal;

  it("o progresso vem dos checkboxes marcados; sem alvo, o alvo é o total de caixinhas", async () => {
    const page = await makePage("Carreira", doc([item("a", true), item("b", false), item("c", true)]));
    const goal = (await createGoal({ title: "Terminar a carreira", pageId: page })) as Linked;
    expect(goal.page).toEqual({ id: page, title: "Carreira" });
    expect([goal.checked, goal.checkboxes, goal.target]).toEqual([2, 3, null]);
    await app.call("PATCH", `/pages/${page}`, { cookies, body: { body: doc([item("a", true), item("b", true), item("c", true)]) } });
    expect((await get(goal.id)).checked).toBe(3);
  });

  it("alvo fixo: marcados além do alvo passam de 100% (o excedente é conta do cliente)", async () => {
    const page = await makePage("Livros que li", doc(Array.from({ length: 31 }, (_, i) => item(`livro ${i}`, true))));
    const goal = await createGoal({ title: "Ler 30 livros", pageId: page, target: 30 });
    const read = await get(goal.id);
    expect([read.checked, read.checkboxes, read.target]).toEqual([31, 31, 30]);
  });

  it("uma página liga a uma meta só (1 para 1); desligar libera", async () => {
    const page = await makePage("P", doc([item("x", false)]));
    const first = await createGoal({ title: "A", pageId: page });
    const second = await app.call("POST", "/goals", { cookies, body: { title: "B", pageId: page } });
    expect(second.status).toBe(409);
    const other = await createGoal({ title: "C" });
    expect((await app.call("PATCH", `/goals/${other.id}`, { cookies, body: { pageId: page } })).status).toBe(409);
    expect((await app.call("PATCH", `/goals/${first.id}`, { cookies, body: { pageId: null } })).status).toBe(200);
    expect((await app.call("PATCH", `/goals/${other.id}`, { cookies, body: { pageId: page } })).status).toBe(200);
  });

  it("valida página e alvo", async () => {
    expect((await app.call("POST", "/goals", { cookies, body: { title: "X", pageId: "00000000-0000-4000-8000-000000000000" } })).status).toBe(400);
    expect((await app.call("POST", "/goals", { cookies, body: { title: "X", target: 0 } })).status).toBe(400);
    expect((await app.call("POST", "/goals", { cookies, body: { title: "X", pageId: "nada" } })).status).toBe(400);
  });

  it("página na lixeira deixa de valer: a meta volta a contar tarefas", async () => {
    const page = await makePage("Some", doc([item("x", true)]));
    const goal = await createGoal({ title: "G", pageId: page });
    await app.call("DELETE", `/pages/${page}`, { cookies });
    expect((await get(goal.id)).page).toBeNull();
  });
});

describe("meta ligada a uma carreira: cursos com aulas", () => {
  const clip = async (body: Record<string, unknown>) => app.call("POST", "/clips", { cookies, body });
  const idOf = (res: { body: unknown }) => (res.body as { page: { id: string } }).page.id;

  async function career() {
    const root = await clip({
      url: "https://cursos.alura.com.br/dashboard/career/x",
      title: "Carreira X",
      kind: "course",
      markdown: "## Base\n\n- [ ] [Curso A](https://cursos.alura.com.br/course/a) — desc\n- [ ] [Curso B](https://cursos.alura.com.br/course/b)\n\n## Nível 1\n\n- [ ] [Curso C](https://cursos.alura.com.br/course/c)",
    });
    const rootId = idOf(root);
    const a = await clip({ url: "https://cursos.alura.com.br/course/a?utm=1", title: "Curso A", kind: "lessons", parentId: rootId, markdown: "## Seção 1\n\n2 aulas\n\n- [x] Aula 1\n- [ ] Aula 2\n\n## Seção 2\n\n- [x] Aula 3" });
    const b = await clip({ url: "https://cursos.alura.com.br/course/b", title: "Curso B", kind: "lessons", parentId: rootId, markdown: "## Única\n\n- [ ] Aula 4" });
    return { rootId, aId: idOf(a), bId: idOf(b) };
  }

  it("a meta conta as aulas dos cursos, não os próprios cursos; curso sem página vale 1", async () => {
    const { rootId } = await career();
    const goal = await createGoal({ title: "Terminar a carreira", pageId: rootId });
    const read = ((await app.call("GET", `/goals/${goal.id}`, { cookies })).body as { goal: GoalJson & { checked: number; checkboxes: number } }).goal;
    // A: 3 aulas (2 feitas), B: 1 aula, C: sem página (1 item, não feito) => 2 de 5
    expect([read.checked, read.checkboxes]).toEqual([2, 5]);
  });

  it("detalhe da meta devolve a árvore: grupos, cursos, seções e aulas", async () => {
    const { rootId, aId } = await career();
    const goal = await createGoal({ title: "Terminar a carreira", pageId: rootId });
    type Outline = { title: string | null; done: number; total: number; items: { title: string; pageId: string | null; done: number; total: number; sections: { title: string; done: number; total: number; lessons: { text: string; checked: boolean }[] }[] }[] }[];
    const { outline } = (await app.call("GET", `/goals/${goal.id}`, { cookies })).body as { outline: Outline };
    expect(outline.map((g) => [g.title, g.done, g.total])).toEqual([["Base", 2, 4], ["Nível 1", 0, 1]]);
    const courseA = outline[0]!.items[0]!;
    expect(courseA).toMatchObject({ pageId: aId, done: 2, total: 3 });
    expect(courseA.sections.map((s) => [s.title, s.done, s.total])).toEqual([["Seção 1", 1, 2], ["Seção 2", 1, 1]]);
    expect(courseA.sections[0]!.lessons).toEqual([{ text: "Aula 1", checked: true }, { text: "Aula 2", checked: false }]);
    expect(outline[1]!.items[0]).toMatchObject({ title: "Curso C", pageId: null, done: 0, total: 1 });
  });

  it("salvar o mesmo curso de novo não duplica a página (mesmo endereço, com ou sem query)", async () => {
    const { rootId, aId } = await career();
    const again = await clip({ url: "https://cursos.alura.com.br/course/a", title: "Curso A de novo", kind: "lessons", parentId: rootId, markdown: "## S\n\n- [ ] x" });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ existed: true, page: { id: aId } });
    const tree = ((await app.call("GET", "/pages/tree", { cookies })).body as { pages: { parentId: string | null }[] }).pages;
    expect(tree.filter((p) => p.parentId === rootId)).toHaveLength(2);
  });
});
