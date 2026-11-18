import { describe, expect, it } from "vitest";
import { docToMarkdown } from "../src/doc-to-markdown";
import { pagePaths, safeName } from "../src/export-zip";

const t = (text: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({ type: "text", text, ...(marks ? { marks } : {}) });
const p = (...content: object[]) => ({ type: "paragraph", content });
const doc = (...content: object[]) => ({ type: "doc", content });

describe("docToMarkdown", () => {
  it("parágrafos e títulos", () => {
    expect(docToMarkdown(doc({ type: "heading", attrs: { level: 2 }, content: [t("Raft")] }, p(t("texto"))))).toBe("## Raft\n\ntexto\n");
  });

  it("marcas inline", () => {
    expect(docToMarkdown(doc(p(t("a", [{ type: "bold" }]), t(" "), t("b", [{ type: "italic" }]), t(" "), t("c", [{ type: "strike" }]), t(" "), t("d", [{ type: "link", attrs: { href: "https://x.dev" } }]))))).toBe("**a** *b* ~~c~~ [d](https://x.dev)\n");
    expect(docToMarkdown(doc(p(t("x*y", [{ type: "code" }, { type: "bold" }]))))).toBe("`x*y`\n");
  });

  it("listas, numeradas e de tarefas", () => {
    const li = (...c: object[]) => ({ type: "listItem", content: c });
    expect(docToMarkdown(doc({ type: "bulletList", content: [li(p(t("um"))), li(p(t("dois")))] }))).toBe("- um\n- dois\n");
    expect(docToMarkdown(doc({ type: "orderedList", attrs: { start: 3 }, content: [li(p(t("a"))), li(p(t("b")))] }))).toBe("3. a\n4. b\n");
    const ti = (checked: boolean, s: string) => ({ type: "taskItem", attrs: { checked }, content: [p(t(s))] });
    expect(docToMarkdown(doc({ type: "taskList", content: [ti(true, "feito"), ti(false, "falta")] }))).toBe("- [x] feito\n- [ ] falta\n");
  });

  it("lista aninhada recua os filhos", () => {
    const inner = { type: "bulletList", content: [{ type: "listItem", content: [p(t("filho"))] }] };
    expect(docToMarkdown(doc({ type: "bulletList", content: [{ type: "listItem", content: [p(t("pai")), inner] }] }))).toBe("- pai\n  - filho\n");
  });

  it("citação, código e divisor", () => {
    expect(docToMarkdown(doc({ type: "blockquote", content: [p(t("a")), p(t("b"))] }))).toBe("> a\n>\n> b\n");
    expect(docToMarkdown(doc({ type: "codeBlock", attrs: { language: "ts" }, content: [t("const a = 1")] }))).toBe("```ts\nconst a = 1\n```\n");
    expect(docToMarkdown(doc(p(t("a")), { type: "horizontalRule" }, p(t("b"))))).toBe("a\n\n---\n\nb\n");
  });

  it("documento vazio ou inválido", () => {
    expect(docToMarkdown(null)).toBe("");
    expect(docToMarkdown(doc())).toBe("");
    expect(docToMarkdown(doc(p()))).toBe("");
  });
});

describe("export em pastas", () => {
  it("safeName tira caracteres de caminho", () => {
    expect(safeName("a/b: c?")).toBe("a b c");
    expect(safeName("..")).toBe("Sem título");
    expect(safeName("   ")).toBe("Sem título");
  });

  it("espelha a árvore e desambigua nomes repetidos", () => {
    const pages = [
      { id: "1", parent_id: null, title: "Estudo", body: null },
      { id: "2", parent_id: "1", title: "Raft", body: null },
      { id: "3", parent_id: "1", title: "raft", body: null },
      { id: "4", parent_id: "ausente", title: "Órfã", body: null },
    ];
    expect(Object.fromEntries(pagePaths(pages))).toEqual({ 1: "Estudo.md", 2: "Estudo/Raft.md", 3: "Estudo/raft (2).md", 4: "Órfã.md" });
  });
});
