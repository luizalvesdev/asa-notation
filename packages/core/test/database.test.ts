import { describe, expect, it } from "vitest";
import {
  applyRowProps,
  defaultDatabaseProps,
  isValidCellValue,
  parseDatabaseProps,
  type DatabaseSchema,
  type PropertyDef,
} from "../src/database.js";

const status: PropertyDef = {
  key: "p_status",
  name: "Status",
  type: "select",
  options: [
    { id: "o_todo", name: "A fazer", color: "gray" },
    { id: "o_done", name: "Feito", color: "green" },
  ],
};
const due: PropertyDef = { key: "p_due", name: "Prazo", type: "date" };

const valid = () => ({
  schema: { properties: [status, due] },
  views: [
    { id: "v_1", name: "Tabela", type: "table", columns: [{ key: "title", width: 280 }, { key: "p_status" }], sort: [{ key: "p_due", direction: "asc" }] },
    { id: "v_2", name: "Quadro", type: "kanban", groupBy: "p_status", sort: [] },
  ],
});

describe("parseDatabaseProps", () => {
  it("accepts the default props", () => {
    expect(parseDatabaseProps(defaultDatabaseProps())).toEqual(defaultDatabaseProps());
  });

  it("accepts a full schema with table and kanban views", () => {
    expect(parseDatabaseProps(valid())).toEqual(valid());
  });

  it("fills in missing sort and kanban groupBy", () => {
    const parsed = parseDatabaseProps({
      schema: { properties: [] },
      views: [{ id: "v_1", name: "K", type: "kanban" }, { id: "v_2", name: "T", type: "table", columns: [] }],
    });
    expect(parsed?.views).toEqual([
      { id: "v_1", name: "K", type: "kanban", groupBy: null, sort: [] },
      { id: "v_2", name: "T", type: "table", columns: [], sort: [] },
    ]);
  });

  const broken: [string, (p: ReturnType<typeof valid>) => unknown][] = [
    ["extra top-level keys", (p) => ({ ...p, other: 1 })],
    ["no views", (p) => ({ ...p, views: [] })],
    ["duplicate property keys", (p) => ({ ...p, schema: { properties: [status, { ...due, key: "p_status" }] } })],
    ["a property named title", (p) => ({ ...p, schema: { properties: [{ ...due, key: "title" }] } })],
    ["an unknown property type", (p) => ({ ...p, schema: { properties: [{ ...due, type: "formula" }] } })],
    ["an invalid key", (p) => ({ ...p, schema: { properties: [{ ...due, key: "Bad Key" }] } })],
    ["an empty name", (p) => ({ ...p, schema: { properties: [{ ...due, name: "  " }] } })],
    ["options on a non-select", (p) => ({ ...p, schema: { properties: [{ ...due, options: [] }] } })],
    ["duplicate option ids", (p) => ({ ...p, schema: { properties: [{ ...status, options: [status.options![0], status.options![0]] }] } })],
    ["an unknown color", (p) => ({ ...p, schema: { properties: [{ ...status, options: [{ id: "o", name: "x", color: "neon" }] }] } })],
    ["a column for a missing property", (p) => ({ ...p, views: [{ ...p.views[0], columns: [{ key: "p_gone" }] }] })],
    ["duplicate columns", (p) => ({ ...p, views: [{ ...p.views[0], columns: [{ key: "title" }, { key: "title" }] }] })],
    ["a column width out of range", (p) => ({ ...p, views: [{ ...p.views[0], columns: [{ key: "title", width: 10 }] }] })],
    ["sorting by a missing property", (p) => ({ ...p, views: [{ ...p.views[0], sort: [{ key: "p_gone", direction: "asc" }] }] })],
    ["a bad sort direction", (p) => ({ ...p, views: [{ ...p.views[0], sort: [{ key: "title", direction: "up" }] }] })],
    ["kanban grouped by a non-select", (p) => ({ ...p, views: [{ ...p.views[1], groupBy: "p_due" }] })],
    ["duplicate view ids", (p) => ({ ...p, views: [p.views[0], p.views[0]] })],
    ["an unknown view type", (p) => ({ ...p, views: [{ ...p.views[0], type: "calendar" }] })],
  ];

  it.each(broken)("rejects %s", (_label, mutate) => {
    expect(parseDatabaseProps(mutate(valid()))).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(parseDatabaseProps(null)).toBeNull();
    expect(parseDatabaseProps([])).toBeNull();
    expect(parseDatabaseProps("x")).toBeNull();
  });
});

describe("isValidCellValue", () => {
  const cases: [PropertyDef["type"], unknown, boolean][] = [
    ["text", "olá", true],
    ["text", "x".repeat(2001), false],
    ["text", 3, false],
    ["number", 3.5, true],
    ["number", Number.NaN, false],
    ["number", Number.POSITIVE_INFINITY, false],
    ["number", "3", false],
    ["checkbox", true, true],
    ["checkbox", "true", false],
    ["date", "2026-02-28", true],
    ["date", "2026-02-30", false],
    ["date", "2026-2-3", false],
    ["url", "https://example.com/a?b=c", true],
    ["url", "javascript:alert(1)", false],
    ["url", "ftp://x", false],
    ["select", "o_todo", true],
    ["select", "Bad Id", false],
    ["multi_select", ["a", "b"], true],
    ["multi_select", ["a", "a"], false],
    ["multi_select", "a", false],
  ];

  it.each(cases)("%s %j → %s", (type, value, expected) => {
    expect(isValidCellValue({ key: "k", name: "n", type }, value)).toBe(expected);
  });

  it("accepts null for every type", () => {
    for (const type of ["text", "number", "checkbox", "date", "url", "select", "multi_select"] as const) {
      expect(isValidCellValue({ key: "k", name: "n", type }, null)).toBe(true);
    }
  });
});

describe("applyRowProps", () => {
  const schema: DatabaseSchema = { properties: [status, due] };

  it("merges valid values and removes nulls", () => {
    const result = applyRowProps(schema, { p_status: "o_todo", p_due: "2026-01-01" }, { p_due: null, p_status: "o_done" });
    expect(result).toEqual({ ok: true, props: { p_status: "o_done" } });
  });

  it("drops values of properties that no longer exist", () => {
    const result = applyRowProps(schema, { p_gone: "x", p_status: "o_todo" }, {});
    expect(result).toEqual({ ok: true, props: { p_status: "o_todo" } });
  });

  it("rejects unknown keys and invalid values, naming the key", () => {
    expect(applyRowProps(schema, {}, { p_gone: "x" })).toEqual({ ok: false, key: "p_gone" });
    expect(applyRowProps(schema, {}, { p_due: "amanhã" })).toEqual({ ok: false, key: "p_due" });
  });
});
