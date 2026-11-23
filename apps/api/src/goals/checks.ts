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
