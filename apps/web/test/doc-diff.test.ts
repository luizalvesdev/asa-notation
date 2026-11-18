import { describe, expect, it } from "vitest";
import { blockLines, diffLines } from "../src/doc-diff";

const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("blockLines", () => {
  it("lista parágrafos, títulos e itens de lista na ordem", () => {
    const doc = { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Raft" }] }, p("um"), { type: "bulletList", content: [{ type: "listItem", content: [p("item a")] }, { type: "listItem", content: [p("item b")] }] }, p("   ")] };
    expect(blockLines(doc)).toEqual(["Raft", "um", "item a", "item b"]);
  });
  it("imagem e diagrama viram uma linha descritiva", () => {
    const doc = { type: "doc", content: [{ type: "image", attrs: { src: "x", alt: "foto" } }, { type: "mermaid", attrs: { code: "graph TD\n A-->B" } }] };
    expect(blockLines(doc)).toEqual(["[imagem: foto]", "[diagrama] graph TD"]);
  });
  it("entrada inválida vira lista vazia", () => {
    expect(blockLines(null)).toEqual([]);
    expect(blockLines("x")).toEqual([]);
  });
});

describe("diffLines", () => {
  it("sem mudança, tudo igual", () => {
    expect(diffLines(["a", "b"], ["a", "b"]).map((d) => d.type)).toEqual(["same", "same"]);
  });
  it("acha o que entrou, o que saiu e o que ficou", () => {
    const d = diffLines(["a", "b", "c"], ["a", "x", "c", "d"]);
    expect(d).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "x" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
  });
  it("lados vazios", () => {
    expect(diffLines([], ["a"])).toEqual([{ type: "add", text: "a" }]);
    expect(diffLines(["a"], [])).toEqual([{ type: "del", text: "a" }]);
    expect(diffLines([], [])).toEqual([]);
  });
  it("reordenar vira remoção e inserção", () => {
    const d = diffLines(["a", "b"], ["b", "a"]);
    expect(d.filter((x) => x.type === "same")).toHaveLength(1);
  });
});
