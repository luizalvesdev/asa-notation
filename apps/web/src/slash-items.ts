import type { Editor } from "@tiptap/react";

export interface SlashItem {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  run: (editor: Editor) => void;
}

const chain = (editor: Editor) => editor.chain().focus();

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "text",
    title: "Texto",
    description: "Parágrafo simples",
    keywords: ["paragrafo", "text", "p"],
    run: (editor) => chain(editor).setParagraph().run(),
  },
  {
    id: "h1",
    title: "Título 1",
    description: "Título grande",
    keywords: ["h1", "heading", "titulo"],
    run: (editor) => chain(editor).setHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    title: "Título 2",
    description: "Título médio",
    keywords: ["h2", "heading", "titulo"],
    run: (editor) => chain(editor).setHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    title: "Título 3",
    description: "Título pequeno",
    keywords: ["h3", "heading", "titulo"],
    run: (editor) => chain(editor).setHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    title: "Lista",
    description: "Lista com marcadores",
    keywords: ["bullet", "ul", "marcadores", "lista"],
    run: (editor) => chain(editor).toggleBulletList().run(),
  },
  {
    id: "ordered",
    title: "Lista numerada",
    description: "Lista com números",
    keywords: ["ordered", "ol", "numerada", "numeros"],
    run: (editor) => chain(editor).toggleOrderedList().run(),
  },
  {
    id: "task",
    title: "Lista de tarefas",
    description: "Tarefas com caixa de seleção",
    keywords: ["todo", "task", "checkbox", "tarefa", "checklist"],
    run: (editor) => chain(editor).toggleTaskList().run(),
  },
  {
    id: "quote",
    title: "Citação",
    description: "Trecho destacado",
    keywords: ["quote", "blockquote", "citacao"],
    run: (editor) => chain(editor).toggleBlockquote().run(),
  },
  {
    id: "code",
    title: "Bloco de código",
    description: "Código em fonte monoespaçada",
    keywords: ["code", "codigo", "pre"],
    run: (editor) => chain(editor).toggleCodeBlock().run(),
  },
  {
    id: "divider",
    title: "Divisor",
    description: "Linha horizontal",
    keywords: ["divider", "hr", "linha", "separador"],
    run: (editor) => chain(editor).setHorizontalRule().run(),
  },
];

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function filterSlashItems(query: string, items: SlashItem[] = SLASH_ITEMS): SlashItem[] {
  const needle = normalize(query.trim());
  if (needle === "") return items;
  const matches = items.filter(
    (item) => normalize(item.title).includes(needle) || item.keywords.some((k) => normalize(k).includes(needle)),
  );
  const startsWith = (item: SlashItem) => normalize(item.title).startsWith(needle);
  return [...matches.filter(startsWith), ...matches.filter((item) => !startsWith(item))];
}
