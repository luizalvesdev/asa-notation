/** Converte o documento do editor (Tiptap/ProseMirror) em Markdown. */

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}
interface Node {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Mark[];
  content?: Node[];
}

function applyMarks(text: string, marks: Mark[] = []): string {
  // O código domina: dentro dele não se escapa nem se aninha formatação.
  if (marks.some((m) => m.type === "code")) return `\`${text}\``;
  let out = text;
  for (const mark of marks) {
    if (mark.type === "bold") out = `**${out}**`;
    else if (mark.type === "italic") out = `*${out}*`;
    else if (mark.type === "strike") out = `~~${out}~~`;
    else if (mark.type === "link" && typeof mark.attrs?.href === "string") out = `[${out}](${mark.attrs.href})`;
  }
  return out;
}

function inline(nodes: Node[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === "text") return applyMarks(n.text ?? "", n.marks);
      if (n.type === "hardBreak") return "  \n";
      return inline(n.content);
    })
    .join("");
}

const indent = (text: string, spaces: number) =>
  text
    .split("\n")
    .map((line) => (line === "" ? line : " ".repeat(spaces) + line))
    .join("\n");

function listItem(item: Node, marker: string): string {
  const [first, ...rest] = item.content ?? [];
  const head = first ? block(first) : "";
  const tail = rest.map((child) => indent(block(child), marker.length));
  return [`${marker}${head}`, ...tail].join("\n");
}

function block(node: Node): string {
  switch (node.type) {
    case "paragraph":
      return inline(node.content);
    case "heading":
      return `${"#".repeat(Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1))))} ${inline(node.content)}`;
    case "bulletList":
      return (node.content ?? []).map((item) => listItem(item, "- ")).join("\n");
    case "orderedList": {
      const start = Number(node.attrs?.start ?? 1);
      return (node.content ?? []).map((item, i) => listItem(item, `${start + i}. `)).join("\n");
    }
    case "taskList":
      return (node.content ?? []).map((item) => listItem(item, item.attrs?.checked ? "- [x] " : "- [ ] ")).join("\n");
    case "blockquote":
      return blocks(node.content)
        .split("\n")
        .map((line) => (line === "" ? ">" : `> ${line}`))
        .join("\n");
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case "horizontalRule":
      return "---";
    case "callout":
      return ["> [!NOTE]", ...blocks(node.content).split("\n").map((line) => (line === "" ? ">" : `> ${line}`))].join("\n");
    case "details": {
      const summary = (node.content ?? []).find((n) => n.type === "detailsSummary");
      const content = (node.content ?? []).find((n) => n.type === "detailsContent");
      return `<details>\n<summary>${inline(summary?.content)}</summary>\n\n${blocks(content?.content)}\n\n</details>`;
    }
    case "table":
      return table(node);
    case "image": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      return src ? `![${alt}](${src})` : "";
    }
    case "mermaid":
      return `\`\`\`mermaid\n${String(node.attrs?.code ?? "")}\n\`\`\``;
    default:
      return node.content ? blocks(node.content) : (node.text ?? "");
  }
}

/** Tabela em Markdown (GFM): a primeira linha vira o cabeçalho. */
function table(node: Node): string {
  const rows = (node.content ?? []).map((row) => (row.content ?? []).map((cell) => blocks(cell.content).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim()));
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
  const line = (r: string[]) => `| ${pad(r).join(" | ")} |`;
  return [line(rows[0]!), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

function blocks(nodes: Node[] = []): string {
  return nodes.map(block).filter((text, i, all) => text !== "" || i < all.length - 1).join("\n\n");
}

export function docToMarkdown(doc: unknown): string {
  if (typeof doc !== "object" || doc === null) return "";
  const text = blocks((doc as Node).content);
  return text === "" ? "" : `${text}\n`;
}
