import { describe, expect, it } from "vitest";
import { applyFilters, calendarWeeks, groupRows, newId, newProperty, newView, removeProperty, rowsByDate, sortRows, valueText, viewRows } from "../src/db-logic";
import type { Property, Row, Schema } from "../src/db-types";

const opt = (id: string, name: string, group: "todo" | "doing" | "done" | null = null) => ({ id, name, color: null, group });
const status: Property = { id: "status", name: "Status", type: "status", relationDb: null, options: [opt("todo", "A fazer", "todo"), opt("doing", "Em andamento", "doing"), opt("done", "Concluído", "done")] };
const nota: Property = { id: "nota", name: "Nota", type: "number", options: [], relationDb: null };
const data: Property = { id: "data", name: "Data", type: "date", options: [], relationDb: null };
const tags: Property = { id: "tags", name: "Tags", type: "multiselect", relationDb: null, options: [opt("a", "A"), opt("b", "B")] };
const lido: Property = { id: "lido", name: "Lido", type: "checkbox", options: [], relationDb: null };
const schema: Schema = { properties: [status, nota, data, tags, lido], views: [] };

const row = (id: string, title: string, props: Row["props"] = {}, createdAt = "2026-11-18T12:00:00.000Z"): Row => ({ id, title, icon: null, props, createdAt, updatedAt: createdAt });
const rows = [
  row("1", "Ler Raft", { status: "doing", nota: 5, data: "2026-11-20", tags: ["a"], lido: true }, "2026-11-01T00:00:00.000Z"),
  row("2", "Escrever post", { status: "todo", nota: 3, data: "2026-11-18" }, "2026-11-02T00:00:00.000Z"),
  row("3", "Revisão", { status: "done", tags: ["a", "b"] }, "2026-11-03T00:00:00.000Z"),
  row("4", "Ração do gato", {}, "2026-11-04T00:00:00.000Z"),
];
const ids = (list: Row[]) => list.map((r) => r.id);
const f = (prop: string, op: string, value: string | number | null = null) => ({ prop, op: op as never, value });

describe("filtros", () => {
  it("texto contém, sem acento nem caixa", () => {
    expect(ids(applyFilters(rows, schema, [f("title", "contains", "racao")]))).toEqual(["4"]);
    expect(ids(applyFilters(rows, schema, [f("title", "equals", "ler raft")]))).toEqual(["1"]);
    expect(ids(applyFilters(rows, schema, [f("title", "not_equals", "ler raft")]))).toEqual(["2", "3", "4"]);
  });
  it("select, vazio e não vazio", () => {
    expect(ids(applyFilters(rows, schema, [f("status", "equals", "todo")]))).toEqual(["2"]);
    expect(ids(applyFilters(rows, schema, [f("status", "is_empty")]))).toEqual(["4"]);
    expect(ids(applyFilters(rows, schema, [f("status", "not_empty")]))).toEqual(["1", "2", "3"]);
  });
  it("número", () => {
    expect(ids(applyFilters(rows, schema, [f("nota", "gt", 3)]))).toEqual(["1"]);
    expect(ids(applyFilters(rows, schema, [f("nota", "lt", "5")]))).toEqual(["2"]);
    expect(ids(applyFilters(rows, schema, [f("nota", "equals", 3)]))).toEqual(["2"]);
  });
  it("data", () => {
    expect(ids(applyFilters(rows, schema, [f("data", "before", "2026-11-20")]))).toEqual(["2"]);
    expect(ids(applyFilters(rows, schema, [f("data", "after", "2026-11-18")]))).toEqual(["1"]);
    expect(ids(applyFilters(rows, schema, [f("data", "equals", "2026-11-18")]))).toEqual(["2"]);
  });
  it("multisseleção e caixa de seleção", () => {
    expect(ids(applyFilters(rows, schema, [f("tags", "contains", "b")]))).toEqual(["3"]);
    expect(ids(applyFilters(rows, schema, [f("lido", "checked")]))).toEqual(["1"]);
    expect(ids(applyFilters(rows, schema, [f("lido", "unchecked")]))).toEqual(["2", "3", "4"]);
  });
  it("vários filtros valem juntos", () => {
    expect(ids(applyFilters(rows, schema, [f("tags", "contains", "a"), f("status", "not_equals", "done")]))).toEqual(["1"]);
  });
  it("filtro sem valor é ignorado enquanto se digita", () => {
    expect(applyFilters(rows, schema, [f("title", "contains", "")])).toHaveLength(4);
    expect(applyFilters(rows, schema, [f("nota", "gt", null)])).toHaveLength(4);
  });
});

