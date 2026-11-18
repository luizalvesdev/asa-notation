import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Callout, Mermaid, Ui } from "./editor-nodes";

/** Os blocos que a página sabe desenhar. Vale para edição e para leitura (histórico, link público). */
export function contentExtensions(): Extensions {
  return [
    // Link interno só navega com Ctrl/Cmd+clique (ver Editor); nunca abre sozinho ao editar.
    StarterKit.configure({ link: { openOnClick: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Details.configure({ persist: true }),
    DetailsSummary,
    DetailsContent,
    Table,
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({ allowBase64: false }),
    Callout,
    Mermaid,
    Ui,
  ];
}
