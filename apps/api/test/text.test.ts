import { describe, expect, it } from "vitest";
import { extractLinks, extractText, normalizeTitle } from "../src/pages/text.js";
import { searchQuery } from "../src/pages/store.js";
import { doc } from "./helpers.js";

describe("extractText", () => {
  it("junta o texto dos blocos separando-os por espaço", () => {
    expect(extractText(doc("Primeira", "Segunda"))).toBe("Primeira Segunda");
  });

  it("aceita entradas estranhas", () => {
    expect(extractText(null)).toBe("");
    expect(extractText("texto")).toBe("");
    expect(extractText({ type: "doc" })).toBe("");
  });
});

describe("extractLinks", () => {
  it("normaliza, deduplica e ignora vazios e quebras de linha", () => {
    expect(extractLinks("[[Raft]] e [[ raft ]] e [[Dois   Espaços]] [[]] [[a\nb]]")).toEqual(["raft", "dois espaços"]);
  });

  it("não confunde colchetes simples", () => {
    expect(extractLinks("[nao] [[sim]] [[[triplo]]]")).toContain("sim");
  });
});

describe("normalizeTitle", () => {
  it("ignora caixa e espaços", () => {
    expect(normalizeTitle("  Consenso   Com RAFT ")).toBe("consenso com raft");
  });
});

describe("searchQuery", () => {
  it("monta tsquery com prefixo e só com letras e números", () => {
    expect(searchQuery("raft líder")).toBe("raft:* & líder:*");
    expect(searchQuery("a'b & c | d")).toBe("a:* & b:* & c:* & d:*");
  });

  it("devolve null sem termos e limita a quantidade", () => {
    expect(searchQuery("  !!! ")).toBeNull();
    expect(searchQuery("a b c d e f g h i j")!.split(" & ").length).toBe(8);
  });
});