describe("ordenação", () => {
  it("texto, número e data, com vazios no fim nas duas direções", () => {
    expect(ids(sortRows(rows, schema, [{ prop: "title", dir: "asc" }]))).toEqual(["2", "1", "4", "3"]);
    expect(ids(sortRows(rows, schema, [{ prop: "nota", dir: "asc" }]))).toEqual(["2", "1", "3", "4"]);
    expect(ids(sortRows(rows, schema, [{ prop: "nota", dir: "desc" }]))).toEqual(["1", "2", "3", "4"]);
    expect(ids(sortRows(rows, schema, [{ prop: "data", dir: "asc" }]))).toEqual(["2", "1", "3", "4"]);
  });
  it("select segue a ordem das opções", () => {
    expect(ids(sortRows(rows, schema, [{ prop: "status", dir: "asc" }]))).toEqual(["2", "1", "3", "4"]);
    expect(ids(sortRows(rows, schema, [{ prop: "status", dir: "desc" }]))).toEqual(["3", "1", "2", "4"]);
  });
  it("por criação e em cascata", () => {
    expect(ids(sortRows(rows, schema, [{ prop: "created", dir: "desc" }]))).toEqual(["4", "3", "2", "1"]);
    expect(ids(sortRows(rows, schema, [{ prop: "tags", dir: "desc" }, { prop: "title", dir: "asc" }]))).toEqual(["3", "1", "2", "4"]);
  });
  it("sem ordenação mantém a ordem e não muda a lista original", () => {
    const copy = sortRows(rows, schema, []);
    expect(ids(copy)).toEqual(["1", "2", "3", "4"]);
    expect(copy).not.toBe(rows);
  });
  it("viewRows filtra e depois ordena", () => {
    const view = { id: "v", name: "V", type: "table" as const, filters: [f("status", "not_empty")], sorts: [{ prop: "title", dir: "asc" as const }], groupBy: null, dateProp: null, hidden: [] };
    expect(ids(viewRows(rows, schema, view))).toEqual(["2", "1", "3"]);
  });
});

describe("agrupamento", () => {
  it("segue a ordem das opções e põe os sem valor primeiro", () => {
    const groups = groupRows(rows, status);
    expect(groups.map((g) => [g.key, ids(g.rows)])).toEqual([["", ["4"]], ["todo", ["2"]], ["doing", ["1"]], ["done", ["3"]]]);
  });
  it("sem linhas sem valor, não cria a coluna extra; opção sem linhas continua", () => {
    const groups = groupRows(rows.slice(0, 2), status);
    expect(groups.map((g) => g.key)).toEqual(["todo", "doing", "done"]);
  });
  it("valor de opção que não existe mais cai em Sem valor", () => {
    expect(groupRows([row("x", "X", { status: "apagada" })], status)[0]!.key).toBe("");
  });
});

describe("calendário", () => {
  it("monta as semanas de novembro de 2026 começando na segunda", () => {
    // 1º de novembro de 2026 é domingo: a primeira semana começa em 26/10.
    const weeks = calendarWeeks(2026, 10, 1);
    expect(weeks).toHaveLength(6);
    expect(weeks[0]![0]).toBe("2026-10-26");
    expect(weeks.flat()).toContain("2026-11-18");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]![6]).toBe("2026-11-01");
  });
  it("começando no domingo, novembro cabe em 5 semanas", () => {
    const weeks = calendarWeeks(2026, 10, 0);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]).toBe("2026-11-01");
  });
  it("mês que cruza seis semanas", () => {
    expect(calendarWeeks(2026, 7, 1)).toHaveLength(6); // agosto de 2026 começa num sábado
  });
  it("agrupa linhas por dia", () => {
    const map = rowsByDate(rows, "data");
    expect(ids(map.get("2026-11-20")!)).toEqual(["1"]);
    expect(map.has("2026-11-19")).toBe(false);
  });
});

describe("esquema", () => {
  it("newId tem 8 letras minúsculas e números", () => {
    expect(newId()).toMatch(/^[a-z0-9]{8}$/);
    expect(newId(() => 0)).toBe("00000000");
  });
  it("newProperty de status já traz as três etapas", () => {
    expect(newProperty("status", "Etapa", "etapa").options.map((o) => o.group)).toEqual(["todo", "doing", "done"]);
    expect(newProperty("text", "Nome", "nome").options).toEqual([]);
    expect(newProperty("relation", "Livros", "livros", "db1").relationDb).toBe("db1");
  });
  it("newView escolhe agrupamento e data automaticamente", () => {
    expect(newView("kanban", schema, "k", "Kanban").groupBy).toBe("status");
    expect(newView("calendar", schema, "c", "Cal").dateProp).toBe("data");
    expect(newView("table", schema, "t", "Tab")).toMatchObject({ groupBy: null, dateProp: null });
  });
  it("removeProperty limpa as views", () => {
    const full: Schema = { properties: [status, data], views: [{ id: "v", name: "V", type: "kanban", filters: [f("status", "equals", "todo")], sorts: [{ prop: "status", dir: "asc" }], groupBy: "status", dateProp: "data", hidden: ["status"] }] };
    const out = removeProperty(full, "status");
    expect(out.properties.map((p) => p.id)).toEqual(["data"]);
    expect(out.views[0]).toMatchObject({ filters: [], sorts: [], groupBy: null, dateProp: "data", hidden: [] });
  });
});

describe("valueText", () => {
  it("mostra o nome da opção, a data em pt-BR e as marcações", () => {
    expect(valueText(status, "doing")).toBe("Em andamento");
    expect(valueText(tags, ["a", "b"])).toBe("A, B");
    expect(valueText(data, "2026-11-18")).toBe("18/11/2026");
    expect(valueText(lido, true)).toBe("Sim");
    expect(valueText(nota, 4)).toBe("4");
    expect(valueText(nota, undefined)).toBe("");
  });
});
