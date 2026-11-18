import { generateJSON } from "@tiptap/html";
import type { JSONContent } from "@tiptap/react";
import { Marked } from "marked";
import { contentExtensions } from "./editor-extensions";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Título de página que um link relativo de Notion/Obsidian aponta: "Pagina%20abc123.md" -> "Pagina". */
export function linkedTitle(href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) return null;
  const file = decodeURIComponent(href.split(/[?#]/)[0] ?? "").split("/").pop() ?? "";
  if (!/\.(md|markdown)$/i.test(file)) return null;
  return file.replace(/\.(md|markdown)$/i, "").replace(/\s+[0-9a-f]{32}$/i, "").trim() || null;
}

/** Prepara o Markdown: `[[Título|apelido]]` vira `[[Título]]`. */
export function normalizeWikiLinks(md: string): string {
  return md.replace(/\[\[([^\]|\n]+)\|[^\]\n]*\]\]/g, "[[$1]]");
}

function createMarked(): Marked {
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      // Link relativo para outra nota vira [[Título]]; os demais relativos viram só o texto.
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        const title = linkedTitle(href);
        if (title) return `[[${escapeHtml(title)}]]`;
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) return `<a href="${escapeHtml(href)}">${text}</a>`;
        return text;
      },
      // Imagem local não vem junto: fica uma marca de texto no lugar.
      image({ href, text }) {
        return /^https?:\/\//i.test(href) ? `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}">` : `[imagem: ${escapeHtml(text || decodeURIComponent(href.split("/").pop() ?? ""))}]`;
      },
      code({ text, lang }) {
        if (lang === "mermaid") return `<div data-type="mermaid" data-code="${escapeHtml(text)}"></div>`;
        return `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${escapeHtml(text)}</code></pre>`;
      },
      list(token) {
        const body = token.items.map((item) => this.listitem(item)).join("");
        const isTasks = token.items.length > 0 && token.items.every((i) => i.task);
        if (isTasks) return `<ul data-type="taskList">${body}</ul>`;
        const tag = token.ordered ? "ol" : "ul";
        return `<${tag}${token.ordered && token.start !== 1 && token.start !== "" ? ` start="${token.start}"` : ""}>${body}</${tag}>`;
      },
      listitem(item) {
        const inner = this.parser.parse(item.tokens, !!item.loose);
        if (item.task) return `<li data-type="taskItem" data-checked="${item.checked ? "true" : "false"}">${inner}</li>`;
        return `<li>${inner}</li>`;
      },
      checkbox() {
        // A caixa de seleção já vai no atributo do item.
        return "";
      },
    },
  });
  return marked;
}

/** Markdown vira o documento do editor. Devolve null se não sobrar conteúdo. */
export function markdownToDoc(markdown: string): JSONContent | null {
  const html = createMarked().parse(normalizeWikiLinks(markdown)) as string;
  const doc = generateJSON(html, contentExtensions());
  const empty = !doc.content || doc.content.every((n: JSONContent) => n.type === "paragraph" && !n.content);
  return empty ? null : doc;
}
