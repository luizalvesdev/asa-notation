import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState } from "react";
import { SlashCommand } from "./slash-command";

interface EditorProps {
  initial: unknown | null;
  onChange: (doc: JSONContent) => void;
  /** Recebe o foco quando o título pede (Enter no título). */
  focusSignal: number;
}

const GRIP = "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01";

export function Editor({ initial, onChange, focusSignal }: EditorProps) {
  const [target, setTarget] = useState<{ pos: number; size: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Escreva algo ou digite / para os blocos…" }),
      SlashCommand,
    ],
    content: (initial as JSONContent | null) ?? undefined,
    editorProps: { attributes: { "aria-label": "Conteúdo da página" } },
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON()),
  });

  useEffect(() => {
    if (focusSignal > 0) editor?.commands.focus("start");
  }, [focusSignal, editor]);

  /** Botão +: abre um parágrafo novo logo abaixo do bloco e já digita "/" para abrir o menu. */
  const addBelow = () => {
    if (!editor || !target) return;
    const end = target.pos + target.size;
    editor
      .chain()
      .insertContentAt(end, { type: "paragraph", content: [{ type: "text", text: "/" }] })
      .focus(end + 2)
      .run();
  };

  return (
    <>
      {editor && (
        <DragHandle editor={editor} nested onNodeChange={({ node, pos }) => setTarget(node ? { pos, size: node.nodeSize } : null)}>
          <div className="dh">
            <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Adicionar bloco abaixo" onClick={addBelow}>
              <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <span className="dh-grip" role="img" aria-label="Arrastar bloco" title="Arraste para mover">
              <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: 3 }}>
                <path d={GRIP} />
              </svg>
            </span>
          </div>
        </DragHandle>
      )}
      <EditorContent editor={editor} />
    </>
  );
}
