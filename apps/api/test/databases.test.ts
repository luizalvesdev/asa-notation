import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, doc, type TestApp } from "./helpers.js";

let app: TestApp;
let cookies: Record<string, string>;

beforeEach(async () => {
  app = await createTestApp();
  cookies = await app.owner();
});

const call = (method: string, path: string, body?: unknown) => app.call(method, path, { cookies, body });

interface PageJson {
  id: string;
  kind: string;
  parentId: string | null;
  title: string;
  props: Record<string, unknown>;
  schema: { properties: { id: string; type: string; options: { id: string }[] }[]; views: { id: string }[] } | null;
}

async function createDb(title = "Tarefas"): Promise<PageJson> {
  const res = await call("POST", "/pages", { kind: "database", title });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { page: PageJson }).page;
}
async function createRow(dbId: string, title: string, props: Record<string, unknown> = {}): Promise<PageJson> {
  app.clock.ms += 1000; // linhas ordenam pela criação: cada uma num instante diferente
  const res = await call("POST", "/pages", { kind: "row", parentId: dbId, title, props });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { page: PageJson }).page;
}
const rows = async (dbId: string) => ((await call("GET", `/databases/${dbId}/rows`)).body as { rows: { id: string; title: string; props: Record<string, unknown> }[] }).rows;
const treeTitles = async () => ((await call("GET", "/pages/tree")).body as { pages: { title: string; kind: string }[] }).pages.map((p) => p.title);

describe("criar database", () => {
  it("nasce com Status e Data, e as views Tabela e Kanban", async () => {
    const db = await createDb();
    expect(db.kind).toBe("database");
    expect(db.schema!.properties.map((p) => [p.id, p.type])).toEqual([["status", "status"], ["data", "date"]]);
    expect(db.schema!.views.map((v) => v.id)).toEqual(["tabela", "kanban"]);
  });

  it("aceita um esquema próprio e recusa um inválido", async () => {
    const ok = await call("POST", "/pages", { kind: "database", title: "Livros", schema: { properties: [{ id: "nota", name: "Nota", type: "number" }], views: [{ id: "t", name: "Tabela", type: "table" }] } });
    expect(ok.status).toBe(201);
    const bad = await call("POST", "/pages", { kind: "database", title: "X", schema: { properties: [], views: [] } });
    expect(bad.status).toBe(400);
  });

  it("recusa tipo desconhecido e esquema em página comum", async () => {
    expect((await call("POST", "/pages", { kind: "nada" })).status).toBe(400);
    expect((await call("POST", "/pages", { title: "x", schema: {} })).status).toBe(400);
    expect((await call("POST", "/pages", { title: "x", props: {} })).status).toBe(400);
  });
});

describe("linhas", () => {
  it("criam, listam na ordem e não aparecem na árvore", async () => {
    const db = await createDb();
    await createRow(db.id, "Primeira", { status: "todo" });
    await createRow(db.id, "Segunda");
    expect((await rows(db.id)).map((r) => r.title)).toEqual(["Primeira", "Segunda"]);
    expect(await treeTitles()).toEqual(["Tarefas"]);
  });

  it("linha só nasce dentro de uma database", async () => {
    expect((await call("POST", "/pages", { kind: "row", title: "solta" })).status).toBe(400);
    const page = ((await call("POST", "/pages", { title: "comum" })).body as { page: PageJson }).page;
    expect((await call("POST", "/pages", { kind: "row", parentId: page.id, title: "x" })).status).toBe(400);
    expect((await call("POST", "/pages", { kind: "row", parentId: "00000000-0000-4000-8000-000000000000", title: "x" })).status).toBe(404);
  });

  it("linha não tem filhas", async () => {
    const db = await createDb();
    const row = await createRow(db.id, "L");
    expect((await call("POST", "/pages", { title: "filha", parentId: row.id })).status).toBe(400);
  });

  it("propriedades são validadas pelo esquema ao criar e ao editar", async () => {
    const db = await createDb();
    expect((await call("POST", "/pages", { kind: "row", parentId: db.id, title: "x", props: { status: "nada" } })).status).toBe(400);
    expect((await call("POST", "/pages", { kind: "row", parentId: db.id, title: "x", props: { inexistente: 1 } })).status).toBe(400);
    const row = await createRow(db.id, "L", { status: "todo", data: "2026-11-18" });
    expect((await call("PATCH", `/pages/${row.id}`, { props: { data: "18/11" } })).status).toBe(400);
    expect((await call("PATCH", `/pages/${row.id}`, { props: { status: "invalido" } })).status).toBe(400);
  });

  it("editar mescla os valores e null apaga", async () => {
    const db = await createDb();
    const row = await createRow(db.id, "L", { status: "todo", data: "2026-11-18" });
    const res = await call("PATCH", `/pages/${row.id}`, { props: { status: "done" } });
    expect((res.body as { page: PageJson }).page.props).toEqual({ status: "done", data: "2026-11-18" });
    const cleared = await call("PATCH", `/pages/${row.id}`, { props: { data: null } });
    expect((cleared.body as { page: PageJson }).page.props).toEqual({ status: "done" });
  });

  it("props só em linhas e esquema só em databases", async () => {
    const db = await createDb();
    const page = ((await call("POST", "/pages", { title: "comum" })).body as { page: PageJson }).page;
    expect((await call("PATCH", `/pages/${page.id}`, { props: { a: 1 } })).status).toBe(400);
    expect((await call("PATCH", `/pages/${page.id}`, { schema: db.schema })).status).toBe(400);
    const row = await createRow(db.id, "L");
    expect((await call("PATCH", `/pages/${row.id}`, { schema: db.schema })).status).toBe(400);
  });

  it("a linha é uma página: tem corpo e título editáveis", async () => {
    const db = await createDb();
    const row = await createRow(db.id, "L");
    const res = await call("PATCH", `/pages/${row.id}`, { title: "Novo título", body: doc("detalhes") });
    expect((res.body as { page: PageJson }).page.title).toBe("Novo título");
    expect(((await call("GET", `/pages/${row.id}`)).body as { page: { body: unknown } }).page.body).toEqual(doc("detalhes"));
  });

  it("não se move uma linha", async () => {
    const db = await createDb();
    const row = await createRow(db.id, "L");
    const res = await call("POST", `/pages/${row.id}/move`, { parentId: null });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "row_locked" });
  });

  it("listar linhas de algo que não é database dá 404", async () => {
    const page = ((await call("POST", "/pages", { title: "comum" })).body as { page: PageJson }).page;
    expect((await call("GET", `/databases/${page.id}/rows`)).status).toBe(404);
    expect((await app.call("GET", `/databases/${page.id}/rows`)).status).toBe(401);
  });
});

