/**
 * Markdown (o que um assistente costuma escrever) para o documento do editor:
 * títulos, parágrafos, listas, tarefas, listas numeradas, citação, divisor, blocos de código,
 * blocos ```mermaid (viram diagramas), imagens http(s) sozinhas na linha e, dentro do texto, **negrito**, *itálico*, `código` e [links](https://...).
 */
type Node = Record<string, unknown>;

const MAX_INLINE = 20_000;

/** Texto com marcas em nós de texto do editor. Só http(s) e mailto viram link. */
export function inlineNodes(text: string): Node[] {
  if (text === "") return [];
  const out: Node[] = [];
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\))/g;
  let last = 0;
  const push = (value: string, marks?: Node[]) => value && out.push({ type: "text", text: value, ...(marks ? { marks } : {}) });
  for (const m of text.slice(0, MAX_INLINE).matchAll(pattern)) {
    push(text.slice(last, m.index));
    const token = m[0];
    if (m[1]) push(token.slice(1, -1), [{ type: "code" }]);
    else if (m[2]) push(token.slice(2, -2), [{ type: "bold" }]);
    else if (m[3]) push(token.slice(1, -1), [{ type: "italic" }]);
    else {
      const close = token.indexOf("](");
      push(token.slice(1, close), [{ type: "link", attrs: { href: token.slice(close + 2, -1) } }]);
    }
    last = m.index! + token.length;
  }
  push(text.slice(last));
  return out;
}

export function markdownToDoc(markdown: string): { type: "doc"; content: unknown[] } {
  const para = (value: string): Node => ({ type: "paragraph", content: inlineNodes(value) });
  const content: Node[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let list: { kind: "bullet" | "task" | "ordered"; items: Node[] } | null = null;
  let quote: string[] = [];
  let i = 0;

  const flushList = () => {
    if (!list) return;
    content.push(list.kind === "task" ? { type: "taskList", content: list.items } : { type: list.kind === "ordered" ? "orderedList" : "bulletList", content: list.items });
    list = null;
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    content.push({ type: "blockquote", content: quote.map(para) });
    quote = [];
  };
  const flush = () => {
    flushList();
    flushQuote();
  };

  while (i < lines.length) {
    const raw = lines[i]!;
    const line = raw.trimEnd();

    const fence = /^\s*(`{3,}|~{3,})\s*([\w+#-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1]![0] === "`" ? "`" : "~"}{${fence[1]!.length},}\\s*$`).test(lines[i]!)) body.push(lines[i++]!);
      i++; // fecha a cerca (ou o fim do texto)
      const code = body.join("\n");
      if (fence[2]!.toLowerCase() === "mermaid") content.push({ type: "mermaid", attrs: { code } });
      else content.push({ type: "codeBlock", attrs: { language: fence[2] || null }, content: code === "" ? [] : [{ type: "text", text: code }] });
      continue;
    }
    i++;

    const task = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const quoted = /^>\s?(.*)$/.exec(line);
    const image = /^\s*!\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)\s*$/.exec(line);

    if (task) {
      if (list?.kind !== "task") (flush(), (list = { kind: "task", items: [] }));
      list!.items.push({ type: "taskItem", attrs: { checked: task[1] !== " " }, content: [para(task[2]!)] });
    } else if (bullet) {
      if (list?.kind !== "bullet") (flush(), (list = { kind: "bullet", items: [] }));
      list!.items.push({ type: "listItem", content: [para(bullet[1]!)] });
    } else if (ordered) {
      if (list?.kind !== "ordered") (flush(), (list = { kind: "ordered", items: [] }));
      list!.items.push({ type: "listItem", content: [para(ordered[1]!)] });
    } else if (quoted) {
      flushList();
      quote.push(quoted[1]!);
    } else {
      flush();
      if (image) content.push({ type: "image", attrs: { src: image[2]!, alt: image[1] || null } });
      else if (heading) content.push({ type: "heading", attrs: { level: heading[1]!.length }, content: inlineNodes(heading[2]!) });
      else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) content.push({ type: "horizontalRule" });
      else if (line.trim() !== "") content.push(para(line));
    }
  }
  flush();
  return { type: "doc", content: content.length > 0 ? content : [para("")] };
}
