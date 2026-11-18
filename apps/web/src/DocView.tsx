import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { useEffect } from "react";
import { contentExtensions } from "./editor-extensions";

/** Documento só para leitura: histórico de versões e link público. Links internos navegam num clique. */
export function DocView({ doc, onLinkClick }: { doc: unknown | null; onLinkClick?: (href: string) => void }) {
  const editor = useEditor({
    editable: false,
    extensions: contentExtensions(),
    content: (doc as JSONContent | null) ?? undefined,
    editorProps: {
      attributes: { "aria-label": "Conteúdo da página (somente leitura)" },
      handleClick: (_view, _pos, event) => {
        const link = (event.target as HTMLElement).closest("a");
        const href = link?.getAttribute("href");
        if (href && onLinkClick) {
          event.preventDefault();
          onLinkClick(href);
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && doc) editor.commands.setContent(doc as JSONContent);
  }, [editor, doc]);

  return <EditorContent editor={editor} />;
}
