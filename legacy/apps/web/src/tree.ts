import type { TreeNode } from "@asa/core";

export interface TreeItem extends TreeNode {
  children: TreeItem[];
}

export function buildTree(nodes: TreeNode[]): TreeItem[] {
  const items = new Map<string, TreeItem>(nodes.map((node) => [node.id, { ...node, children: [] }]));
  const roots: TreeItem[] = [];
  for (const node of nodes) {
    const item = items.get(node.id)!;
    const parent = node.parentId === null ? undefined : items.get(node.parentId);
    if (parent) parent.children.push(item);
    else roots.push(item);
  }
  return roots;
}

export function ancestorsOf(nodes: TreeNode[], id: string): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let parent = byId.get(id)?.parentId ?? null;
  while (parent !== null && !seen.has(parent)) {
    out.push(parent);
    seen.add(parent);
    parent = byId.get(parent)?.parentId ?? null;
  }
  return out;
}
