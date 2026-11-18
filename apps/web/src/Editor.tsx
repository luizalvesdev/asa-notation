import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

interface EditorProps {
  initial: unknown | null;
  onChange: (doc: JSONContent) => void;
  /** Recebe o foco quando o título pede (Enter no título). */
  focusSignal: number;
}

export function Editor({ initial, onChange, focusSignal }: EditorProps) {
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: "Escreva algo…" })],
    content: (initial as JSONContent | null) ?? undefined,
    editorProps: { attributes: { "aria-label": "Conteúdo da página" } },
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON()),
  });

  useEffect(() => {
    if (focusSignal > 0) editor?.commands.focus("start");
  }, [focusSignal, editor]);

  return <EditorContent editor={editor} />;
}
