import { beforeEach, describe, expect, it } from "vitest";
import type { ChangeFeed, DatabaseProps, DatabaseRow, Page, PropertyDef, TreeNode } from "@asa/core";
import { createApp } from "./helpers.js";

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

describe("databases", () => {
  let app: ReturnType<typeof createApp>;
  let cookies: Record<string, string>;

  const post = (path: string, body?: unknown) => app.call("POST", path, { cookies, body });
  const patch = (id: string, body: unknown) => app.call("PATCH", `/pages/${id}`, { cookies, body });
  const rows = async (id: string) =>
    ((await app.call("GET", `/databases/${id}/rows`, { cookies })).body as { rows: DatabaseRow[] }).rows;

  async function createDatabase(): Promise<Page> {
    const res = await post("/pages", { kind: "database", title: "Tarefas" });
    expect(res.status).toBe(201);
    const db = res.body as Page;
    const props: DatabaseProps = {
      schema: { properties: [status, due] },
      views: [
        { id: "v_table", name: "Tabela", type: "table", columns: [{ key: "title" }, { key: "p_status" }], sort: [] },
        { id: "v_board", name: "Quadro", type: "kanban", groupBy: "p_status", sort: [] },
      ],
    };
    const updated = await patch(db.id, { baseRev: db.rev, props });
    expect(updated.status).toBe(200);
    return updated.body as Page;
  }

  async function createRow(databaseId: string, extra: Record<string, unknown> = {}): Promise<Page> {
    const res = await post("/pages", { databaseId, title: "linha", ...extra });
    expect(res.status).toBe(201);
    return res.body as Page;
  }

  beforeEach(async () => {
    app = createApp();
    cookies = await app.ownerCookies();
  });

  describe("database pages", () => {
    it("start with an empty schema and a table view", async () => {
      const res = await post("/pages", { kind: "database" });
      const db = res.body as Page;
      expect(db.kind).toBe("database");
      expect(db.props).toEqual({
        schema: { properties: [] },
        views: [{ id: "v_table", name: "Tabela", type: "table", columns: [{ key: "title" }], sort: [] }],
      });
    });

    it("reject invalid props on creation", async () => {
      const res = await post("/pages", { kind: "database", props: { schema: { properties: [] }, views: [] } });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "invalid_database_props" });
    });

    it("validate schema changes", async () => {
      const db = await createDatabase();
      const badKanban = await patch(db.id, {
        baseRev: db.rev,
        props: { views: [{ id: "v_board", name: "Quadro", type: "kanban", groupBy: "p_due" }] },
      });
      expect(badKanban.status).toBe(400);
      const unknownKey = await patch(db.id, { baseRev: db.rev, props: { extra: 1 } });
      expect(unknownKey.status).toBe(400);
    });

    it("use baseRev for schema changes too", async () => {
      const db = await createDatabase();
      await patch(db.id, { baseRev: db.rev, title: "x" });
      const stale = await patch(db.id, { baseRev: db.rev, props: { schema: { properties: [] } } });
      expect(stale.status).toBe(409);
    });

    it("appear in the tree while their rows do not", async () => {
      const db = await createDatabase();
      await createRow(db.id);
      const tree = ((await app.call("GET", "/tree", { cookies })).body as { pages: TreeNode[] }).pages;
      expect(tree.map((n) => [n.id, n.kind])).toEqual([[db.id, "database"]]);
    });
  });

  describe("rows", () => {
    it("are created with validated props", async () => {
      const db = await createDatabase();
      const row = await createRow(db.id, { props: { p_status: "o_todo", p_due: "2026-11-30" } });
      expect(row).toMatchObject({ databaseId: db.id, parentId: null, props: { p_status: "o_todo", p_due: "2026-11-30" } });
    });

    it.each([
      ["an unknown property", { props: { p_nope: "x" } }, { error: "invalid_props", key: "p_nope" }],
      ["an invalid date", { props: { p_due: "30/11/2026" } }, { error: "invalid_props", key: "p_due" }],
      ["a parent", { parentId: "00000000-0000-0000-0000-000000000000" }, null],
      ["kind database", { kind: "database" }, { error: "invalid_row" }],
      ["a bad sort key", { sortKey: "a b" }, { error: "invalid_sort_key" }],
    ])("reject %s", async (_label, extra, error) => {
      const db = await createDatabase();
      const res = await post("/pages", { databaseId: db.id, ...extra });
      expect(res.status).toBe(400);
      if (error) expect(res.body).toEqual(error);
    });

    it("need an existing database", async () => {
      const page = (await post("/pages", { title: "normal" })).body as Page;
      expect((await post("/pages", { databaseId: page.id })).status).toBe(400);
      expect((await post("/pages", { databaseId: "00000000-0000-0000-0000-000000000000" })).status).toBe(400);
      expect((await post("/pages", { databaseId: "nope" })).status).toBe(400);
    });

    it("are listed by sort key, then creation, without bodies", async () => {
      const db = await createDatabase();
      const a = await createRow(db.id, { title: "a", sortKey: "a1" });
      const b = await createRow(db.id, { title: "b", sortKey: "a0" });
      const c = await createRow(db.id, { title: "c", body: { type: "doc", content: [] } });
      const listed = await rows(db.id);
      expect(listed.map((r) => r.id)).toEqual([b.id, a.id, c.id]);
      expect(listed[0]).not.toHaveProperty("body");
    });

    it("listing 404s for something that is not a database", async () => {
      const page = (await post("/pages", { title: "normal" })).body as Page;
      expect((await app.call("GET", `/databases/${page.id}/rows`, { cookies })).status).toBe(404);
    });

    it("merge and validate prop edits", async () => {
      const db = await createDatabase();
      const row = await createRow(db.id, { props: { p_status: "o_todo", p_due: "2026-11-30" } });
      const edited = await patch(row.id, { baseRev: row.rev, props: { p_status: "o_done", p_due: null } });
      expect((edited.body as Page).props).toEqual({ p_status: "o_done" });
      const bad = await patch(row.id, { baseRev: (edited.body as Page).rev, props: { p_status: 3 } });
      expect(bad.status).toBe(400);
      expect(bad.body).toEqual({ error: "invalid_props", key: "p_status" });
    });

    it("drop values of deleted properties on the next edit", async () => {
      const db = await createDatabase();
      const row = await createRow(db.id, { props: { p_status: "o_todo", p_due: "2026-11-30" } });
      const dbProps = db.props as unknown as DatabaseProps;
      const withoutDue = await patch(db.id, {
        baseRev: db.rev,
        props: { schema: { properties: [status] }, views: dbProps.views },
      });
      expect(withoutDue.status).toBe(200);
      const edited = await patch(row.id, { baseRev: row.rev, title: "x", props: {} });
      expect((edited.body as Page).props).toEqual({ p_status: "o_todo" });
    });

    it("update and clear their sort key", async () => {
      const db = await createDatabase();
      const row = await createRow(db.id, { sortKey: "a0" });
      const moved = (await patch(row.id, { baseRev: row.rev, sortKey: "Zz" })).body as Page;
      expect(moved.sortKey).toBe("Zz");
      const cleared = (await patch(row.id, { baseRev: moved.rev, sortKey: null })).body as Page;
      expect(cleared.sortKey).toBeNull();
      expect((await patch(row.id, { baseRev: cleared.rev, sortKey: "" })).status).toBe(400);
    });

    it("cannot be moved under a parent", async () => {
      const db = await createDatabase();
      const row = await createRow(db.id);
      const other = (await post("/pages", { title: "outra" })).body as Page;
      expect((await patch(row.id, { baseRev: row.rev, parentId: other.id })).status).toBe(400);
    });

    it("are deleted together with their database", async () => {
      const db = await createDatabase();
      const row = await createRow(db.id);
      expect((await app.call("DELETE", `/pages/${db.id}`, { cookies })).status).toBe(200);
      expect((await app.call("GET", `/pages/${row.id}`, { cookies })).status).toBe(404);
      const feed = (await app.call("GET", "/changes", { cookies })).body as ChangeFeed;
      expect(feed.pages.find((p) => p.id === row.id)?.deletedAt).not.toBeNull();
    });

    it("leave props of normal pages free-form", async () => {
      const page = (await post("/pages", { props: { anything: [1, 2] } })).body as Page;
      const edited = await patch(page.id, { baseRev: page.rev, props: { other: true } });
      expect((edited.body as Page).props).toEqual({ anything: [1, 2], other: true });
    });
  });
});
