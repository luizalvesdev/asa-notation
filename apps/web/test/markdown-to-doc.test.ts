// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { linkedTitle, markdownToDoc, normalizeWikiLinks } from "../src/markdown-to-doc";

const types = (md: string) => (markdownToDoc(md)?.content ?? []).map((n) => n.type);
const flat = (md: string) => JSON.stringify(markdownToDoc(md));

describe("markdownToDoc", () => {
  it("títulos, parágrafos, listas e citação", () => {
    expect(types("# A\n\ntexto\n\n- um\n- dois\n\n1. x\n\n> citação")).toEqual(["heading", "paragraph", "bulletList", "orderedList", "blockquote"]);
  });

  it("marcas inline", () => {
    const json = flat("**forte** *itálico* `código` [site](https://x.dev) ~~riscado~~");
    for (const mark of ["bold", "italic", "code", "link", "strike"]) expect(json).toContain(`"type":"${mark}"`);
    expect(json).toContain("https://x.dev");
  });

  it("lista de tarefas com estado", () => {
    const doc = markdownToDoc("- [x] feito\n- [ ] falta")!;
    const list = doc.content![0]!;
    expect(list.type).toBe("taskList");
    expect(list.content!.map((i) => i.attrs?.checked)).toEqual([true, false]);
  });

  it("código com linguagem e diagrama mermaid", () => {
    expect(flat("```ts\nconst a = 1\n```")).toContain('"language":"ts"');
    const doc = markdownToDoc("```mermaid\ngraph TD\n A-->B\n```")!;
    expect(doc.content![0]).toMatchObject({ type: "mermaid", attrs: { code: "graph TD\n A-->B" } });
  });

  it("tabela vira tabela com cabeçalho", () => {
    const doc = markdownToDoc("| A | B |\n| --- | --- |\n| 1 | 2 |")!;
    expect(doc.content![0]!.type).toBe("table");
    expect(flat("| A | B |\n| --- | --- |\n| 1 | 2 |")).toContain("tableHeader");
  });

  it("imagem remota fica; imagem local vira marca de texto", () => {
    expect(flat("![foto](https://x.dev/a.png)")).toContain('"type":"image"');
    const local = flat("![diagrama](imagens/d.png)");
    expect(local).not.toContain('"type":"image"');
    expect(local).toContain("[imagem: diagrama]");
  });

  it("link relativo para outra nota vira [[Título]]; relativo qualquer vira só texto", () => {
    expect(flat("[Raft](Raft%200123456789abcdef0123456789abcdef.md)")).toContain("[[Raft]]");
    const other = flat("[anexo](arquivo.pdf)");
    expect(other).toContain("anexo");
    expect(other).not.toContain("arquivo.pdf");
  });

  it("não deixa HTML perigoso virar nó", () => {
    const json = flat('<script>alert(1)</script><img src="x" onerror="alert(1)">texto');
    expect(json).not.toContain("script");
    expect(json).not.toContain("onerror");
  });

  it("vazio ou só espaços dá null", () => {
    expect(markdownToDoc("")).toBeNull();
    expect(markdownToDoc("   \n\n ")).toBeNull();
  });
});

describe("helpers de link", () => {
  it("linkedTitle", () => {
    expect(linkedTitle("Pasta/Nota%20abc.md")).toBe("Nota abc");
    expect(linkedTitle("https://x.dev/a.md")).toBeNull();
    expect(linkedTitle("#ancora")).toBeNull();
    expect(linkedTitle("foto.png")).toBeNull();
  });
  it("normalizeWikiLinks tira o apelido", () => {
    expect(normalizeWikiLinks("veja [[Raft|o algoritmo]] e [[Paxos]]")).toBe("veja [[Raft]] e [[Paxos]]");
  });
});
