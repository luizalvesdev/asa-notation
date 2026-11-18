import { beforeEach, describe, expect, it } from "vitest";
import { canvasText, parseCanvas, validCover } from "../src/canvas/schema.js";
import { createTestApp, type TestApp } from "./helpers.js";

const rect = (id: string) => ({ id, type: "rect", color: "blue", stroke: 2, x: 0, y: 0, w: 10, h: 10 });

describe("parseCanvas", () => {
  it("aceita cada tipo de forma e devolve só os campos conhecidos", () => {
    const out = parseCanvas({
      type: "canvas",
      shapes: [
        { ...rect("a"), extra: "x" },
        { id: "b", type: "ellipse", color: "red", stroke: 3, x: 1, y: 2, w: 3, h: 4 },
        { id: "c", type: "line", color: "ink", stroke: 1, x1: 0, y1: 0, x2: 5, y2: 5 },
        { id: "d", type: "arrow", color: "green", stroke: 1, x1: 0, y1: 0, x2: 5, y2: 5 },
        { id: "e", type: "pen", color: "purple", stroke: 4, points: [0, 0, 1, 1, 2, 2] },
        { id: "f", type: "text", color: "orange", stroke: 1, x: 3, y: 3, text: "Olá", size: 16 },
      ],
    });
    expect(typeof out).toBe("object");
    expect((out as { shapes: object[] }).shapes).toHaveLength(6);
    expect(JSON.stringify(out)).not.toContain("extra");
  });

  it("recusa estrutura, cor, traço e coordenadas inválidos", () => {
    const bad = (shape: object) => parseCanvas({ type: "canvas", shapes: [shape] });
    expect(parseCanvas(null)).toBe("invalid_canvas");
    expect(parseCanvas({ type: "doc", shapes: [] })).toBe("invalid_canvas");
    expect(bad({ ...rect("a"), color: "neon" })).toBe("invalid_shape");
    expect(bad({ ...rect("a"), stroke: 0 })).toBe("invalid_shape");
    expect(bad({ ...rect("a"), x: Infinity })).toBe("invalid_shape");
    expect(bad({ ...rect("a"), w: 9e9 })).toBe("invalid_shape");
    expect(bad({ ...rect("a b") })).toBe("invalid_shape");
    expect(bad({ ...rect("a"), type: "star" })).toBe("invalid_shape");
    expect(bad({ id: "p", type: "pen", color: "ink", stroke: 1, points: [1, 2, 3] })).toBe("invalid_shape");
    expect(bad({ id: "t", type: "text", color: "ink", stroke: 1, x: 0, y: 0, text: "x".repeat(501), size: 16 })).toBe("invalid_shape");
    expect(bad({ id: "t", type: "text", color: "ink", stroke: 1, x: 0, y: 0, text: "x", size: 2 })).toBe("invalid_shape");
  });

  it("não aceita ids repetidos nem formas demais ou grandes demais", () => {
    expect(parseCanvas({ type: "canvas", shapes: [rect("a"), rect("a")] })).toBe("invalid_shape");
    expect(parseCanvas({ type: "canvas", shapes: Array.from({ length: 3001 }, (_, i) => rect(`s${i}`)) })).toBe("invalid_canvas");
    const heavy = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, type: "pen", color: "ink", stroke: 1, points: Array.from({ length: 6000 }, (_, j) => j + 0.123456789) }));
    expect(parseCanvas({ type: "canvas", shapes: heavy })).toBe("canvas_too_large");
  });
});

describe("canvasText e validCover", () => {
  it("junta só os textos", () => {
    expect(canvasText({ shapes: [rect("a"), { type: "text", text: "um" }, { type: "text", text: "dois" }] })).toBe("um dois");
    expect(canvasText(null)).toBe("");
  });
  it("capa: degradê conhecido ou imagem http(s)", () => {
    expect(validCover(null)).toBe(true);
    expect(validCover("grad:ocean")).toBe(true);
    expect(validCover("grad:neon")).toBe(false);
    expect(validCover("https://x.dev/a.png")).toBe(true);
    expect(validCover("javascript:alert(1)")).toBe(false);
    expect(validCover("data:image/png;base64,AAAA")).toBe(false);
    expect(validCover("https://x.dev/" + "a".repeat(300))).toBe(false);
    expect(validCover(5)).toBe(false);
  });
});

describe("páginas canvas e capas pela API", () => {
  let app: TestApp;
  let cookies: Record<string, string>;
  beforeEach(async () => {
    app = await createTestApp();
    cookies = await app.owner();
  });
  const call = (method: string, path: string, body?: unknown) => app.call(method, path, { cookies, body });
  interface PageJson { id: string; kind: string; cover: string | null; body: { type: string; shapes?: unknown[] } | null }

  it("cria um quadro vazio e salva formas", async () => {
    const res = await call("POST", "/pages", { kind: "canvas", title: "Quadro" });
    expect(res.status).toBe(201);
    const page = (res.body as { page: PageJson }).page;
    expect(page).toMatchObject({ kind: "canvas", body: { type: "canvas", shapes: [] } });
    const saved = await call("PATCH", `/pages/${page.id}`, { body: { type: "canvas", shapes: [rect("a"), { id: "t", type: "text", color: "ink", stroke: 1, x: 0, y: 0, text: "ideia de fluxo", size: 18 }] } });
    expect(saved.status).toBe(200);
    expect(((saved.body as { page: PageJson }).page.body!.shapes as unknown[]).length).toBe(2);
    const search = await app.call("GET", "/pages/search", { cookies, query: { q: "fluxo" } });
    expect((search.body as { hits: { id: string }[] }).hits.map((h) => h.id)).toContain(page.id);
  });

  it("quadro só em página canvas e documento só com formato de documento", async () => {
    const comum = ((await call("POST", "/pages", { title: "comum" })).body as { page: PageJson }).page;
    expect((await call("PATCH", `/pages/${comum.id}`, { body: { type: "canvas", shapes: [] } })).status).toBe(400);
    expect((await call("POST", "/pages", { title: "x", body: { type: "canvas", shapes: [] } })).status).toBe(400);
    expect((await call("POST", "/pages", { kind: "canvas", body: { type: "canvas", shapes: [{ id: "a" }] } })).status).toBe(400);
  });

  it("capa: define, troca e remove; valor inválido é recusado", async () => {
    const page = ((await call("POST", "/pages", { title: "c", cover: "grad:forest" })).body as { page: PageJson }).page;
    expect(page.cover).toBe("grad:forest");
    const changed = await call("PATCH", `/pages/${page.id}`, { cover: "https://x.dev/capa.jpg" });
    expect((changed.body as { page: PageJson }).page.cover).toBe("https://x.dev/capa.jpg");
    expect(((await call("PATCH", `/pages/${page.id}`, { cover: null })).body as { page: PageJson }).page.cover).toBeNull();
    expect((await call("PATCH", `/pages/${page.id}`, { cover: "grad:neon" })).status).toBe(400);
    expect((await call("POST", "/pages", { title: "x", cover: "javascript:1" })).status).toBe(400);
  });

  it("o link público leva a capa e o tipo", async () => {
    const page = ((await call("POST", "/pages", { kind: "canvas", title: "Quadro", cover: "grad:dusk" })).body as { page: PageJson }).page;
    const { share } = (await call("POST", `/pages/${page.id}/share`)).body as { share: { slug: string } };
    const pub = (await app.call("GET", `/public/${share.slug}`)).body as { page: Record<string, unknown> };
    expect(pub.page).toMatchObject({ cover: "grad:dusk", kind: "canvas" });
  });
});
