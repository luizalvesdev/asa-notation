import { describe, expect, it } from "vitest";
import { ancestorsOf, buildTree, displayTitle, subtreeIds } from "../src/pages-tree";
import type { TreeNode } from "../src/pages-types";

const node = (id: string, parentId: string | null, title = id): TreeNode => ({
  id,
  parentId,
  title,
  icon: null,
  favorite: false,
  kind: "page",
  position: "a0",
});

const NODES = [node("a", null), node("b", null), node("a1", "a"), node("a2", "a"), node("a1x", "a1")];

describe("buildTree", () => {
  it("aninha e mantém a ordem recebida", () => {
    const tree = buildTree(NODES);
    expect(tree.map((n) => n.id)).toEqual(["a", "b"]);
    expect(tree[0]!.children.map((n) => n.id)).toEqual(["a1", "a2"]);
    expect(tree[0]!.children[0]!.children.map((n) => n.id)).toEqual(["a1x"]);
  });

  it("trata filha cujo pai não veio como raiz", () => {
    expect(buildTree([node("x", "ausente")]).map((n) => n.id)).toEqual(["x"]);
  });

  it("não altera os nós originais", () => {
    buildTree(NODES);
    expect("children" in NODES[0]!).toBe(false);
  });
});

describe("ancestorsOf", () => {
  it("devolve da raiz até o pai", () => {
    expect(ancestorsOf(NODES, "a1x").map((n) => n.id)).toEqual(["a", "a1"]);
  });

  it("vazio para raiz ou id desconhecido", () => {
    expect(ancestorsOf(NODES, "a")).toEqual([]);
    expect(ancestorsOf(NODES, "nope")).toEqual([]);
  });

  it("sobrevive a ciclos", () => {
    expect(ancestorsOf([node("x", "y"), node("y", "x")], "x").length).toBeLessThanOrEqual(1);
  });
});

describe("subtreeIds", () => {
  it("inclui a página e todos os descendentes", () => {
    expect([...subtreeIds(NODES, "a")].sort()).toEqual(["a", "a1", "a1x", "a2"]);
    expect([...subtreeIds(NODES, "b")]).toEqual(["b"]);
  });
});

describe("displayTitle", () => {
  it("usa 'Sem título' para vazio ou só espaços", () => {
    expect(displayTitle("")).toBe("Sem título");
    expect(displayTitle("  ")).toBe("Sem título");
    expect(displayTitle("Raft")).toBe("Raft");
  });
});
