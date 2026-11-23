import { useEffect, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { askConfirm } from "./confirm";
import { Presence } from "./Presence";
import { MAX_NOTE, noteOf, setNote, type NoteHover } from "./task-notes";

/** Cartão que aparece ao passar o mouse no ícone de anotação. Fica aberto enquanto o mouse estiver no ícone ou nele. */
export function NoteHoverCard({ hover, onEnter, onLeave }: { hover: NoteHover | null; onEnter: () => void; onLeave: () => void }) {
  const last = useRef<NoteHover | null>(null);
  const box = useRef<HTMLDivElement>(null);
  if (hover) last.current = hover;
  // Eventos nativos de entrada e saída: não dependem da ordem em que o React os entrega.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
    };
  });
  const h = hover ?? last.current;
  if (!h) return null;
  // Abaixo do ícone; se faltar espaço, acima. Sempre dentro da janela.
  const width = Math.min(340, window.innerWidth - 24);
  const left = Math.max(12, Math.min(h.rect.left - 8, window.innerWidth - width - 12));
  const below = h.rect.bottom + 8 + 160 < window.innerHeight;
  return (
    <Presence show={hover !== null}>
      <div
        ref={box}
        role="tooltip"
        className="task-note-pop"
        style={{ position: "fixed", left, width, ...(below ? { top: h.rect.bottom + 6 } : { bottom: window.innerHeight - h.rect.top + 6 }), zIndex: 60 }}
      >
        <span className="task-note-pop-t">Anotação · clique no ícone para editar</span>
        <div className="task-note-pop-b">{h.note}</div>
      </div>
    </Presence>
  );
}

/** Janela de edição da anotação de um checkbox. Esc cancela, Ctrl/Cmd+Enter salva. */
export function NoteModal({ editor, pos, onClose }: { editor: TiptapEditor; pos: number | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [had, setHad] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (pos === null) return;
    const info = noteOf(editor.view, pos);
    setText(info?.note ?? "");
    setTitle(info?.title ?? "");
    setHad(!!info?.note);
    requestAnimationFrame(() => {
      const el = area.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  }, [editor, pos]);

  useEffect(() => {
    if (pos === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pos, onClose]);

  const save = () => {
    if (pos !== null) setNote(editor.view, pos, text);
    onClose();
  };

  const remove = async () => {
    if (pos === null) return;
    if (!(await askConfirm({ title: "Apagar esta anotação?", body: `A anotação de “${title}” será removida.`, confirmLabel: "Apagar" }))) return;
    setNote(editor.view, pos, "");
    onClose();
  };

  return (
    <Presence show={pos !== null}>
      {pos !== null && (
        <div className="checkin-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <div className="checkin-box" role="dialog" aria-modal="true" aria-labelledby="note-title" style={{ maxWidth: 520, padding: "20px 22px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 id="note-title" style={{ fontSize: "calc(18px * var(--fs, 1))", margin: 0 }}>Anotação</h2>
            <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)", overflowWrap: "anywhere" }}>{title}</span>
            <textarea
              ref={area}
              className="add-task-input"
              rows={7}
              maxLength={MAX_NOTE}
              value={text}
              placeholder="Escreva sua anotação desta aula…"
              aria-label="Anotação"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  save();
                }
              }}
              style={{ resize: "vertical", height: "auto", padding: "10px 12px", lineHeight: 1.5 }}
            />
            <div className="row" style={{ gap: 8 }}>
              {had && (
                <button className="btn btn-fan btn-sm" type="button" onClick={() => void remove()} style={{ color: "var(--danger)" }}>
                  Apagar anotação
                </button>
              )}
              <span className="grow1" />
              <button className="btn btn-fan" type="button" onClick={onClose}>
                Cancelar <span className="kbd">esc</span>
              </button>
              <button className="btn btn-pri" type="button" onClick={save}>
                Salvar <span className="kbd">⌘↵</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </Presence>
  );
}
