import { parseDatabaseProps, type DatabaseProps, type DatabaseRow, type PropertyDef } from "@asa/core";
import { describe, expect, it } from "vitest";
import {
  addProperty,
  addView,
  cellValue,
  groupRows,
  keyAfterAll,
  keyBetween,
  NO_GROUP,
  removeProperty,
  removeView,
  sortRows,
  updateProperty,
} from "../src/db-model.js";

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

const base = (): DatabaseProps => ({
  schema: { properties: [status, due] },
  views: [
    { id: "v_t", name: "Tabela", type: "table", columns: [{ key: "title" }, { key: "p_status" }, { key: "p_due" }], sort: [{ key: "p_status", direction: "asc" }] },
    { id: "v_k", name: "Quadro", type: "kanban", groupBy: "p_status", sort: [] },
  ],
});

const row = (id: string, props: Record<string, unknown>, extra: Partial<DatabaseRow> = {}): DatabaseRow => ({
  id,
  title: id,
  props,
  sortKey: null,
  rev: 1,
  createdAt: "2026-11-04T10:00:00.000Z",
  updatedAt: "2026-11-04T10:00:00.000Z",
  ...extra,
});

const stillValid = (props: DatabaseProps) => expect(parseDatabaseProps(props)).not.toBeNull();

describe("schema edits keep views consistent", () => {
  it("adds a property and shows it in table views", () => {
    const { props, key } = addProperty(base(), "multi_select");
    stillValid(props);
    expect(props.schema.properties.at(-1)).toMatchObject({ key, type: "multi_select", options: [] });
    expect(props.views[0]?.type === "table" && props.views[0].columns.at(-1)).toEqual({ key });
  });

  it("removing a property drops its columns, sorts and kanban grouping", () => {
    const props = removeProperty(base(), "p_status");
    stillValid(props);
    expect(props.views[0]).toMatchObject({ columns: [{ key: "title" }, { key: "p_due" }], sort: [] });
    expect(props.views[1]).toMatchObject({ groupBy: null });
  });

  it("changing a select to text clears options and kanban grouping but keeps the column", () => {
    const props = updateProperty(base(), "p_status", { type: "text" });
    stillValid(props);
    expect(props.schema.properties[0]).toEqual({ key: "p_status", name: "Status", type: "text" });
    expect(props.views[1]).toMatchObject({ groupBy: null });
    expect(props.views[0]).toMatchObject({ columns: [{ key: "title" }, { key: "p_status" }, { key: "p_due" }] });
  });

  it("changing to a select type starts with no options", () => {
    const props = updateProperty(base(), "p_due", { type: "select" });
    stillValid(props);
    expect(props.schema.properties[1]).toMatchObject({ type: "select", options: [] });
  });

  it("renames without touching anything else", () => {
    const props = updateProperty(base(), "p_due", { name: "Entrega" });
    expect(props.schema.properties[1]).toEqual({ ...due, name: "Entrega" });
    expect(props.views).toEqual(base().views);
  });

  it("adds a kanban view grouped by the first select, and never removes the last view", () => {
    const { props, viewId } = addView(base(), "kanban");
    stillValid(props);
    expect(props.views.at(-1)).toMatchObject({ id: viewId, type: "kanban", groupBy: "p_status" });
    const single: DatabaseProps = { ...base(), views: [base().views[0]!] };
    expect(removeView(single, "v_t")).toBe(single);
    expect(removeView(base(), "v_k").views.map((v) => v.id)).toEqual(["v_t"]);
  });
});

describe("cellValue", () => {
  it("hides invalid values and unknown options", () => {
    expect(cellValue(status, "o_todo")).toBe("o_todo");
    expect(cellValue(status, "o_gone")).toBeNull();
    expect(cellValue(due, "amanhã")).toBeNull();
    expect(cellValue(due, undefined)).toBeNull();
    const tags: PropertyDef = { key: "t", name: "t", type: "multi_select", options: [{ id: "a", name: "a", color: "red" }] };
    expect(cellValue(tags, ["a", "gone"])).toEqual(["a"]);
    expect(cellValue(tags, ["gone"])).toBeNull();
  });
});

describe("sortRows", () => {
  const schema = base().schema;

  it("falls back to manual order (sort key, then creation)", () => {
    const rows = [row("c", {}), row("b", {}, { sortKey: "a1" }), row("a", {}, { sortKey: "a0" })];
    expect(sortRows(rows, [], schema).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts selects by option order with empty values last in both directions", () => {
    const rows = [row("none", {}), row("done", { p_status: "o_done" }), row("todo", { p_status: "o_todo" })];
    expect(sortRows(rows, [{ key: "p_status", direction: "asc" }], schema).map((r) => r.id)).toEqual(["todo", "done", "none"]);
    expect(sortRows(rows, [{ key: "p_status", direction: "desc" }], schema).map((r) => r.id)).toEqual(["done", "todo", "none"]);
  });

  it("sorts titles with Portuguese collation and numbers naturally", () => {
    const rows = [row("Ábaco", {}), row("abelha", {}), row("item 10", {}), row("item 2", {})];
    expect(sortRows(rows, [{ key: "title", direction: "asc" }], schema).map((r) => r.id)).toEqual([
      "Ábaco",
      "abelha",
      "item 2",
      "item 10",
    ]);
  });

  it("sorts dates", () => {
    const rows = [row("late", { p_due: "2026-12-01" }), row("early", { p_due: "2026-01-01" })];
    expect(sortRows(rows, [{ key: "p_due", direction: "asc" }], schema).map((r) => r.id)).toEqual(["early", "late"]);
  });
});

describe("sort keys", () => {
  it("generates keys in order", () => {
    const first = keyBetween(null, null);
    const second = keyBetween(first, null);
    const middle = keyBetween(first, second);
    expect([first, middle, second]).toEqual([first, middle, second].sort());
    expect(new Set([first, middle, second]).size).toBe(3);
  });

  it("recovers from keys in the wrong order or foreign formats", () => {
    expect(() => keyBetween("b0", "a0")).not.toThrow();
    expect(() => keyBetween("Zz!", null)).not.toThrow();
  });

  it("appends after the greatest existing key", () => {
    const rows = [row("a", {}, { sortKey: "a0" }), row("b", {}, { sortKey: "a3" }), row("c", {})];
    expect(keyAfterAll(rows) > "a3").toBe(true);
    expect(keyAfterAll([])).toMatch(/^[0-9A-Za-z]+$/);
  });
});

describe("groupRows", () => {
  it("creates a group per option plus one for rows without a valid value", () => {
    const groups = groupRows([row("a", { p_status: "o_done" }), row("b", {}), row("c", { p_status: "o_gone" })], status);
    expect([...groups.keys()]).toEqual([NO_GROUP, "o_todo", "o_done"]);
    expect(groups.get("o_done")!.map((r) => r.id)).toEqual(["a"]);
    expect(groups.get(NO_GROUP)!.map((r) => r.id)).toEqual(["b", "c"]);
  });
});
