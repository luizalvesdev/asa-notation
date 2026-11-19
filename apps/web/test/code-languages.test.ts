import { describe, expect, it } from "vitest";
import { CODE_LANGUAGES, languageLabel, languageValue } from "../src/code-languages";
import { lowlight } from "../src/code-highlight";

describe("seletor de linguagem do código", () => {
  it("todas as linguagens da lista têm destaque registrado", () => {
    for (const l of CODE_LANGUAGES) expect(lowlight.registered(l.value), l.value).toBe(true);
  });

  it("apelidos viram o nome principal; vazio ou desconhecida é automático", () => {
    expect(languageValue("ts")).toBe("typescript");
    expect(languageValue("TSX")).toBe("typescript");
    expect(languageValue("sh")).toBe("bash");
    expect(languageValue("html")).toBe("xml");
    expect(languageValue("python")).toBe("python");
    expect(languageValue(null)).toBe("");
    expect(languageValue("   ")).toBe("");
    expect(languageValue("brainfuck")).toBe("");
  });

  it("rótulo de leitura: nome amigável, ou o texto original quando não conhecemos", () => {
    expect(languageLabel("ts")).toBe("TypeScript");
    expect(languageLabel("brainfuck")).toBe("brainfuck");
    expect(languageLabel(null)).toBe("");
  });
});
