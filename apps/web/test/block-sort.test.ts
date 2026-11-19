import { describe, expect, it } from "vitest";
import { shiftFor, targetIndex } from "../src/block-sort";

describe("arrastar blocos como lista reordenável", () => {
  const centers = [50, 150, 250, 350];

  it("o destino muda quando o centro do bloco passa o centro do vizinho", () => {
    expect(targetIndex(centers, 1, 150)).toBe(1);
    expect(targetIndex(centers, 1, 260)).toBe(2);
    expect(targetIndex(centers, 1, 400)).toBe(3);
    expect(targetIndex(centers, 2, 140)).toBe(1);
    expect(targetIndex(centers, 2, 10)).toBe(0);
  });

  it("descendo, os de baixo sobem; subindo, os de cima descem", () => {
    expect([0, 1, 2, 3].map((k) => shiftFor(k, 1, 3, 100))).toEqual([0, 0, -100, -100]);
    expect([0, 1, 2, 3].map((k) => shiftFor(k, 2, 0, 100))).toEqual([100, 100, 0, 0]);
    expect([0, 1, 2, 3].map((k) => shiftFor(k, 2, 2, 100))).toEqual([0, 0, 0, 0]);
  });
});
