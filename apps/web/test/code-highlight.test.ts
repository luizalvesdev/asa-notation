import { describe, expect, it } from "vitest";
import { lowlight } from "../src/code-highlight";

describe("destaque de código", () => {
  it("reconhece TypeScript e apelidos comuns", () => {
    expect(lowlight.registered("typescript")).toBe(true);
    for (const alias of ["ts", "js", "sh", "py", "yml", "html"]) expect(lowlight.registered(alias), alias).toBe(true);
  });

  it("marca palavras-chave", () => {
    const tree = lowlight.highlight("typescript", "const a: number = 1;");
    expect(JSON.stringify(tree)).toContain("hljs-keyword");
  });

  it("linguagem desconhecida não está registrada (fica sem cor)", () => {
    expect(lowlight.registered("brainfuck")).toBe(false);
  });
});
