import { describe, expect, it } from "vitest";
import { CHAT_LIMITS, SIDE_LIMITS, clampWidth, draggedWidth, readStoredWidth } from "../src/panel-size";

describe("largura dos painéis", () => {
  it("respeita mínimo, máximo e o teto da janela", () => {
    expect(clampWidth(100, SIDE_LIMITS)).toBe(200);
    expect(clampWidth(999, SIDE_LIMITS)).toBe(420);
    expect(clampWidth(300, SIDE_LIMITS)).toBe(300);
    expect(clampWidth(600, CHAT_LIMITS, 500)).toBe(500);
    expect(clampWidth(250.6, SIDE_LIMITS)).toBe(251);
  });

  it("o teto da janela nunca derruba abaixo do mínimo", () => {
    expect(clampWidth(500, CHAT_LIMITS, 100)).toBe(300);
  });

  it("valor inválido volta ao padrão", () => {
    expect(clampWidth(Number.NaN, SIDE_LIMITS)).toBe(248);
  });

  it("a barra lateral cresce arrastando para a direita; o chat, para a esquerda", () => {
    expect(draggedWidth(248, 40, "left")).toBe(288);
    expect(draggedWidth(248, -40, "left")).toBe(208);
    expect(draggedWidth(380, -60, "right")).toBe(440);
    expect(draggedWidth(380, 60, "right")).toBe(320);
  });

  it("lê o valor guardado com segurança", () => {
    expect(readStoredWidth(null, SIDE_LIMITS)).toBe(248);
    expect(readStoredWidth("", SIDE_LIMITS)).toBe(248);
    expect(readStoredWidth("abc", SIDE_LIMITS)).toBe(248);
    expect(readStoredWidth("300", SIDE_LIMITS)).toBe(300);
    expect(readStoredWidth("5000", SIDE_LIMITS)).toBe(420);
    expect(readStoredWidth("10", CHAT_LIMITS)).toBe(300);
  });
});
