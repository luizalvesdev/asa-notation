import { describe, expect, it } from "vitest";
import { childPages } from "../src/Subpages";

const n = (id: string, parentId: string | null, position: string) => ({ id, parentId, title: id, icon: null, favorite: false, position, kind: "page" as const });

describe("subpáginas", () => {
  it("só os filhos diretos, na ordem da árvore", () => {
    const nodes = [n("pasta", null, "a"), n("b", "pasta", "b"), n("a", "pasta", "a"), n("neto", "a", "a"), n("outra", null, "b")];
    expect(childPages(nodes, "pasta").map((p) => p.id)).toEqual(["a", "b"]);
    expect(childPages(nodes, "outra")).toEqual([]);
  });
});
