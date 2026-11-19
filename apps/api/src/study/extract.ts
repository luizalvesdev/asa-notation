export interface Candidate {
  kind: "basic" | "cloze";
  front: string;
  back: string;
  /** Texto normalizado do trecho: identifica o card para não duplicar. */
  sourceKey: string;
}

const MAX_CANDIDATES = 200;
/** Marca o card inverso na chave de origem, para não duplicar nem colidir com o card de ida. */
export const REVERSE_SUFFIX = " ⇄";
const MAX_FIELD = 2000;

/** Texto de cada parágrafo e título do documento do editor, em ordem. */
export function blockTexts(doc: unknown): string[] {
  const blocks: string[] = [];

  const textOf = (node: unknown): string => {
    if (typeof node !== "object" || node === null) return "";
    const { type, text, content } = node as { type?: unknown; text?: unknown; content?: unknown };
    if (typeof text === "string") return text;
    if (type === "hardBreak") return " ";
    return Array.isArray(content) ? content.map(textOf).join("") : "";
  };

  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const { type, content } = node as { type?: unknown; content?: unknown };
    if (type === "paragraph" || type === "heading") {
      const text = textOf(node).replace(/\s+/g, " ").trim();
      if (text) blocks.push(text);
      return;
    }
    if (Array.isArray(content)) for (const child of content) walk(child);
  };

  walk(doc);
  return blocks;
}

/**
 * Procura cards no texto da página:
 *   "Pergunta :: resposta"            -> card básico
 *   "Pergunta ::: resposta"           -> card básico nos dois sentidos (o inverso pergunta pela resposta)
 *   "Texto com {{lacuna}} no meio"    -> card de lacuna
 */
export function extractCards(blocks: string[]): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const found: Candidate[] = [];
    const split = block.indexOf("::");
    if (split > 0) {
      const both = block.startsWith(":::", split);
      const front = block.slice(0, split).trim();
      const back = block.slice(split + (both ? 3 : 2)).trim();
      if (front && back && front.length <= MAX_FIELD && back.length <= MAX_FIELD) {
        found.push({ kind: "basic", front, back, sourceKey: block });
        if (both) found.push({ kind: "basic", front: back, back: front, sourceKey: `${block}${REVERSE_SUFFIX}` });
      }
    } else if (/\{\{[^{}]+\}\}/.test(block) && block.length <= MAX_FIELD) {
      found.push({ kind: "cloze", front: block, back: "", sourceKey: block });
    }
    for (const candidate of found) {
      if (seen.has(candidate.sourceKey) || out.length >= MAX_CANDIDATES) continue;
      seen.add(candidate.sourceKey);
      out.push(candidate);
    }
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}
