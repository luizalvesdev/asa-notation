/** Markdown simples (títulos, listas, tarefas, parágrafos) para o documento do editor. Pensado para texto de assistente. */
export function markdownToDoc(markdown: string): { type: "doc"; content: unknown[] } {
  const text = (value: string) => (value === "" ? [] : [{ type: "text", text: value }]);
  const paragraph = (value: string) => ({ type: "paragraph", content: text(value) });
  const content: unknown[] = [];
  let list: { kind: "bullet" | "task"; items: unknown[] } | null = null;

  const flush = () => {
    if (!list) return;
    content.push(list.kind === "task" ? { type: "taskList", content: list.items } : { type: "bulletList", content: list.items });
    list = null;
  };

  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const task = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (task) {
      if (list?.kind !== "task") {
        flush();
        list = { kind: "task", items: [] };
      }
      list.items.push({ type: "taskItem", attrs: { checked: task[1] !== " " }, content: [paragraph(task[2]!)] });
    } else if (bullet) {
      if (list?.kind !== "bullet") {
        flush();
        list = { kind: "bullet", items: [] };
      }
      list.items.push({ type: "listItem", content: [paragraph(bullet[1]!)] });
    } else {
      flush();
      if (heading) content.push({ type: "heading", attrs: { level: heading[1]!.length }, content: text(heading[2]!) });
      else if (line.trim() !== "") content.push(paragraph(line));
    }
  }
  flush();
  return { type: "doc", content: content.length > 0 ? content : [paragraph("")] };
}
