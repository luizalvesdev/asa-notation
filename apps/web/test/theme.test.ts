import { describe, expect, it } from "vitest";
import { initialTheme, parseTheme, toggleTheme } from "../src/theme";

describe("theme", () => {
  it("aceita só os dois temas conhecidos", () => {
    expect(parseTheme("claro")).toBe("claro");
    expect(parseTheme("escuro")).toBe("escuro");
    expect(parseTheme("roxo")).toBeNull();
    expect(parseTheme(null)).toBeNull();
  });

  it("prefere o tema salvo e cai no do sistema sem ele", () => {
    expect(initialTheme("claro", true)).toBe("claro");
    expect(initialTheme(null, true)).toBe("escuro");
    expect(initialTheme("lixo", false)).toBe("claro");
  });

  it("alterna entre claro e escuro", () => {
    expect(toggleTheme("claro")).toBe("escuro");
    expect(toggleTheme("escuro")).toBe("claro");
  });
});
