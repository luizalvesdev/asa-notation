import type { ImportNode } from "./import-parse";

/** Quais nós entram: os marcados e os pais deles (para as filhas terem onde ficar). */
export function nodesToImport(nodes: readonly ImportNode[], selected: ReadonlySet<string>): ImportNode[] {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const keep = new Set<string>();
  for (const key of selected) {
    for (let cur = byKey.get(key); cur && !keep.has(cur.key); cur = cur.parentKey ? byKey.get(cur.parentKey) : undefined) keep.add(cur.key);
  }
  return nodes.filter((n) => keep.has(n.key));
}

/** Marca ou desmarca um nó junto com tudo que está dentro dele. */
export function toggleSubtree(nodes: readonly ImportNode[], selected: ReadonlySet<string>, key: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const n of nodes) if (n.parentKey) children.set(n.parentKey, [...(children.get(n.parentKey) ?? []), n.key]);
  const subtree: string[] = [];
  const walk = (k: string) => {
    subtree.push(k);
    for (const child of children.get(k) ?? []) walk(child);
  };
  walk(key);
  const next = new Set(selected);
  const turnOff = next.has(key);
  for (const k of subtree) (turnOff ? next.delete(k) : next.add(k));
  return next;
}

export interface ImportDeps<P> {
  /** Cria uma página e devolve o id dela. */
  create: (parentId: string | null, title: string, markdown: string) => Promise<P>;
  idOf: (page: P) => string;
  onProgress?: (done: number, total: number) => void;
}

export interface ImportResult {
  created: number;
  failed: { title: string; key: string }[];
  rootId: string | null;
}

/**
 * Cria as páginas em ordem (pai antes dos filhos) dentro de uma página raiz "Importado".
 * Se uma página falha, as filhas dela vão para a raiz e a importação continua.
 */
export async function runImport<P>(rootTitle: string, nodes: readonly ImportNode[], deps: ImportDeps<P>): Promise<ImportResult> {
  const total = nodes.length + 1;
  let done = 0;
  const result: ImportResult = { created: 0, failed: [], rootId: null };

  const root = await deps.create(null, rootTitle, "");
  const rootId = deps.idOf(root);
  result.rootId = rootId;
  deps.onProgress?.(++done, total);

  const ids = new Map<string, string>();
  for (const node of nodes) {
    const parentId = (node.parentKey && ids.get(node.parentKey)) || rootId;
    try {
      const page = await deps.create(parentId, node.title, node.markdown);
      ids.set(node.key, deps.idOf(page));
      result.created += 1;
    } catch {
      result.failed.push({ title: node.title, key: node.key });
    }
    deps.onProgress?.(++done, total);
  }
  return result;
}
