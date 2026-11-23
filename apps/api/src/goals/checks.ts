/** Conta os checkboxes (taskItem) de um documento do editor, em qualquer profundidade. */
export function countChecks(body: unknown): { total: number; done: number } {
  let total = 0;
  let done = 0;
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const n = node as { type?: unknown; attrs?: { checked?: unknown }; content?: unknown };
    if (n.type === "taskItem") {
      total++;
      if (n.attrs?.checked === true) done++;
    }
    if (Array.isArray(n.content)) for (const child of n.content) walk(child);
  };
  walk(body);
  return { total, done };
}

/** Texto dos primeiros `limit` checkboxes ainda não marcados, na ordem do documento (ex.: os próximos cursos). */
export function uncheckedItems(body: unknown, limit: number): string[] {
  const out: string[] = [];
  const textOf = (node: unknown): string => {
    if (typeof node !== "object" || node === null) return "";
    const n = node as { type?: unknown; text?: unknown; content?: unknown };
    if (n.type === "text" && typeof n.text === "string") return n.text;
    return Array.isArray(n.content) ? n.content.map(textOf).join("") : "";
  };
  const walk = (node: unknown) => {
    if (out.length >= limit || typeof node !== "object" || node === null) return;
    const n = node as { type?: unknown; attrs?: { checked?: unknown }; content?: unknown };
    if (n.type === "taskItem" && n.attrs?.checked !== true) {
      const text = textOf(n).replace(/\s+/g, " ").trim();
      if (text !== "") out.push(text.slice(0, 160));
    }
    if (Array.isArray(n.content)) for (const child of n.content) walk(child);
  };
  walk(body);
  return out;
}
