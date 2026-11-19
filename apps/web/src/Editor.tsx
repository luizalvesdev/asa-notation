import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { quietly, startBlockSort } from "./block-sort";
import { contentExtensions } from "./editor-extensions";
import { FormatMenu } from "./FormatMenu";
import { uiOf } from "./editor-nodes";
import { PageMention, WikiLink } from "./page-link";
import type { TreeNode } from "./pages-types";
import { SlashCommand } from "./slash-command";

interface EditorProps {
  initial: unknown | null;
  onChange: (doc: JSONContent) => void;
  /** Recebe o foco quando o título pede (Enter no título). */
  focusSignal: number;
  /** Páginas para linkar com `[[` e `@`. */
  pages: TreeNode[];
  /** A própria página fica fora da lista de links. */
  selfId: string;
}

const GRIP = "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01";

export function Editor({ initial, onChange, focusSignal, pages, selfId }: EditorProps) {
  const [target, setTarget] = useState<{ pos: number; size: number } | null>(null);
  const [askingImage, setAskingImage] = useState(false);
  const [askingEmbed, setAskingEmbed] = useState(false);

  const editor = useEditor({
    extensions: [
      ...contentExtensions(),
      Placeholder.configure({ placeholder: "Escreva algo, / para os blocos, [[ ou @ para linkar uma página…" }),
      SlashCommand,
      WikiLink,
      PageMention,
    ],
    content: (initial as JSONContent | null) ?? undefined,
    editorProps: {
      attributes: { "aria-label": "Conteúdo da página" },
      handleClick: (_view, _pos, event) => {
        // Link para outra página: Ctrl/Cmd+clique abre (um clique simples só põe o cursor, para dar para editar).
        const href = (event.target as HTMLElement).closest("a")?.getAttribute("href");
        if (href?.startsWith("#/") && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          location.hash = href;
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON()),
  });

  const linkable = useMemo(() => pages.filter((p) => p.id !== selfId), [pages, selfId]);
  useEffect(() => {
    if (!editor) return;
    uiOf(editor).pages = linkable;
    uiOf(editor).askImage = () => setAskingImage(true);
    uiOf(editor).askEmbed = () => setAskingEmbed(true);
  }, [editor, linkable]);

  useEffect(() => {
    if (focusSignal > 0) editor?.commands.focus("start");
  }, [focusSignal, editor]);

  // Mouse na faixa à esquerda do texto (onde ficam a alça e o +) conta como "sobre o bloco" daquela altura:
  // a alça aparece sem precisar mirar no texto. Saiu da página: tira o destaque.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const area = dom.closest(".page") ?? dom;
    const clear = () => quietly(editor.view, () => dom.querySelectorAll(".blk-hover").forEach((el) => el.classList.remove("blk-hover")));
    const onMove = (e: Event) => {
      const m = e as MouseEvent;
      if (document.body.classList.contains("block-sorting") || (m.target as Element | null)?.closest?.(".dh")) return;
      const box = dom.getBoundingClientRect();
      if (m.clientX >= box.left || m.clientX < box.left - 72 || m.clientY < box.top || m.clientY > box.bottom) return;
      dom.dispatchEvent(new MouseEvent("mousemove", { clientX: box.left + 4, clientY: m.clientY, bubbles: true }));
    };
    area.addEventListener("mouseleave", clear);
    area.addEventListener("mousemove", onMove);
    return () => {
      area.removeEventListener("mouseleave", clear);
      area.removeEventListener("mousemove", onMove);
    };
  }, [editor]);

  /** Alça: blocos do nível de cima viram lista reordenável (com animação); os de dentro usam o arrastar nativo. */
  const sorting = useRef(false);
  const onGripDown = (e: React.PointerEvent) => {
    if (!editor || !target || e.button !== 0) return;
    const $pos = editor.state.doc.resolve(target.pos);
    if ($pos.depth !== 0) return;
    if (startBlockSort(editor, $pos.index(0), e.nativeEvent)) {
      e.preventDefault();
      sorting.current = true;
      // O elemento da alça é "draggable" (arrastar nativo): desliga enquanto a lista reordenável cuida do arrasto.
      const handle = (e.currentTarget as HTMLElement).closest<HTMLElement>('[draggable="true"]');
      handle?.setAttribute("draggable", "false");
      const reset = () => {
        sorting.current = false;
        handle?.setAttribute("draggable", "true");
        window.removeEventListener("pointerup", reset);
        window.removeEventListener("pointercancel", reset);
      };
      window.addEventListener("pointerup", reset);
      window.addEventListener("pointercancel", reset);
    }
  };

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
        <DragHandle
          editor={editor}
          nested
          onNodeChange={({ node, pos }) => {
            setTarget(node ? { pos, size: node.nodeSize } : null);
            // Destaca o bloco sob o mouse: mostra a área inteira que a alça move.
            const view = editor.view;
            const dom = node && pos >= 0 ? view.nodeDOM(pos) : null;
            quietly(view, () => {
              view.dom.querySelectorAll(".blk-hover").forEach((el) => el.classList.remove("blk-hover"));
              if (dom instanceof HTMLElement) dom.classList.add("blk-hover");
            });
          }}
        >
          <div
            className="dh"
            onDragStartCapture={(e) => {
              // A lista reordenável já está cuidando deste arrasto: cancela o nativo.
              if (sorting.current) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Adicionar bloco abaixo" onClick={addBelow}>
              <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <span className="dh-grip" role="img" aria-label="Arrastar bloco" title="Arraste para mover" onPointerDown={onGripDown}>
              <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={{ strokeWidth: 3 }}>
                <path d={GRIP} />
              </svg>
            </span>
          </div>
        </DragHandle>
      )}
      {editor && <FormatMenu editor={editor} />}
      <EditorContent editor={editor} />
      {askingEmbed && editor && (
        <UrlDialog
          title="Inserir link com cartão"
          label="Endereço do site"
          withTitle
          onCancel={() => setAskingEmbed(false)}
          onInsert={(url, title) => {
            editor.chain().focus().insertContent({ type: "embed", attrs: { url, title } }).run();
            setAskingEmbed(false);
          }}
        />
      )}
      {askingImage && editor && (
        <ImageDialog
          onCancel={() => setAskingImage(false)}
          onInsert={(src, alt) => {
            editor.chain().focus().setImage({ src, alt }).run();
            setAskingImage(false);
          }}
        />
      )}
    </>
  );
}

