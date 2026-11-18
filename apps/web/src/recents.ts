import { useEffect, useState } from "react";
import type { TreeNode } from "./pages-types";

const KEY = "asa.recents";
const MAX = 8;

/** Põe `id` no começo da lista, sem repetir e sem passar de `max`. */
export function pushRecent(list: readonly string[], id: string, max = MAX): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
}

/** Páginas abertas há pouco, da mais nova para a mais antiga. Some o que foi apagado. */
export function useRecents(nodes: readonly TreeNode[], currentPageId: string | null): TreeNode[] {
  const [ids, setIds] = useState<string[]>(read);

  useEffect(() => {
    if (!currentPageId) return;
    setIds((cur) => {
      if (cur[0] === currentPageId) return cur;
      const next = pushRecent(cur, currentPageId);
      write(next);
      return next;
    });
  }, [currentPageId]);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  return ids.map((id) => byId.get(id)).filter((n): n is TreeNode => !!n);
}
