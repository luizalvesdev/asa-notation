import { beforeEach, describe, expect, it } from "vitest";
import { captureToPage, extractTags } from "../src/captures/text.js";
import { createTestApp, type TestApp } from "./helpers.js";

let app: TestApp;
let cookies: Record<string, string>;

beforeEach(async () => {
  app = await createTestApp();
  cookies = await app.owner();
});

interface CaptureJson {
  id: string;
  text: string;
  kind: string | null;
  tags: string[];
  createdAt: string;
}
interface ListJson {
  items: CaptureJson[];
  counts: Record<string, number>;
}

async function capture(body: Record<string, unknown>): Promise<CaptureJson> {
  const res = await app.call("POST", "/captures", { cookies, body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { capture: CaptureJson }).capture;
}
const list = async (query: Record<string, string> = {}) => (await app.call("GET", "/captures", { cookies, query })).body as ListJson;

describe("extractTags", () => {
  it("lê hashtags, em minúsculas e sem repetir", () => {
    expect(extractTags("cache por tenant #Performance e #api-v2 #performance")).toEqual(["performance", "api-v2"]);
  });
  it("ignora C#, a#b e # solto", () => {
    expect(extractTags("aprender C# e a#b e # sozinho")).toEqual([]);
  });
  it("aceita acentos e limita a 10", () => {
    expect(extractTags("#ação")).toEqual(["ação"]);
    expect(extractTags(Array.from({ length: 15 }, (_, i) => `#t${i}`).join(" "))).toHaveLength(10);
  });
});

describe("captureToPage", () => {
  it("primeira linha vira título e o resto o corpo", () => {
    const { title, body } = captureToPage("Ideia\n\nlinha dois\nlinha três");
    expect(title).toBe("Ideia");
    expect(JSON.stringify(body)).toContain("linha dois");
    expect(JSON.stringify(body)).not.toContain("Ideia");
  });
  it("linha única não gera corpo", () => {
    expect(captureToPage("só isso").body).toBeNull();
  });
  it("título longo é cortado e o texto completo vai para o corpo", () => {
    const long = "x".repeat(200);
    const { title, body } = captureToPage(long);
    expect(title.length).toBeLessThanOrEqual(120);
    expect(JSON.stringify(body)).toContain(long);
  });
});

describe("capturas", () => {
  it("exige sessão", async () => {
    expect((await app.call("GET", "/captures")).status).toBe(401);
  });

  it("cria, extrai tags e lista a mais nova primeiro", async () => {
    await capture({ text: "primeira" });
    app.clock.ms += 1000;
    const second = await capture({ text: "Cache por tenant #performance" });
    expect(second.tags).toEqual(["performance"]);
    expect((await list()).items.map((c) => c.text)).toEqual(["Cache por tenant #performance", "primeira"]);
  });

  it("valida texto, tipo e id", async () => {
    for (const body of [{ text: "  " }, { text: "x", kind: "nope" }, { text: "x", id: "abc" }, { text: "x".repeat(10_001) }]) {
      expect((await app.call("POST", "/captures", { cookies, body })).status).toBe(400);
    }
  });

  it("reenviar o mesmo id não duplica (fila offline)", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    await capture({ id, text: "uma vez" });
    await capture({ id, text: "uma vez" });
    expect((await list()).items).toHaveLength(1);
  });

  it("usa a data de criação do cliente, menos se vier do futuro", async () => {
    const past = await capture({ text: "antiga", createdAt: "2026-11-17T08:00:00.000Z" });
    expect(past.createdAt).toBe("2026-11-17T08:00:00.000Z");
    const future = await capture({ text: "futura", createdAt: "2030-01-01T00:00:00.000Z" });
    expect(future.createdAt).toBe(new Date(app.clock.ms).toISOString());
  });

  it("filtra por tipo e por sem tipo, e conta", async () => {
    await capture({ text: "a", kind: "idea" });
    await capture({ text: "b", kind: "study" });
    await capture({ text: "c" });
    expect((await list({ kind: "idea" })).items.map((c) => c.text)).toEqual(["a"]);
    expect((await list({ kind: "none" })).items.map((c) => c.text)).toEqual(["c"]);
    expect((await list()).counts).toMatchObject({ total: 3, idea: 1, study: 1, none: 1, work: 0 });
    expect((await app.call("GET", "/captures", { cookies, query: { kind: "x" } })).status).toBe(400);
  });

  it("edita texto (refaz as tags) e tipo", async () => {
    const c = await capture({ text: "oi #a" });
    const res = await app.call("PATCH", `/captures/${c.id}`, { cookies, body: { text: "oi #b", kind: "work" } });
    expect((res.body as { capture: CaptureJson }).capture).toMatchObject({ text: "oi #b", tags: ["b"], kind: "work" });
    const clear = await app.call("PATCH", `/captures/${c.id}`, { cookies, body: { kind: null } });
    expect((clear.body as { capture: CaptureJson }).capture.kind).toBeNull();
    expect((await app.call("PATCH", `/captures/${c.id}`, { cookies, body: {} })).status).toBe(400);
  });

  it("arquiva e restaura em lote", async () => {
    const a = await capture({ text: "a" });
    const b = await capture({ text: "b" });
    const res = await app.call("POST", "/captures/bulk", { cookies, body: { ids: [a.id, b.id], action: "archive" } });
    expect(res.body).toEqual({ updated: 2 });
    expect((await list()).items).toEqual([]);
    await app.call("POST", "/captures/bulk", { cookies, body: { ids: [a.id], action: "restore" } });
    expect((await list()).items.map((c) => c.text)).toEqual(["a"]);
  });

  it("classifica em lote", async () => {
    const a = await capture({ text: "a" });
    await app.call("POST", "/captures/bulk", { cookies, body: { ids: [a.id], action: "kind", kind: "project" } });
    expect((await list()).items[0]!.kind).toBe("project");
  });

  it("valida o lote", async () => {
    for (const body of [{ ids: [], action: "archive" }, { ids: ["x"], action: "archive" }, { ids: ["11111111-1111-4111-8111-111111111111"], action: "boom" }, { ids: ["11111111-1111-4111-8111-111111111111"], action: "kind", kind: "nope" }]) {
      expect((await app.call("POST", "/captures/bulk", { cookies, body })).status).toBe(400);
    }
  });
});

