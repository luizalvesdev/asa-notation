import { describe, expect, it } from "vitest";
import { arrowHead, bbox, boundsOf, commit, distToSegment, fitView, hitTest, normalizeBox, redo, screenToWorld, startHistory, thin, topShapeAt, translate, undo, zoomAt } from "../src/canvas-logic";
import type { Shape } from "../src/canvas-types";

const rect: Shape = { id: "r", type: "rect", color: "ink", stroke: 2, x: 10, y: 10, w: 100, h: 50 };
const ellipse: Shape = { id: "e", type: "ellipse", color: "ink", stroke: 2, x: 0, y: 0, w: 100, h: 100 };
const line: Shape = { id: "l", type: "line", color: "ink", stroke: 2, x1: 0, y1: 0, x2: 100, y2: 0 };
const pen: Shape = { id: "p", type: "pen", color: "ink", stroke: 2, points: [0, 0, 50, 0, 50, 50] };
const text: Shape = { id: "t", type: "text", color: "ink", stroke: 1, x: 5, y: 5, text: "olá\nmundo!", size: 20 };

describe("vista", () => {
  it("converte tela em mundo e de volta ao centro", () => {
    expect(screenToWorld({ x: 100, y: 50, zoom: 2 }, 300, 250)).toEqual({ x: 100, y: 100 });
  });
  it("zoom mantém o ponto sob o cursor parado", () => {
    const view = { x: 20, y: -10, zoom: 1 };
    const before = screenToWorld(view, 400, 300);
    const next = zoomAt(view, 400, 300, 2);
    expect(next.zoom).toBe(2);
    const after = screenToWorld(next, 400, 300);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
  it("zoom respeita os limites", () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 5 }, 0, 0, 10).zoom).toBe(6);
    expect(zoomAt({ x: 0, y: 0, zoom: 0.2 }, 0, 0, 0.1).zoom).toBe(0.1);
  });
  it("fitView enquadra o conteúdo no centro", () => {
    const view = fitView({ x: 0, y: 0, w: 200, h: 100 }, 800, 600);
    expect(screenToWorld(view, 400, 300)).toEqual({ x: 100, y: 50 });
    expect(fitView(null, 800, 600)).toEqual({ x: 400, y: 300, zoom: 1 });
  });
});

describe("geometria", () => {
  it("normalizeBox aceita qualquer direção de arraste", () => {
    expect(normalizeBox(50, 40, 10, 5)).toEqual({ x: 10, y: 5, w: 40, h: 35 });
  });
  it("bbox de cada forma", () => {
    expect(bbox(rect)).toEqual({ x: 10, y: 10, w: 100, h: 50 });
    expect(bbox(line)).toEqual({ x: 0, y: 0, w: 100, h: 0 });
    expect(bbox(pen)).toEqual({ x: 0, y: 0, w: 50, h: 50 });
    expect(bbox(text).h).toBeCloseTo(52);
  });
  it("boundsOf junta tudo", () => {
    expect(boundsOf([rect, pen])).toEqual({ x: 0, y: 0, w: 110, h: 60 });
    expect(boundsOf([])).toBeNull();
  });
  it("distância ao segmento, inclusive além das pontas", () => {
    expect(distToSegment(50, 10, 0, 0, 100, 0)).toBe(10);
    expect(distToSegment(-3, 4, 0, 0, 100, 0)).toBe(5);
    expect(distToSegment(1, 1, 0, 0, 0, 0)).toBeCloseTo(Math.SQRT2);
  });
  it("translate move cada tipo", () => {
    expect(translate(rect, 5, -5)).toMatchObject({ x: 15, y: 5 });
    expect(translate(line, 1, 2)).toMatchObject({ x1: 1, y1: 2, x2: 101, y2: 2 });
    expect(translate(pen, 10, 20)).toMatchObject({ points: [10, 20, 60, 20, 60, 70] });
    expect(translate(text, 1, 1)).toMatchObject({ x: 6, y: 6 });
  });
  it("thin tira pontos próximos e mantém as pontas", () => {
    expect(thin([0, 0, 1, 0, 2, 0, 10, 0, 11, 0], 5)).toEqual([0, 0, 10, 0, 11, 0]);
    expect(thin([0, 0, 1, 1], 5)).toEqual([0, 0, 1, 1]);
  });
  it("a ponta da seta fica atrás da extremidade", () => {
    const [ax, ay, bx, by] = arrowHead(0, 0, 100, 0, 10);
    expect(ax).toBeLessThan(100);
    expect(bx).toBeLessThan(100);
    expect(ay).toBeCloseTo(-by);
  });
});

describe("hit test", () => {
  it("retângulo, elipse, linha, traço e texto", () => {
    expect(hitTest(rect, 50, 30, 2)).toBe(true);
    expect(hitTest(rect, 200, 30, 2)).toBe(false);
    expect(hitTest(ellipse, 50, 50, 0)).toBe(true);
    expect(hitTest(ellipse, 2, 2, 0)).toBe(false); // canto de fora da elipse
    expect(hitTest(line, 50, 3, 2)).toBe(true);
    expect(hitTest(line, 50, 20, 2)).toBe(false);
    expect(hitTest(pen, 50, 25, 2)).toBe(true);
    expect(hitTest(pen, 10, 40, 2)).toBe(false);
    expect(hitTest(text, 10, 10, 0)).toBe(true);
  });
  it("traço de um ponto só", () => {
    expect(hitTest({ ...pen, points: [10, 10] }, 11, 11, 1)).toBe(true);
  });
  it("topShapeAt devolve a última desenhada", () => {
    expect(topShapeAt([rect, { ...rect, id: "r2" }], 50, 30, 1)?.id).toBe("r2");
    expect(topShapeAt([rect], 500, 500, 1)).toBeNull();
  });
});

describe("desfazer e refazer", () => {
  it("commit, undo e redo", () => {
    let h = startHistory([]);
    h = commit(h, [rect]);
    h = commit(h, [rect, ellipse]);
    expect(h.present).toHaveLength(2);
    h = undo(h);
    expect(h.present).toEqual([rect]);
    h = undo(h);
    expect(h.present).toEqual([]);
    expect(undo(h)).toBe(h);
    h = redo(h);
    expect(h.present).toEqual([rect]);
  });
  it("uma mudança nova apaga o futuro", () => {
    let h = commit(startHistory([]), [rect]);
    h = undo(h);
    h = commit(h, [ellipse]);
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
  });
  it("guarda no máximo 100 passos", () => {
    let h = startHistory([]);
    for (let i = 0; i < 130; i++) h = commit(h, [{ ...rect, id: `s${i}` }]);
    expect(h.past).toHaveLength(100);
  });
});
