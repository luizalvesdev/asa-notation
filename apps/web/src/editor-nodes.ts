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

export interface UiStorage {
  /** Páginas disponíveis para `[[` e `@`. */
  pages: TreeNode[];
  /** Pede ao Editor que abra o campo de URL da imagem. */
  askImage: (() => void) | null;
}

/** Guarda no editor o que os menus precisam (lista de páginas, ação de imagem). */
export const Ui = Extension.create<unknown, UiStorage>({
  name: "ui",
  addStorage: () => ({ pages: [], askImage: null }),
});

export const uiOf = (editor: { storage: object }): UiStorage => (editor.storage as unknown as { ui: UiStorage }).ui;
