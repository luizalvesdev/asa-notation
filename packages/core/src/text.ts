export function extractText(doc: unknown): string {
  const parts: string[] = [];

  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const { type, text, content } = node as { type?: unknown; text?: unknown; content?: unknown };
    if (typeof text === "string") parts.push(text);
    if (Array.isArray(content)) for (const child of content) walk(child);
    if (typeof type === "string" && type !== "text" && type !== "doc") parts.push(" ");
  };

  walk(doc);
  return parts.join("").replace(/\s+/g, " ").trim();
}
