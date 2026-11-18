import { describe, expect, it } from "vitest";
import type { ImportNode } from "../src/import-parse";
import { nodesToImport, runImport, toggleSubtree } from "../src/import-run";

const node = (key: string, parentKey: string | null = null): ImportNode => ({ key, parentKey, title: key, markdown: `# ${key}`, depth: 0, isFile: true });
const tree = [node("a"), node("a/b", "a"), node("a/b/c", "a/b"), node("d")];

describe("nodesToImport", () => {
  it("inclui os marcados e os pais deles", () => {
    expect(nodesToImport(tree, new Set(["a/b/c"])).map((n) => n.key)).toEqual(["a", "a/b", "a/b/c"]);
  });
  it("nada marcado, nada importado", () => {
    expect(nodesToImport(tree, new Set())).toEqual([]);
  });
  it("mantém a ordem original", () => {
    expect(nodesToImport(tree, new Set(["d", "a"])).map((n) => n.key)).toEqual(["a", "d"]);
  });
});

describe("toggleSubtree", () => {
  it("marca o nó e tudo dentro dele", () => {
    expect([...toggleSubtree(tree, new Set(), "a")].sort()).toEqual(["a", "a/b", "a/b/c"]);
  });
  it("desmarca o nó e tudo dentro dele", () => {
    expect([...toggleSubtree(tree, new Set(["a", "a/b", "a/b/c", "d"]), "a/b")].sort()).toEqual(["a", "d"]);
  });
});

describe("runImport", () => {
  const make = (failOn: string[] = []) => {
    const calls: { parentId: string | null; title: string }[] = [];
    let n = 0;
    return {
      calls,
      deps: {
        create: async (parentId: string | null, title: string) => {
          if (failOn.includes(title)) throw new Error("boom");
          calls.push({ parentId, title });
          return { id: `id${++n}` };
        },
        idOf: (p: { id: string }) => p.id,
      },
    };
  };

  it("cria a raiz e depois cada página no pai certo", async () => {
    const { calls, deps } = make();
    const result = await runImport("Importado", tree, deps);
    expect(result).toEqual({ created: 4, failed: [], rootId: "id1" });
    expect(calls.map((c) => [c.title, c.parentId])).toEqual([["Importado", null], ["a", "id1"], ["a/b", "id2"], ["a/b/c", "id3"], ["d", "id1"]]);
  });

  it("falha numa página não derruba o resto: as filhas vão para a raiz", async () => {
    const { calls, deps } = make(["a/b"]);
    const result = await runImport("Importado", tree, deps);
    expect(result.created).toBe(3);
    expect(result.failed.map((f) => f.title)).toEqual(["a/b"]);
    expect(calls.find((c) => c.title === "a/b/c")?.parentId).toBe("id1");
  });

  it("avisa o progresso até o fim", async () => {
    const seen: number[] = [];
    const { deps } = make();
    await runImport("R", tree, { ...deps, onProgress: (done, total) => seen.push(done / total) });
    expect(seen[seen.length - 1]).toBe(1);
    expect(seen).toHaveLength(5);
  });
});