describe("mover para página", () => {
  it("cria a página, tira a captura da Inbox e não deixa mover duas vezes", async () => {
    const parent = ((await app.call("POST", "/pages", { cookies, body: { title: "Loja v2" } })).body as { page: { id: string } }).page;
    const c = await capture({ text: "Cache por tenant\ninvalidar quando o catálogo muda" });
    const res = await app.call("POST", `/captures/${c.id}/move`, { cookies, body: { parentId: parent.id } });
    expect(res.status).toBe(200);
    const page = (res.body as { page: { title: string; parentId: string } }).page;
    expect(page).toMatchObject({ title: "Cache por tenant", parentId: parent.id });
    expect((await list()).items).toEqual([]);

    const again = await app.call("POST", `/captures/${c.id}/move`, { cookies, body: { parentId: null } });
    expect(again.status).toBe(409);
    const tree = (await app.call("GET", "/pages/tree", { cookies })).body as { pages: { title: string }[] };
    expect(tree.pages.filter((p) => p.title === "Cache por tenant")).toHaveLength(1);
  });

  it("valida pai e captura", async () => {
    const c = await capture({ text: "x" });
    expect((await app.call("POST", `/captures/${c.id}/move`, { cookies, body: {} })).status).toBe(400);
    expect((await app.call("POST", `/captures/${c.id}/move`, { cookies, body: { parentId: "00000000-0000-4000-8000-000000000000" } })).status).toBe(404);
    expect((await app.call("POST", "/captures/00000000-0000-4000-8000-000000000000/move", { cookies, body: { parentId: null } })).status).toBe(404);
    expect((await list()).items).toHaveLength(1);
  });
});
