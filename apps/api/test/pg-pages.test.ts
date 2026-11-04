import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PgPageStore } from "../src/pg-store.js";

const migration = readFileSync(new URL("../migrations/001_init.sql", import.meta.url), "utf8");

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const input = (title: string, extra: Partial<Parameters<PgPageStore["create"]>[0]> = {}) => ({
  parentId: null,
  kind: "page" as const,
  title,
  body: null,
  bodyText: "",
  props: {},
  ...extra,
});

describe("PgPageStore page operations", () => {
  let db: PGlite;
  let store: PgPageStore;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(migration);
    store = new PgPageStore({
      query: async (text, params) => (await db.query(text, params)).rows as Record<string, unknown>[],
    });
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("delete from pages");
    await db.exec("alter sequence change_seq restart with 1");
  });

  it("creates and reads a page with jsonb body and props", async () => {
    const page = await store.create(input("Olá", { body: doc("mundo"), bodyText: "mundo", props: { a: [1, 2], b: { c: true } } }));
    expect(page).toMatchObject({ title: "Olá", kind: "page", origin: "app", deletedAt: null, rev: 1 });
    expect(page.body).toEqual(doc("mundo"));
    expect(page.props).toEqual({ a: [1, 2], b: { c: true } });
    expect(await store.get(page.id)).toEqual(page);
  });

  it("stores titles with quotes and unicode untouched", async () => {
    const title = `Ação "x" ' ; -- 日本`;
    const page = await store.create(input(title));
    expect((await store.get(page.id))?.title).toBe(title);
  });

  it("returns null for unknown or deleted pages", async () => {
    expect(await store.get("00000000-0000-0000-0000-000000000000")).toBeNull();
    const page = await store.create(input("x"));
    await store.softDelete(page.id);
    expect(await store.get(page.id)).toBeNull();
  });

  it("updates only the given fields and bumps rev", async () => {
    const page = await store.create(input("a", { body: doc("corpo"), bodyText: "corpo", props: { k: 1 } }));
    const result = await store.update(page.id, { title: "b" }, page.rev);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.page).toMatchObject({ title: "b", props: { k: 1 } });
    expect(result.page.body).toEqual(doc("corpo"));
    expect(result.page.rev).toBeGreaterThan(page.rev);
    expect(result.page.createdAt).toBe(page.createdAt);
  });

  it("reports a conflict with the current page when baseRev is stale", async () => {
    const page = await store.create(input("a"));
    await store.update(page.id, { title: "b" }, page.rev);
    const stale = await store.update(page.id, { title: "c" }, page.rev);
    expect(stale.status).toBe("conflict");
    if (stale.status === "conflict") expect(stale.page.title).toBe("b");
  });

  it("reports not_found for unknown and deleted pages", async () => {
    expect((await store.update("00000000-0000-0000-0000-000000000000", { title: "x" }, 1)).status).toBe("not_found");
    const page = await store.create(input("x"));
    await store.softDelete(page.id);
    expect((await store.update(page.id, { title: "y" }, page.rev)).status).toBe("not_found");
  });

  it("sets and clears the body together with its search text", async () => {
    const page = await store.create(input("a"));
    const withBody = await store.update(page.id, { body: doc("zebra"), bodyText: "zebra" }, page.rev);
    if (withBody.status !== "ok") throw new Error("expected ok");
    expect((await store.search("zebra", 10)).map((h) => h.id)).toEqual([page.id]);
    const cleared = await store.update(page.id, { body: null, bodyText: "" }, withBody.page.rev);
    if (cleared.status !== "ok") throw new Error("expected ok");
    expect(cleared.page.body).toBeNull();
    expect(await store.search("zebra", 10)).toEqual([]);
  });

  it("moves a page between parents and to the root", async () => {
    const parent = await store.create(input("pai"));
    const page = await store.create(input("filho"));
    const moved = await store.update(page.id, { parentId: parent.id }, page.rev);
    if (moved.status !== "ok") throw new Error("expected ok");
    expect(moved.page.parentId).toBe(parent.id);
    const root = await store.update(page.id, { parentId: null }, moved.page.rev);
    if (root.status !== "ok") throw new Error("expected ok");
    expect(root.page.parentId).toBeNull();
  });

  it("soft deletes a whole subtree and leaves siblings alone", async () => {
    const a = await store.create(input("a"));
    const b = await store.create(input("b", { parentId: a.id }));
    const c = await store.create(input("c", { parentId: b.id }));
    const other = await store.create(input("other"));

    expect(await store.softDelete(a.id)).toBe(true);
    expect(await store.get(a.id)).toBeNull();
    expect(await store.get(c.id)).toBeNull();
    expect((await store.get(other.id))?.title).toBe("other");

    const feed = await store.changes(0, 100);
    const deleted = feed.pages.filter((p) => p.deletedAt !== null).map((p) => p.id);
    expect(deleted.sort()).toEqual([a.id, b.id, c.id].sort());
    expect(new Set(feed.pages.map((p) => p.rev)).size).toBe(feed.pages.length);
  });

  it("returns false when deleting something that is gone", async () => {
    const page = await store.create(input("x"));
    expect(await store.softDelete(page.id)).toBe(true);
    expect(await store.softDelete(page.id)).toBe(false);
  });

  it("detects descendants at any depth", async () => {
    const a = await store.create(input("a"));
    const b = await store.create(input("b", { parentId: a.id }));
    const c = await store.create(input("c", { parentId: b.id }));
    const other = await store.create(input("other"));
    expect(await store.isDescendant(a.id, c.id)).toBe(true);
    expect(await store.isDescendant(a.id, b.id)).toBe(true);
    expect(await store.isDescendant(c.id, a.id)).toBe(false);
    expect(await store.isDescendant(a.id, other.id)).toBe(false);
    expect(await store.isDescendant(a.id, a.id)).toBe(false);
  });

  it("lists the tree without deleted pages or database rows", async () => {
    const a = await store.create(input("a"));
    const gone = await store.create(input("gone"));
    await store.softDelete(gone.id);
    await db.query("insert into pages (kind, title, database_id) values ('page', 'row', $1)", [a.id]);
    const nodes = await store.tree();
    expect(nodes.map((n) => n.title)).toEqual(["a"]);
    expect(nodes[0]).not.toHaveProperty("body");
  });

  it("searches Portuguese text with stemming and ignores deleted pages", async () => {
    const receitas = await store.create(input("Receitas", { body: doc("bolos de cenoura"), bodyText: "bolos de cenoura" }));
    await store.create(input("Outra", { body: doc("nada"), bodyText: "nada" }));
    const hits = await store.search("bolo", 10);
    expect(hits.map((h) => h.id)).toEqual([receitas.id]);
    expect(hits[0]?.snippet).toBe("bolos de cenoura");
    expect((await store.search("receita", 10)).map((h) => h.id)).toEqual([receitas.id]);
    await store.softDelete(receitas.id);
    expect(await store.search("bolo", 10)).toEqual([]);
  });

  it("treats search input as plain text, not as query syntax or SQL", async () => {
    await store.create(input("a", { bodyText: "texto" }));
    await expect(store.search(`'; drop table pages; -- & | !`, 10)).resolves.toEqual([]);
    expect(await store.head()).toBeGreaterThan(0);
  });
});
