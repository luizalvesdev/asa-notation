/** Texto puro de um documento do editor (para a busca). */
export function extractText(doc: unknown): string {
  const parts: string[] = [];

  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const { type, text, content, attrs } = node as { type?: unknown; text?: unknown; content?: unknown; attrs?: { note?: unknown } };
    if (typeof text === "string") parts.push(text);
    // A anotação de um checkbox também entra na busca.
    if (type === "taskItem" && typeof attrs?.note === "string" && attrs.note !== "") parts.push(` ${attrs.note} `);
    if (Array.isArray(content)) for (const child of content) walk(child);
    if (typeof type === "string" && type !== "text" && type !== "doc") parts.push(" ");
  };

  walk(doc);
  return parts.join("").replace(/\s+/g, " ").trim();
}

/** Forma canônica de um título para casar links: sem espaços sobrando e sem diferenciar maiúsculas. */
export function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().toLowerCase();
}

const LINK_PATTERN = /\[\[([^\[\]\n]{1,200})\]\]/g;
const MAX_LINKS = 200;

/** Títulos citados como [[Título]] no texto, normalizados e sem repetição. */
export function extractLinks(text: string): string[] {
  const titles = new Set<string>();
  for (const match of text.matchAll(LINK_PATTERN)) {
    const title = normalizeTitle(match[1] ?? "");
    if (title) titles.add(title);
    if (titles.size >= MAX_LINKS) break;
  }
  return [...titles];
}
