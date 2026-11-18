import type { Editor } from "@tiptap/react";
import { uiOf } from "./editor-nodes";
import { DEFAULT_DIAGRAM } from "./mermaid-render";

export type SlashGroup = "Básico" | "Listas" | "Blocos" | "Mídia";

export interface SlashItem {
  id: string;
  group: SlashGroup;
  title: string;
  description: string;
  /** Atalho de Markdown que faz o mesmo, mostrado à direita. */
  shortcut?: string;
  keywords: string[];
  run: (editor: Editor) => void;
}

const chain = (editor: Editor) => editor.chain().focus();

export const SLASH_ITEMS: SlashItem[] = [
  { id: "text", group: "Básico", title: "Texto", description: "Parágrafo simples", keywords: ["paragrafo", "text", "p"], run: (e) => chain(e).setParagraph().run() },
  { id: "h1", group: "Básico", title: "Título 1", description: "Título grande", shortcut: "#", keywords: ["h1", "heading", "titulo"], run: (e) => chain(e).setHeading({ level: 1 }).run() },
  { id: "h2", group: "Básico", title: "Título 2", description: "Título médio", shortcut: "##", keywords: ["h2", "heading", "titulo"], run: (e) => chain(e).setHeading({ level: 2 }).run() },
  { id: "h3", group: "Básico", title: "Título 3", description: "Título pequeno", shortcut: "###", keywords: ["h3", "heading", "titulo"], run: (e) => chain(e).setHeading({ level: 3 }).run() },
  { id: "bullet", group: "Listas", title: "Lista", description: "Lista com marcadores", shortcut: "-", keywords: ["bullet", "ul", "marcadores", "lista"], run: (e) => chain(e).toggleBulletList().run() },
  { id: "ordered", group: "Listas", title: "Lista numerada", description: "Lista com números", shortcut: "1.", keywords: ["ordered", "ol", "numerada", "numeros"], run: (e) => chain(e).toggleOrderedList().run() },
  { id: "task", group: "Listas", title: "Lista de tarefas", description: "Itens com caixa de seleção", shortcut: "[ ]", keywords: ["todo", "task", "checkbox", "tarefa", "checklist"], run: (e) => chain(e).toggleTaskList().run() },
  { id: "quote", group: "Blocos", title: "Citação", description: "Trecho destacado", shortcut: ">", keywords: ["quote", "blockquote", "citacao"], run: (e) => chain(e).toggleBlockquote().run() },
  { id: "code", group: "Blocos", title: "Bloco de código", description: "Código em fonte monoespaçada", shortcut: "```", keywords: ["code", "codigo", "pre"], run: (e) => chain(e).toggleCodeBlock().run() },
  { id: "callout", group: "Blocos", title: "Destaque", description: "Caixa de aviso ou nota", keywords: ["callout", "destaque", "aviso", "nota", "caixa"], run: (e) => chain(e).toggleWrap("callout").run() },
  { id: "toggle", group: "Blocos", title: "Bloco recolhível", description: "Esconde e mostra conteúdo", keywords: ["toggle", "details", "recolhivel", "expandir", "sanfona"], run: (e) => chain(e).setDetails().run() },
  { id: "table", group: "Blocos", title: "Tabela", description: "Tabela simples de 3 colunas", keywords: ["table", "tabela", "grade"], run: (e) => chain(e).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: "mermaid", group: "Mídia", title: "Diagrama (Mermaid)", description: "Fluxo, sequência e mais, com código", keywords: ["mermaid", "diagrama", "fluxograma", "grafico"], run: (e) => chain(e).insertContent({ type: "mermaid", attrs: { code: DEFAULT_DIAGRAM } }).run() },
  { id: "image", group: "Mídia", title: "Imagem", description: "Imagem a partir de um endereço", keywords: ["image", "imagem", "foto", "figura"], run: (e) => uiOf(e).askImage?.() },
  { id: "divider", group: "Blocos", title: "Divisor", description: "Linha horizontal", shortcut: "---", keywords: ["divider", "hr", "linha", "separador"], run: (e) => chain(e).setHorizontalRule().run() },
];

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Filtra por título e palavras-chave, sem diferenciar acento. Quem começa com o termo vem primeiro. */
export function filterSlashItems(query: string, items: SlashItem[] = SLASH_ITEMS): SlashItem[] {
  const needle = normalize(query.trim());
  if (needle === "") return items;
  const matches = items.filter(
    (item) => normalize(item.title).includes(needle) || item.keywords.some((k) => normalize(k).includes(needle)),
  );
  const startsWith = (item: SlashItem) => normalize(item.title).startsWith(needle);
  return [...matches.filter(startsWith), ...matches.filter((item) => !startsWith(item))];
}