/** Só endereços http(s): nada de javascript: ou data: dentro da página. */
export function validImageUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function ImageDialog({ onInsert, onCancel }: { onInsert: (src: string, alt: string) => void; onCancel: () => void }) {
  return <UrlDialog title="Inserir imagem" label="Endereço da imagem" altLabel="Descrição (opcional)" hint="A imagem continua no site de origem." onInsert={onInsert} onCancel={onCancel} />;
}

function UrlDialog({ title, label, altLabel, withTitle, hint, onInsert, onCancel }: { title: string; label: string; altLabel?: string; withTitle?: boolean; hint?: string; onInsert: (url: string, second: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const [alt, setAlt] = useState("");
  const url = validImageUrl(value);
  return (
    <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="modal card ds"
        role="dialog"
        aria-label={title}
        style={{ padding: 18, width: 420, maxWidth: "calc(100% - 24px)", display: "flex", flexDirection: "column", gap: 12 }}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        onSubmit={(e) => {
          e.preventDefault();
          if (url) onInsert(url, alt.trim());
        }}
      >
        <b style={{ fontWeight: 600 }}>{title}</b>
        <div className="field">
          <label className="label" htmlFor="img-url">{label}</label>
          <input id="img-url" className={`inp${value && !url ? " err" : ""}`} autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…" />
          <span className="help">{value && !url ? "Use um endereço começando com http:// ou https://." : hint ?? "Só endereços http:// ou https://."}</span>
        </div>
        {(altLabel || withTitle) && (
          <div className="field">
            <label className="label" htmlFor="img-alt">{altLabel ?? "Título (opcional)"}</label>
            <input id="img-alt" className="inp" value={alt} onChange={(e) => setAlt(e.target.value)} />
          </div>
        )}
        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-fan btn-sm" type="button" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-pri btn-sm" type="submit" disabled={!url}>Inserir</button>
        </div>
      </form>
    </div>
  );
}
