/**
 * Leitura e edição de páginas pelos assistentes: o corpo é o JSON do editor (ProseMirror). Aqui ele vira Markdown para o
 * modelo ler, e blocos novos entram no fim da página ou dentro de uma seção (sob um título), sem recriar o que já existe.
 */
type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Node[] };
export interface Doc { type: "doc"; content: Node[] }

export const emptyDoc = (): Doc => ({ type: "doc", content: [] });

export function asDoc(body: unknown): Doc {
  const doc = body as Doc | null | undefined;
  return doc && doc.type === "doc" && Array.isArray(doc.content) ? doc : emptyDoc();
}

function inline(nodes: Node[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return "\n";
      let text = n.text ?? inline(n.content);
      for (const mark of n.marks ?? []) {
        if (mark.type === "code") text = `\`${text}\``;
        else if (mark.type === "bold") text = `**${text}**`;
        else if (mark.type === "italic") text = `*${text}*`;
        else if (mark.type === "link" && typeof mark.attrs?.href === "string") text = `[${text}](${mark.attrs.href})`;
      }
      return text;
    })
    .join("");
}

function block(node: Node, indent = ""): string {
  switch (node.type) {
    case "paragraph":
      return `${indent}${inline(node.content)}`;
    case "heading":
      return `${"#".repeat(Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1))))} ${inline(node.content)}`;
    case "bulletList":
    case "orderedList":
    case "taskList":
      return (node.content ?? [])
        .map((item, i) => {
          const marker = node.type === "orderedList" ? `${i + 1}.` : node.type === "taskList" ? `- [${item.attrs?.checked ? "x" : " "}]` : "-";
          const [first, ...rest] = item.content ?? [];
          const head = `${indent}${marker} ${first ? inline(first.content) : ""}`;
          const nested = rest.map((n) => block(n, `${indent}  `)).join("\n");
          return nested ? `${head}\n${nested}` : head;
        })
        .join("\n");
    case "blockquote":
      return (node.content ?? []).map((n) => `> ${block(n)}`).join("\n");
    case "codeBlock":
      return `\`\`\`${String(node.attrs?.language ?? "")}\n${inline(node.content)}\n\`\`\``;
    case "mermaid":
      return `\`\`\`mermaid\n${String(node.attrs?.code ?? "")}\n\`\`\``;
    case "horizontalRule":
      return "---";
    default:
      // Tabelas, colunas, destaques...: só o texto, para o modelo saber que existem.
      return (node.content ?? []).map((n) => block(n)).filter(Boolean).join("\n") || inline(node.content);
  }
}

export function docToMarkdown(body: unknown): string {
  return asDoc(body).content.map((n) => block(n)).join("\n\n");
}

export interface Heading { level: number; text: string }

const headingText = (n: Node) => inline(n.content).trim();

export function outline(body: unknown): Heading[] {
  return asDoc(body).content.filter((n) => n.type === "heading").map((n) => ({ level: Number(n.attrs?.level ?? 1), text: headingText(n) }));
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Posição do título que combina com `section` (igual, ou um contém o outro), sem diferenciar acento e caixa. */
function findHeading(content: Node[], section: string): number {
  const wanted = fold(section.replace(/^#+\s*/, ""));
  if (wanted === "") return -1;
  const heads = content.map((n, i) => ({ n, i })).filter(({ n }) => n.type === "heading");
  const exact = heads.find(({ n }) => fold(headingText(n)) === wanted);
  if (exact) return exact.i;
  return heads.find(({ n }) => {
    const text = fold(headingText(n));
    return text !== "" && (text.includes(wanted) || wanted.includes(text));
  })?.i ?? -1;
}

/** Índice logo depois do último bloco da seção que começa em `start` (até o próximo título do mesmo nível ou acima). */
function sectionEnd(content: Node[], start: number): number {
  const level = Number(content[start]!.attrs?.level ?? 1);
  let i = start + 1;
  while (i < content.length && !(content[i]!.type === "heading" && Number(content[i]!.attrs?.level ?? 1) <= level)) i++;
  return i;
}

export type Placement = "section" | "end" | "new_section";

/** Acrescenta blocos. Sem `section`: no fim. Com `section`: no fim dessa seção, ou numa seção nova (título nível 2) no fim da página. */
export function appendBlocks(body: unknown, blocks: Node[], section?: string): { doc: Doc; placed: Placement; heading?: string } {
  const doc = asDoc(body);
  const content = [...doc.content];
  if (!section || section.trim() === "") return { doc: { type: "doc", content: [...content, ...blocks] }, placed: "end" };
  const at = findHeading(content, section);
  if (at === -1) {
    const heading = section.replace(/^#+\s*/, "").trim();
    return { doc: { type: "doc", content: [...content, { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: heading }] }, ...blocks] }, placed: "new_section", heading };
  }
  const end = sectionEnd(content, at);
  content.splice(end, 0, ...blocks);
  return { doc: { type: "doc", content }, placed: "section", heading: headingText(content[at]!) };
}

/** Troca o que há dentro de uma seção (o título fica). Devolve null se a seção não existe. */
export function replaceSection(body: unknown, section: string, blocks: Node[]): { doc: Doc; heading: string } | null {
  const content = [...asDoc(body).content];
  const at = findHeading(content, section);
  if (at === -1) return null;
  content.splice(at + 1, sectionEnd(content, at) - at - 1, ...blocks);
  return { doc: { type: "doc", content }, heading: headingText(content[at]!) };
}

/** Texto de uma seção em Markdown (o título e tudo até a próxima seção do mesmo nível). */
export function readSection(body: unknown, section: string): string | null {
  const content = asDoc(body).content;
  const at = findHeading(content, section);
  return at === -1 ? null : content.slice(at, sectionEnd(content, at)).map((n) => block(n)).join("\n\n");
}
