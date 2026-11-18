import type { TreeNode } from "@asa/core";
import { describe, expect, it } from "vitest";
import { ancestorsOf, buildTree } from "../src/tree.js";

const node = (id: string, parentId: string | null): TreeNode => ({
  id,
  parentId,
  kind: "page",
  title: id,
  rev: 1,
  updatedAt: "2026-11-04T10:00:00.000Z",
});

describe("buildTree", () => {
  it("nests children under their parents and keeps input order", () => {
    const tree = buildTree([node("a", null), node("b", "a"), node("c", "b"), node("d", null), node("e", "a")]);
    expect(tree.map((t) => t.id)).toEqual(["a", "d"]);
    expect(tree[0]?.children.map((t) => t.id)).toEqual(["b", "e"]);
    expect(tree[0]?.children[0]?.children.map((t) => t.id)).toEqual(["c"]);
  });

  it("promotes orphans to the root instead of dropping them", () => {
    const tree = buildTree([node("a", "missing"), node("b", null)]);
    expect(tree.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("returns an empty list for no nodes", () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe("ancestorsOf", () => {
  const nodes = [node("a", null), node("b", "a"), node("c", "b")];

  it("lists ancestors from nearest to farthest", () => {
    expect(ancestorsOf(nodes, "c")).toEqual(["b", "a"]);
    expect(ancestorsOf(nodes, "a")).toEqual([]);
  });

  it("is empty for unknown ids and stops on cycles", () => {
    expect(ancestorsOf(nodes, "zzz")).toEqual([]);
    expect(ancestorsOf([node("x", "y"), node("y", "x")], "x")).toEqual(["y"]);
  });
});
