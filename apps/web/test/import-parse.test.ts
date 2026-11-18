import { describe, expect, it } from "vitest";
import { buildImportPlan, cleanTitle, stripDuplicateHeading, stripFrontMatter } from "../src/import-parse";

const f = (path: string, text = "") => ({ path, text });
const summary = (plan: ReturnType<typeof buildImportPlan>) => plan.nodes.map((n) => `${n.depth}:${n.title}${n.isFile ? "" : " (pasta)"}`);

describe("cleanTitle", () => {
  it("tira extensão e o código do Notion", () => {
    expect(cleanTitle("Consenso com Raft 0123456789abcdef0123456789ABCDEF.md")).toBe("Consenso com Raft");
    expect(cleanTitle("Nota.markdown")).toBe("Nota");
    expect(cleanTitle("Pasta 0123456789abcdef0123456789abcdef")).toBe("Pasta");
    expect(cleanTitle("Resumo 2026")).toBe("Resumo 2026");
  });
  it("nome vazio vira Sem título", () => {
    expect(cleanTitle(".md")).toBe("Sem título");
  });
});

describe("front matter e título repetido", () => {
  it("remove as propriedades do Obsidian", () => {
    expect(stripFrontMatter("---\ntags: [a]\ndate: 2026-01-01\n---\n# Oi\n")).toBe("# Oi\n");
    expect(stripFrontMatter("sem front matter")).toBe("sem front matter");
    expect(stripFrontMatter("--- não fecha\ntexto")).toBe("--- não fecha\ntexto");
  });
  it("tira o # Título que repete o nome da página", () => {
    expect(stripDuplicateHeading("# Raft\n\ntexto", "Raft")).toBe("texto");
    expect(stripDuplicateHeading("# Outro\n\ntexto", "Raft")).toBe("# Outro\n\ntexto");
  });
});

describe("buildImportPlan", () => {
  it("monta a árvore de um vault de pastas", () => {
    const plan = buildImportPlan([f("estudo/raft.md", "a"), f("estudo/paxos.md", "b"), f("diario/2026-11-18.md", "c"), f("inbox.md", "d")]);
    expect(summary(plan)).toEqual(["0:diario (pasta)", "1:2026-11-18", "0:estudo (pasta)", "1:paxos", "1:raft", "0:inbox"]);
    expect(plan.nodes.find((n) => n.title === "raft")?.parentKey).toBe("estudo");
  });

  it("Notion: arquivo e pasta com o mesmo nome viram uma página só, com filhas dentro", () => {
    const id = "0123456789abcdef0123456789abcdef";
    const plan = buildImportPlan([
      f(`Export-xyz/Sistemas ${id}.md`, "# Sistemas\n\nvisão geral"),
      f(`Export-xyz/Sistemas ${id}/Raft ${id}.md`, "# Raft\n\nconsenso"),
      f(`Export-xyz/Sistemas ${id}/Paxos ${id}.md`, "outro"),
    ]);
    expect(summary(plan)).toEqual(["0:Sistemas", "1:Paxos", "1:Raft"]);
    const parent = plan.nodes[0]!;
    expect(parent.markdown).toBe("visão geral");
    expect(plan.nodes.filter((n) => n.parentKey === parent.key)).toHaveLength(2);
  });

  it("tira a pasta única que envolve tudo", () => {
    const plan = buildImportPlan([f("repo-main/a.md"), f("repo-main/sub/b.md")]);
    expect(summary(plan)).toEqual(["0:a", "0:sub (pasta)", "1:b"]);
  });

  it("não tira a pasta quando há arquivos fora dela", () => {
    expect(summary(buildImportPlan([f("pasta/a.md"), f("b.md")]))).toEqual(["0:b", "0:pasta (pasta)", "1:a"]);
  });

  it("ignora ocultos, CSV e anexos, dizendo o motivo", () => {
    const plan = buildImportPlan([f(".obsidian/config.md"), f(".git/x.md"), f("a.md"), f("tabela.csv"), f("foto.png"), f("node_modules/m.md")]);
    expect(summary(plan)).toEqual(["0:a"]);
    expect(plan.skipped.map((s) => [s.path, s.reason])).toEqual([
      [".obsidian/config.md", "arquivo oculto ou de sistema"],
      [".git/x.md", "arquivo oculto ou de sistema"],
      ["tabela.csv", "tabela (CSV) não é importada"],
      ["foto.png", "anexo ou formato sem suporte"],
      ["node_modules/m.md", "arquivo oculto ou de sistema"],
    ]);
  });

  it("ordena com número natural e aceita barras do Windows", () => {
    const plan = buildImportPlan([f("p\\10.md"), f("p\\2.md"), f("q.md")]);
    expect(summary(plan)).toEqual(["0:p (pasta)", "1:2", "1:10", "0:q"]);
  });

  it("sem arquivos úteis, plano vazio", () => {
    expect(buildImportPlan([]).nodes).toEqual([]);
    expect(buildImportPlan([f("x.png")]).nodes).toEqual([]);
  });

  it("pai sempre vem antes dos filhos", () => {
    const plan = buildImportPlan([f("a/b/c.md"), f("a/b.md"), f("a.md")]);
    const seen = new Set<string>();
    for (const n of plan.nodes) {
      if (n.parentKey) expect(seen.has(n.parentKey)).toBe(true);
      seen.add(n.key);
    }
  });
});
