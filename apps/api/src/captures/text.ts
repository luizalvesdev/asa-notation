const MAX_TAGS = 10;
const MAX_TITLE = 120;

/** `#performance` e `#api-v2` viram tags em minúsculas, sem repetir. Não confunde com `C#` ou `a#b`. */
export function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(/(?<![\p{L}\p{N}_&])#([\p{L}\p{N}][\p{L}\p{N}_-]{0,39})/gu)) {
    tags.add(match[1]!.toLowerCase());
    if (tags.size >= MAX_TAGS) break;
  }
  return [...tags];
}

/** Primeira linha vira o título da página; o resto, o corpo. */
export function captureToPage(text: string): { title: string; body: unknown | null } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines[0] ?? "";
  const title = first.length > MAX_TITLE ? `${first.slice(0, MAX_TITLE - 1).trimEnd()}…` : first;
  // Título cortado: o texto inteiro da primeira linha continua no corpo.
  const rest = first.length > MAX_TITLE ? lines : lines.slice(1);
  const body =
    rest.length === 0
      ? null
      : { type: "doc", content: rest.map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] })) };
  return { title, body };
}
