import { Extension, Node, ReactNodeViewRenderer, mergeAttributes } from "@tiptap/react";
import { MermaidBlock } from "./MermaidBlock";
import { DEFAULT_DIAGRAM } from "./mermaid-render";
import type { TreeNode } from "./pages-types";

/** Caixa de destaque com ícone, que guarda blocos dentro. */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: 'div[data-type="callout"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout", class: "b-callout" }), 0],
});

/** Diagrama Mermaid. O código vive no atributo `code`. */
export const Mermaid = Node.create({
  name: "mermaid",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      code: {
        default: DEFAULT_DIAGRAM,
        parseHTML: (el) => el.getAttribute("data-code") ?? DEFAULT_DIAGRAM,
        renderHTML: (attrs) => ({ "data-code": String(attrs.code ?? "") }),
      },
    };
  },
  parseHTML: () => [{ tag: 'div[data-type="mermaid"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "mermaid" })],
  addNodeView() {
    // Eventos dentro do campo de código ficam com ele, não com o editor.
    return ReactNodeViewRenderer(MermaidBlock, { stopEvent: ({ event }) => event.target instanceof HTMLTextAreaElement });
  },
});

/** Colunas lado a lado. Cada coluna guarda blocos; em tela estreita viram uma pilha (CSS). */
export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-type="column"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "column", class: "doc-col" }), 0],
});

export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column{2,4}",
  defining: true,
  parseHTML: () => [{ tag: 'div[data-type="columns"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "columns", class: "doc-cols" }), 0],
});

/** Cartão de link (marcador): mostra o endereço e abre em nova aba. Não carrega a página de destino. */
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      url: { default: "", parseHTML: (el) => el.getAttribute("data-url") ?? "", renderHTML: (a) => ({ "data-url": String(a.url ?? "") }) },
      title: { default: "", parseHTML: (el) => el.getAttribute("data-title") ?? "", renderHTML: (a) => ({ "data-title": String(a.title ?? "") }) },
    };
  },
  parseHTML: () => [{ tag: 'div[data-type="embed"]' }],
  renderHTML: ({ HTMLAttributes, node }) => {
    const url = String(node.attrs.url ?? "");
    const label = String(node.attrs.title || hostOf(url) || url);
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "embed", class: "b-embed" }), ["a", { href: url, target: "_blank", rel: "noopener noreferrer nofollow", class: "embed-link" }, label], ["span", { class: "embed-host" }, hostOf(url) || url]];
  },
});

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export interface UiStorage {
  /** Páginas disponíveis para `[[` e `@`. */
  pages: TreeNode[];
  /** Pede ao Editor que abra o campo de URL da imagem. */
  askImage: (() => void) | null;
  /** Pede ao Editor que abra o campo de endereço do cartão de link. */
  askEmbed: (() => void) | null;
}

/** Guarda no editor o que os menus precisam (lista de páginas, ação de imagem). */
export const Ui = Extension.create<unknown, UiStorage>({
  name: "ui",
  addStorage: () => ({ pages: [], askImage: null, askEmbed: null }),
});

export const uiOf = (editor: { storage: object }): UiStorage => (editor.storage as unknown as { ui: UiStorage }).ui;
