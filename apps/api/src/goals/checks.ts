import { normalizeSourceUrl } from "../clips/url.js";

type Node = { type?: unknown; text?: unknown; attrs?: Record<string, unknown>; marks?: { type?: unknown; attrs?: { href?: unknown } }[]; content?: unknown };

/** Texto corrido de um nó do editor. */
export function nodeText(node: unknown): string {
  if (typeof node !== "object" || node === null) return "";
  const n = node as Node;
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (n.type === "hardBreak") return "\n";
  return Array.isArray(n.content) ? n.content.map(nodeText).join("") : "";
}

/** O título de um item de tarefa: o primeiro parágrafo. */
export function itemTitle(item: unknown): unknown {
  const content = typeof item === "object" && item !== null ? (item as Node).content : undefined;
  return Array.isArray(content) ? content[0] : undefined;
}

/** A anotação de um item de tarefa: o atributo `note` ("" se não há). */
export function itemNote(item: unknown): string {
  const note = typeof item === "object" && item !== null ? (item as Node).attrs?.note : undefined;
  return typeof note === "string" ? note.trim() : "";
}

/** Primeiro link (normalizado) dentro de um nó, ou null. */
export function firstLink(node: unknown): string | null {
  if (typeof node !== "object" || node === null) return null;
  const n = node as Node;
  const mark = n.marks?.find((m) => m.type === "link" && typeof m.attrs?.href === "string");
  if (mark) return normalizeSourceUrl(mark.attrs!.href);
  if (Array.isArray(n.content)) for (const child of n.content) {
    const found = firstLink(child);
    if (found) return found;
  }
  return null;
}

/**
 * Conta os checkboxes (taskItem) de um documento do editor, em qualquer profundidade.
 * Item cujo link aponta para uma página em `skip` não conta: ele vale pelas aulas da página dele.
 */
export function countChecks(body: unknown, skip: ReadonlySet<string> = new Set()): { total: number; done: number } {
  let total = 0;
  let done = 0;
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const n = node as Node;
    if (n.type === "taskItem") {
      const link = skip.size > 0 ? firstLink(itemTitle(n)) : null;
      if (!(link && skip.has(link))) {
        total++;
        if (n.attrs?.checked === true) done++;
      }
    }
    if (Array.isArray(n.content)) for (const child of n.content) walk(child);
  };
  walk(body);
  return { total, done };
}

/** Texto dos primeiros `limit` checkboxes ainda não marcados, na ordem do documento (ex.: os próximos cursos). */
export function uncheckedItems(body: unknown, limit: number): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (out.length >= limit || typeof node !== "object" || node === null) return;
    const n = node as Node;
    if (n.type === "taskItem" && n.attrs?.checked !== true) {
      const text = nodeText(itemTitle(n)).replace(/\s+/g, " ").trim();
      if (text !== "") out.push(text.slice(0, 160));
    }
    if (Array.isArray(n.content)) for (const child of n.content) walk(child);
  };
  walk(body);
  return out;
}
