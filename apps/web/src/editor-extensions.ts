import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import type { Extensions } from "@tiptap/react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlockView } from "./CodeBlockView";
import StarterKit from "@tiptap/starter-kit";
import { lowlight } from "./code-highlight";
import { Callout, Column, Columns, Embed, Mermaid, Ui } from "./editor-nodes";

/** Item de tarefa com anotação: o texto fica no atributo `note` (vazio = sem nota). */
const NoteTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      note: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-note") ?? "",
        renderHTML: (attrs: Record<string, unknown>) => (typeof attrs.note === "string" && attrs.note !== "" ? { "data-note": attrs.note } : {}),
      },
    };
  },
});

/** Os blocos que a página sabe desenhar. Vale para edição e para leitura (histórico, link público). */
export function contentExtensions(): Extensions {
  return [
    // Link interno só navega com Ctrl/Cmd+clique (ver Editor); nunca abre sozinho ao editar.
    // Linha de destino ao arrastar um bloco: na cor de destaque e mais grossa, para ver bem onde ele vai cair.
    StarterKit.configure({ link: { openOnClick: false }, codeBlock: false, dropcursor: { color: "var(--accent)", width: 3, class: "drop-line" } }),
    CodeBlockLowlight.extend({ addNodeView: () => ReactNodeViewRenderer(CodeBlockView) }).configure({ lowlight, defaultLanguage: null }),
    TaskList,
    NoteTaskItem.configure({ nested: true }),
    Details.configure({ persist: true }),
    DetailsSummary,
    DetailsContent,
    Table,
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({ allowBase64: false }),
    Callout,
    Column,
    Columns,
    Embed,
    Mermaid,
    Ui,
  ];
}
