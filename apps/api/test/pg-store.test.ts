import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PgPageStore } from "../src/pg-store.js";
import type { SqlClient } from "../src/sql.js";

const migration = readFileSync(new URL("../migrations/001_init.sql", import.meta.url), "utf8");

describe("PgPageStore", () => {
  let db: PGlite;
  let sql: SqlClient;
  let store: PgPageStore;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(migration);
    sql = { query: async (text, params) => (await db.query(text, params)).rows as Record<string, unknown>[] };
    store = new PgPageStore(sql);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("delete from pages");
    await db.exec("alter sequence change_seq restart with 1");
  });

  const insert = (title: string) =>
    db.query("insert into pages (kind, title) values ('page', $1) returning id", [title]);

  it("head is 0 on an empty table", async () => {
    expect(await store.head()).toBe(0);
  });

  it("head follows the latest rev", async () => {
    await insert("a");
    await insert("b");
    expect(await store.head()).toBe(2);
  });

  it("changes returns pages ordered by rev with mapped fields", async () => {
    await insert("a");
    await insert("b");
    const feed = await store.changes(0, 200);
    expect(feed.pages.map((p) => p.title)).toEqual(["a", "b"]);
    expect(feed.next).toBe(2);
    expect(feed.hasMore).toBe(false);
    const first = feed.pages[0]!;
    expect(first).toMatchObject({
      parentId: null,
      databaseId: null,
      kind: "page",
      body: null,
      props: {},
      origin: "app",
      rev: 1,
      deletedAt: null,
    });
    expect(first.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(typeof first.rev).toBe("number");
  });

  it("serializes to JSON (rev is a number, not a bigint)", async () => {
    await insert("a");
    const feed = await store.changes(0, 200);
    expect(() => JSON.stringify(feed)).not.toThrow();
  });

  it("a page updated with a new rev moves to the end of the feed", async () => {
    const a = await insert("a");
    await insert("b");
    const id = (a.rows[0] as { id: string }).id;
    await db.query("update pages set title = 'a2', rev = nextval('change_seq') where id = $1", [id]);
    const feed = await store.changes(0, 200);
    expect(feed.pages.map((p) => [p.title, p.rev])).toEqual([
      ["b", 2],
      ["a2", 3],
    ]);
  });

  it("only returns pages newer than the cursor and keeps the cursor when empty", async () => {
    await insert("a");
    await insert("b");
    expect((await store.changes(1, 200)).pages.map((p) => p.title)).toEqual(["b"]);
    expect(await store.changes(2, 200)).toEqual({ pages: [], next: 2, hasMore: false });
  });

  it("paginates with limit and hasMore", async () => {
    for (const t of ["a", "b", "c"]) await insert(t);
    const first = await store.changes(0, 2);
    expect(first.pages.map((p) => p.title)).toEqual(["a", "b"]);
    expect(first.hasMore).toBe(true);
    const second = await store.changes(first.next, 2);
    expect(second.pages.map((p) => p.title)).toEqual(["c"]);
    expect(second.hasMore).toBe(false);
  });

  it("includes soft-deleted pages with deletedAt", async () => {
    await db.query("insert into pages (kind, title, deleted_at) values ('page', 'gone', now())");
    const feed = await store.changes(0, 200);
    expect(feed.pages[0]?.deletedAt).toMatch(/Z$/);
  });
});