describe("esquema", () => {
  it("mudar o esquema vale para as próximas edições", async () => {
    const db = await createDb();
    const row = await createRow(db.id, "L");
    const schema = JSON.parse(JSON.stringify(db.schema));
    schema.properties.push({ id: "nota", name: "Nota", type: "number" });
    expect((await call("PATCH", `/pages/${db.id}`, { schema })).status).toBe(200);
    const res = await call("PATCH", `/pages/${row.id}`, { props: { nota: 9 } });
    expect((res.body as { page: PageJson }).page.props).toEqual({ nota: 9 });
  });

  it("esquema inválido não é salvo", async () => {
    const db = await createDb();
    expect((await call("PATCH", `/pages/${db.id}`, { schema: { properties: [], views: [] } })).status).toBe(400);
    expect(((await call("GET", `/pages/${db.id}`)).body as { page: PageJson }).page.schema).toEqual(db.schema);
  });

  it("valor que a nova opção não aceita mais é recusado, mas o que já está salvo continua lá", async () => {
    const db = await createDb();
    const row = await createRow(db.id, "L", { status: "doing" });
    const schema = JSON.parse(JSON.stringify(db.schema));
    schema.properties[0].options = schema.properties[0].options.filter((o: { id: string }) => o.id !== "doing");
    await call("PATCH", `/pages/${db.id}`, { schema });
    expect((await rows(db.id))[0]!.props).toEqual({ status: "doing" });
    expect((await call("PATCH", `/pages/${row.id}`, { props: { status: "doing" } })).status).toBe(400);
  });
});

describe("lixeira", () => {
  it("apagar a database leva as linhas; restaurar traz tudo", async () => {
    const db = await createDb();
    await createRow(db.id, "A");
    await createRow(db.id, "B");
    await call("DELETE", `/pages/${db.id}`);
    expect(await treeTitles()).toEqual([]);
    const trash = ((await call("GET", "/pages/trash")).body as { items: { id: string }[] }).items;
    expect(trash.map((t) => t.id)).toEqual([db.id]);
    await call("POST", `/pages/${db.id}/restore`);
    expect((await rows(db.id)).map((r) => r.title)).toEqual(["A", "B"]);
  });

  it("apagar uma linha a manda para a lixeira, e restaurar a devolve à database", async () => {
    const db = await createDb();
    const row = await createRow(db.id, "A");
    await call("DELETE", `/pages/${row.id}`);
    expect(await rows(db.id)).toEqual([]);
    await call("POST", `/pages/${row.id}/restore`);
    expect((await rows(db.id)).map((r) => r.title)).toEqual(["A"]);
  });

  it("restaurar linha cuja database está na lixeira mantém a linha com a database", async () => {
    const db = await createDb();
    const row = await createRow(db.id, "A");
    await call("DELETE", `/pages/${row.id}`);
    app.clock.ms += 1000;
    await call("DELETE", `/pages/${db.id}`);
    await call("POST", `/pages/${row.id}/restore`);
    expect((await app.db.query("select parent_id from pages where id = $1", [row.id])).rows[0]).toEqual({ parent_id: db.id });
  });
});

describe("tarefas e busca continuam como antes", () => {
  it("linhas aparecem na busca por título", async () => {
    const db = await createDb();
    await createRow(db.id, "Comprar pão integral");
    const res = await app.call("GET", "/pages/search", { cookies, query: { q: "pao" } });
    expect((res.body as { hits: { title: string }[] }).hits.map((h) => h.title)).toContain("Comprar pão integral");
  });
});
