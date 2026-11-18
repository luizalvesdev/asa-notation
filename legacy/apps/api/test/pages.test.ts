import { beforeEach, describe, expect, it } from "vitest";
import type { ChangeFeed, Page, SearchHit, TreeNode } from "@asa/core";
import { createApp } from "./helpers.js";

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("pages API", () => {
  let app: ReturnType<typeof createApp>;
  let cookies: Record<string, string>;

  const post = (path: string, body?: unknown) => app.call("POST", path, { cookies, body });
  const patch = (id: string, body?: unknown) => app.call("PATCH", `/pages/${id}`, { cookies, body });
  const get = (path: string, query: Record<string, string> = {}) => app.call("GET", path, { cookies, query });

  async function create(body: Record<string, unknown> = {}): Promise<Page> {
    const res = await post("/pages", body);
    expect(res.status).toBe(201);
    return res.body as Page;
  }

  beforeEach(async () => {
    app = createApp();
    cookies = await app.ownerCookies();
  });

  describe("create", () => {
    it("creates a page with sensible defaults", async () => {
      const page = await create();
      expect(page).toMatchObject({
        parentId: null,
        databaseId: null,
        kind: "page",
        title: "",
        body: null,
        props: {},
        origin: "app",
        deletedAt: null,
      });
      expect(page.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(page.rev).toBeGreaterThan(0);
    });

    it("keeps title, body, props and parent", async () => {
      const parent = await create({ title: "Pai" });
      const page = await create({ title: "Filho", parentId: parent.id, body: doc("olá"), props: { status: "ok" } });
      expect(page).toMatchObject({ title: "Filho", parentId: parent.id, body: doc("olá"), props: { status: "ok" } });
    });

    it.each([
      ["a non-string title", { title: 3 }, "invalid_title"],
      ["a title over 500 characters", { title: "x".repeat(501) }, "invalid_title"],
      ["an unknown kind", { kind: "folder" }, "invalid_kind"],
      ["a body that is not a doc", { body: { type: "paragraph" } }, "invalid_page_body"],
      ["a body that is a string", { body: "text" }, "invalid_page_body"],
      ["props that are an array", { props: [] }, "invalid_props"],
      ["a malformed parent id", { parentId: "nope" }, "invalid_parent"],
      ["a parent that does not exist", { parentId: "00000000-0000-0000-0000-000000000000" }, "parent_not_found"],
    ])("rejects %s", async (_label, body, error) => {
      const res = await post("/pages", body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error });
    });

    it("rejects an oversized body", async () => {
      const big = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(500_001) }] }] };
      expect((await post("/pages", { body: big })).status).toBe(400);
    });

    it("rejects a missing or non-object payload", async () => {
      expect((await post("/pages")).status).toBe(400);
      expect((await post("/pages", [1])).status).toBe(400);
    });

    it("rejects a deleted parent", async () => {
      const parent = await create();
      await app.call("DELETE", `/pages/${parent.id}`, { cookies });
      expect((await post("/pages", { parentId: parent.id })).status).toBe(400);
    });
  });

  describe("read", () => {
    it("gets a page by id and 404s for unknown or malformed ids", async () => {
      const page = await create({ title: "a" });
      expect((await get(`/pages/${page.id}`)).body).toEqual(page);
      expect((await get("/pages/00000000-0000-0000-0000-000000000000")).status).toBe(404);
      expect((await get("/pages/not-a-uuid")).status).toBe(404);
    });

    it("lists the tree without bodies", async () => {
      const parent = await create({ title: "Pai", body: doc("segredo") });
      const child = await create({ title: "Filho", parentId: parent.id });
      const res = await get("/tree");
      const nodes = (res.body as { pages: TreeNode[] }).pages;
      expect(nodes.map((n) => [n.id, n.parentId, n.title])).toEqual([
        [parent.id, null, "Pai"],
        [child.id, parent.id, "Filho"],
      ]);
      expect(JSON.stringify(res.body)).not.toContain("segredo");
    });

    it("searches title and body text", async () => {
      await create({ title: "Receitas", body: doc("bolo de cenoura") });
      await create({ title: "Outra", body: doc("nada") });
      const hits = ((await get("/search", { q: "cenoura" })).body as { hits: SearchHit[] }).hits;
      expect(hits.map((h) => h.title)).toEqual(["Receitas"]);
      expect(hits[0]?.snippet).toContain("cenoura");
    });

    it("rejects empty and oversized queries", async () => {
      expect((await get("/search")).status).toBe(400);
      expect((await get("/search", { q: "  " })).status).toBe(400);
      expect((await get("/search", { q: "x".repeat(201) })).status).toBe(400);
    });
  });

  describe("update", () => {
    it("updates the title and bumps rev", async () => {
      const page = await create({ title: "a" });
      const res = await patch(page.id, { baseRev: page.rev, title: "b" });
      expect(res.status).toBe(200);
      const updated = res.body as Page;
      expect(updated.title).toBe("b");
      expect(updated.rev).toBeGreaterThan(page.rev);
      expect(updated.createdAt).toBe(page.createdAt);
    });

    it("answers 409 with the current page when baseRev is stale", async () => {
      const page = await create({ title: "a" });
      await patch(page.id, { baseRev: page.rev, title: "b" });
      const res = await patch(page.id, { baseRev: page.rev, title: "c" });
      expect(res.status).toBe(409);
      expect((res.body as { page: Page }).page.title).toBe("b");
    });

    it("requires a valid baseRev", async () => {
      const page = await create();
      for (const baseRev of [undefined, -1, 1.5, "1"]) {
        expect((await patch(page.id, { baseRev, title: "x" })).status).toBe(400);
      }
    });

    it("rejects an empty patch", async () => {
      const page = await create();
      const res = await patch(page.id, { baseRev: page.rev });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "empty_patch" });
    });

    it("updates the body and refreshes the search text", async () => {
      const page = await create({ body: doc("antigo") });
      const res = await patch(page.id, { baseRev: page.rev, body: doc("novidade") });
      expect((res.body as Page).body).toEqual(doc("novidade"));
      expect(((await get("/search", { q: "novidade" })).body as { hits: SearchHit[] }).hits).toHaveLength(1);
      expect(((await get("/search", { q: "antigo" })).body as { hits: SearchHit[] }).hits).toHaveLength(0);
    });

    it("clears the body with null", async () => {
      const page = await create({ body: doc("x") });
      const res = await patch(page.id, { baseRev: page.rev, body: null });
      expect((res.body as Page).body).toBeNull();
    });

    it("merges props and removes keys set to null", async () => {
      const page = await create({ props: { a: 1, b: 2 } });
      const res = await patch(page.id, { baseRev: page.rev, props: { b: null, c: 3 } });
      expect((res.body as Page).props).toEqual({ a: 1, c: 3 });
    });

    it("moves a page and back to the root", async () => {
      const parent = await create();
      const page = await create();
      const moved = (await patch(page.id, { baseRev: page.rev, parentId: parent.id })).body as Page;
      expect(moved.parentId).toBe(parent.id);
      const root = (await patch(page.id, { baseRev: moved.rev, parentId: null })).body as Page;
      expect(root.parentId).toBeNull();
    });

    it("refuses to move a page into itself or into its own descendant", async () => {
      const a = await create();
      const b = await create({ parentId: a.id });
      const c = await create({ parentId: b.id });
      expect((await patch(a.id, { baseRev: a.rev, parentId: a.id })).status).toBe(400);
      expect((await patch(a.id, { baseRev: a.rev, parentId: c.id })).status).toBe(400);
    });

    it("refuses a missing or malformed parent", async () => {
      const page = await create();
      expect((await patch(page.id, { baseRev: page.rev, parentId: "00000000-0000-0000-0000-000000000000" })).status).toBe(400);
      expect((await patch(page.id, { baseRev: page.rev, parentId: "x" })).status).toBe(400);
    });

    it("404s for an unknown page", async () => {
      expect((await patch("00000000-0000-0000-0000-000000000000", { baseRev: 1, title: "x" })).status).toBe(404);
    });
  });

  describe("delete", () => {
    it("soft deletes a page and its descendants and exposes them in the change feed", async () => {
      const parent = await create({ title: "Pai" });
      const child = await create({ title: "Filho", parentId: parent.id });
      const other = await create({ title: "Outro" });

      expect((await app.call("DELETE", `/pages/${parent.id}`, { cookies })).status).toBe(200);

      const tree = ((await get("/tree")).body as { pages: TreeNode[] }).pages;
      expect(tree.map((n) => n.id)).toEqual([other.id]);
      expect((await get(`/pages/${child.id}`)).status).toBe(404);

      const feed = (await get("/changes")).body as ChangeFeed;
      const deleted = feed.pages.filter((p) => p.deletedAt !== null).map((p) => p.id);
      expect(deleted.sort()).toEqual([parent.id, child.id].sort());
    });

    it("404s when deleting twice or deleting an unknown page", async () => {
      const page = await create();
      await app.call("DELETE", `/pages/${page.id}`, { cookies });
      expect((await app.call("DELETE", `/pages/${page.id}`, { cookies })).status).toBe(404);
      expect((await patch(page.id, { baseRev: page.rev, title: "x" })).status).toBe(404);
    });

    it("moves the sync head forward", async () => {
      const page = await create();
      const before = ((await get("/sync/head")).body as { seq: number }).seq;
      await app.call("DELETE", `/pages/${page.id}`, { cookies });
      const after = ((await get("/sync/head")).body as { seq: number }).seq;
      expect(after).toBeGreaterThan(before);
    });
  });

  describe("access", () => {
    it("requires authentication", async () => {
      expect((await app.call("GET", "/tree")).status).toBe(401);
      expect((await app.call("POST", "/pages", { body: {} })).status).toBe(401);
    });

    it("enforces Origin on cookie-authenticated writes", async () => {
      const res = await app.call("POST", "/pages", { cookies, body: {}, origin: null });
      expect(res.status).toBe(403);
    });

    it("lets full device tokens use the pages API but not sync-only or bot tokens", async () => {
      const issue = async (scope: string) =>
        ((await app.call("POST", "/devices", { cookies, body: { name: scope, scope } })).body as { token: string }).token;
      const headers = (token: string) => ({ authorization: `Bearer ${token}` });

      const full = await issue("full");
      expect((await app.call("POST", "/pages", { headers: headers(full), body: { title: "x" } })).status).toBe(201);
      expect((await app.call("GET", "/tree", { headers: headers(full) })).status).toBe(200);

      for (const scope of ["sync", "bot"]) {
        const token = await issue(scope);
        expect((await app.call("GET", "/tree", { headers: headers(token) })).status).toBe(403);
        expect((await app.call("POST", "/pages", { headers: headers(token), body: {} })).status).toBe(403);
      }
    });

    it("accepts the /api prefix used behind CloudFront", async () => {
      expect((await get("/api/tree")).status).toBe(200);
      expect((await get("/api/sync/head")).status).toBe(200);
      expect((await get("/apix/tree")).status).toBe(404);
    });
  });
});
