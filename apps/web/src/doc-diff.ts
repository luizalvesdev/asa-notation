/** Texto de cada bloco do documento, em ordem (parágrafos, títulos, itens de lista, linhas de tabela, diagramas). */
export function blockLines(doc: unknown): string[] {
  const lines: string[] = [];

  const textOf = (node: unknown): string => {
    if (typeof node !== "object" || node === null) return "";
    const n = node as { type?: string; text?: string; content?: unknown[]; attrs?: Record<string, unknown> };
    if (typeof n.text === "string") return n.text;
    if (n.type === "hardBreak") return " ";
    if (n.type === "image") return `[imagem${typeof n.attrs?.alt === "string" && n.attrs.alt ? `: ${n.attrs.alt}` : ""}]`;
    if (n.type === "mermaid") return `[diagrama] ${String(n.attrs?.code ?? "").split("\n")[0] ?? ""}`;
    return Array.isArray(n.content) ? n.content.map(textOf).join("") : "";
  };

  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const n = node as { type?: string; content?: unknown[] };
    if (n.type === "paragraph" || n.type === "heading" || n.type === "codeBlock" || n.type === "detailsSummary" || n.type === "image" || n.type === "mermaid") {
      const text = textOf(node).replace(/\s+/g, " ").trim();
      if (text) lines.push(text);
      return;
    }
    if (Array.isArray(n.content)) for (const child of n.content) walk(child);
  };

  walk(doc);
  return lines;
}

export interface DiffLine {
  type: "same" | "add" | "del";
  text: string;
}

/** Diferença linha a linha (subsequência comum mais longa): o que saiu de `from` e o que entrou em `to`. */
export function diffLines(from: readonly string[], to: readonly string[]): DiffLine[] {
  const n = from.length;
  const m = to.length;
  // lcs[i][j] = tamanho da maior subsequência comum de from[i..] e to[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = from[i] === to[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (from[i] === to[j]) {
      out.push({ type: "same", text: from[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ type: "del", text: from[i++]! });
    } else {
      out.push({ type: "add", text: to[j++]! });
    }
  }
  while (i < n) out.push({ type: "del", text: from[i++]! });
  while (j < m) out.push({ type: "add", text: to[j++]! });
  return out;
}
