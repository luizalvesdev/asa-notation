import { describe, expect, it } from "vitest";
import { INITIAL_VIEW, MAX_SCALE, MIN_SCALE, clampScale, isInitial, panBy, wheelFactor, zoomAt } from "../src/pan-zoom";

describe("pan e zoom do diagrama", () => {
  it("o ponto sob o cursor fica parado ao dar zoom", () => {
    const view = { x: 30, y: -10, scale: 1.5 };
    const next = zoomAt(view, 2, 200, 120);
    // Ponto do conteúdo sob o cursor antes e depois.
    const before = { cx: (200 - view.x) / view.scale, cy: (120 - view.y) / view.scale };
    const after = { cx: (200 - next.x) / next.scale, cy: (120 - next.y) / next.scale };
    expect(after.cx).toBeCloseTo(before.cx);
    expect(after.cy).toBeCloseTo(before.cy);
    expect(next.scale).toBeCloseTo(3);
  });

  it("limita a escala", () => {
    expect(zoomAt(INITIAL_VIEW, 100, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAt(INITIAL_VIEW, 0.001, 0, 0).scale).toBe(MIN_SCALE);
    expect(clampScale(1)).toBe(1);
  });

  it("no limite o conteúdo não pula", () => {
    const max = { x: 10, y: 20, scale: MAX_SCALE };
    expect(zoomAt(max, 2, 50, 50)).toEqual(max);
  });

  it("arrastar soma o deslocamento sem mexer na escala", () => {
    expect(panBy({ x: 1, y: 2, scale: 2 }, 10, -4)).toEqual({ x: 11, y: -2, scale: 2 });
  });

  it("roda para cima aproxima, para baixo afasta, e há teto por evento", () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-100000)).toBe(wheelFactor(-120));
    expect(wheelFactor(-3, 1)).toBeCloseTo(wheelFactor(-48));
  });

  it("isInitial só vale na vista inicial", () => {
    expect(isInitial(INITIAL_VIEW)).toBe(true);
    expect(isInitial(panBy(INITIAL_VIEW, 1, 0))).toBe(false);
  });
});
