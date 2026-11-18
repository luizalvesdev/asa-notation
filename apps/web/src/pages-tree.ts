import type { TreeNode } from "./pages-types";

export interface TreeItem extends TreeNode {
  children: TreeItem[];
}

/** Monta a árvore aninhada. Mantém a ordem recebida (a API já ordena por posição). */
export function buildTree(nodes: TreeNode[]): TreeItem[] {
  const items = new Map<string, TreeItem>(nodes.map((node) => [node.id, { ...node, children: [] }]));
  const roots: TreeItem[] = [];
  for (const node of nodes) {
    const item = items.get(node.id)!;
    const parent = node.parentId === null ? undefined : items.get(node.parentId);
    (parent ? parent.children : roots).push(item);
  }
  return roots;
}

/** Ancestrais de uma página, da raiz até o pai. Vazio se não existir ou estiver na raiz. */
export function ancestorsOf(nodes: TreeNode[], id: string): TreeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain: TreeNode[] = [];
  const seen = new Set<string>([id]);
  let current = byId.get(id);
  while (current?.parentId && !seen.has(current.parentId)) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    seen.add(parent.id);
    current = parent;
  }
  return chain;
}

/** A própria página e tudo que está abaixo dela. */
export function subtreeIds(nodes: TreeNode[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const list = children.get(node.parentId);
    if (list) list.push(node.id);
    else children.set(node.parentId, [node.id]);
  }
  const out = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (out.has(next)) continue;
    out.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return out;
}

export function displayTitle(title: string): string {
  return title.trim() === "" ? "Sem título" : title;
}
