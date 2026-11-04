import { beforeEach, describe, expect, it } from "vitest";
import type { Page } from "@asa/core";
import type { PageInput } from "../src/memory-store.js";
import { createApp } from "./helpers.js";

function pageInput(id: string, overrides: Partial<PageInput> = {}): PageInput {
  return {
    id,
    parentId: null,
    databaseId: null,
    kind: "page",
    title: id,
    body: null,
    props: {},
    origin: "app",
    createdAt: "2026-11-04T10:00:00-03:00",
    updatedAt: "2026-11-04T10:00:00-03:00",
    deletedAt: null,
    ...overrides,
  };
}

interface Feed {
  pages: Page[];
  next: number;
  hasMore: boolean;
}

describe("sync endpoints", () => {
  let app: ReturnType<typeof createApp>;
  let cookies: Record<string, string>;

  const get = (path: string, query: Record<string, string> = {}) =>
    app.call("GET", path, { cookies, query });

  beforeEach(async () => {
    app = createApp();
    cookies = await app.ownerCookies();
  });

  it("returns seq 0 on an empty store", async () => {
    expect(await get("/sync/head")).toEqual({ status: 200, body: { seq: 0 } });
  });

  it("head follows the latest rev", async () => {
    app.store.save(pageInput("a"));
    app.store.save(pageInput("b"));
    expect(await get("/sync/head")).toEqual({ status: 200, body: { seq: 2 } });
  });

  it("changes returns pages ordered by rev", async () => {
    app.store.save(pageInput("a"));
    app.store.save(pageInput("b"));
    const res = await get("/changes");
    const feed = res.body as Feed;
    expect(res.status).toBe(200);
    expect(feed.pages.map((p) => p.id)).toEqual(["a", "b"]);
    expect(feed.next).toBe(2);
    expect(feed.hasMore).toBe(false);
  });

  it("an updated page moves to the end of the feed with a new rev", async () => {
    app.store.save(pageInput("a"));
    app.store.save(pageInput("b"));
    app.store.save(pageInput("a", { title: "a2" }));
    const feed = (await get("/changes")).body as Feed;
    expect(feed.pages.map((p) => [p.id, p.rev])).toEqual([
      ["b", 2],
      ["a", 3],
    ]);
  });

  it("changes only returns pages newer than the cursor", async () => {
    app.store.save(pageInput("a"));
    app.store.save(pageInput("b"));
    app.store.save(pageInput("c"));
    const feed = (await get("/changes", { since: "1" })).body as Feed;
    expect(feed.pages.map((p) => p.id)).toEqual(["b", "c"]);
    expect(feed.next).toBe(3);
  });

  it("keeps the cursor when there is nothing new", async () => {
    app.store.save(pageInput("a"));
    const feed = (await get("/changes", { since: "1" })).body as Feed;
    expect(feed).toEqual({ pages: [], next: 1, hasMore: false });
  });

  it("paginates with limit and hasMore", async () => {
    for (const id of ["a", "b", "c"]) app.store.save(pageInput(id));
    const first = (await get("/changes", { limit: "2" })).body as Feed;
    expect(first.pages.map((p) => p.id)).toEqual(["a", "b"]);
    expect(first.hasMore).toBe(true);
    const second = (await get("/changes", { since: String(first.next), limit: "2" })).body as Feed;
    expect(second.pages.map((p) => p.id)).toEqual(["c"]);
    expect(second.hasMore).toBe(false);
  });

  it("includes soft-deleted pages so clients can remove them", async () => {
    app.store.save(pageInput("a", { deletedAt: "2026-11-04T11:00:00-03:00" }));
    const feed = (await get("/changes")).body as Feed;
    expect(feed.pages[0]?.deletedAt).toBe("2026-11-04T11:00:00-03:00");
  });

  it.each([
    ["since", "-1"],
    ["since", "abc"],
    ["since", "1.5"],
    ["since", ""],
    ["limit", "0"],
    ["limit", "501"],
    ["limit", "x"],
  ])("rejects invalid %s=%s", async (name, value) => {
    const res = await get("/changes", { [name]: value });
    expect(res.status).toBe(400);
  });

  it("answers 404 for unknown paths and 405 for other methods", async () => {
    expect((await get("/nope")).status).toBe(404);
    expect((await app.call("POST", "/changes", { cookies })).status).toBe(405);
  });
});
