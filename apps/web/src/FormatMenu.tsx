import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect, useRef, useState } from "react";
import { normalizeHref } from "./format-menu";

interface Button {
  label: string;
  title: string;
  active: (e: Editor) => boolean;
  run: (e: Editor) => void;
  style?: React.CSSProperties;
}

const BUTTONS: Button[] = [
  { label: "B", title: "Negrito (Ctrl+B)", active: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run(), style: { fontWeight: 700 } },
  { label: "I", title: "Itálico (Ctrl+I)", active: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run(), style: { fontStyle: "italic" } },
  { label: "S", title: "Riscado", active: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run(), style: { textDecoration: "line-through" } },
  { label: "</>", title: "Código", active: (e) => e.isActive("code"), run: (e) => e.chain().focus().toggleCode().run(), style: { fontFamily: "var(--mono)", fontSize: "calc(12px * var(--fs, 1))" } },
  { label: "H1", title: "Título 1", active: (e) => e.isActive("heading", { level: 1 }), run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: "H2", title: "Título 2", active: (e) => e.isActive("heading", { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
];

// Fora do componente: identidade estável entre renders (o BubbleMenu se reconfigura quando elas mudam).
const MENU_OPTIONS = { placement: "top", offset: 8 } as const;
const shouldShowMenu = ({ editor: e, state }: { editor: Editor; state: { selection: { empty: boolean } } }) =>
  e.isEditable && !state.selection.empty && !e.isActive("codeBlock") && !e.isActive("mermaid") && !e.isActive("image");

/** Barra que flutua sobre o texto selecionado: formatação básica e link. */
export function FormatMenu({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // Quais botões estão ativos: só re-renderiza quando algum valor muda de verdade. Forçar um render a cada transação do editor
  // fazia o BubbleMenu se reconfigurar a cada render e gerava um laço infinito ("Maximum update depth exceeded").
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ buttons: BUTTONS.map((b) => b.active(e)), link: e.isActive("link") }),
  });

  useEffect(() => {
    if (linking) input.current?.focus();
  }, [linking]);

  const startLink = () => {
    setHref((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinking(true);
  };
  const applyLink = () => {
    const url = normalizeHref(href);
    if (href.trim() === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    else return;
    setLinking(false);
  };

  const dark = !!document.querySelector(".ds.escuro");
  return (
    <BubbleMenu
      editor={editor}
      options={MENU_OPTIONS}
      shouldShow={shouldShowMenu}
    >
      <div className={`ds${dark ? " escuro" : ""}`} style={{ background: "transparent" }}>
        <div className="menu on row" role="toolbar" aria-label="Formatação" style={{ position: "static", padding: 4, gap: 2, width: "auto", boxShadow: "var(--e2)" }} onMouseDown={(e) => !(e.target instanceof HTMLInputElement) && e.preventDefault()}>
          {linking ? (
            <form className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); applyLink(); }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setLinking(false); editor.commands.focus(); } }}>
              <input ref={input} className="inp" aria-label="Endereço do link" placeholder="site.com ou #/p/…" value={href} onChange={(e) => setHref(e.target.value)} style={{ width: 200, height: 28 }} />
              <button className="btn btn-pri btn-sm" type="submit" disabled={href.trim() !== "" && !normalizeHref(href)}>OK</button>
              <button className="btn btn-fan btn-sm" type="button" onClick={() => setLinking(false)}>Cancelar</button>
            </form>
          ) : (
            <>
              {BUTTONS.map((b, i) => (
                <button key={b.label} className={`btn btn-fan btn-sm${state.buttons[i] ? " on" : ""}`} type="button" aria-pressed={state.buttons[i]} title={b.title} aria-label={b.title} onClick={() => b.run(editor)} style={{ minWidth: 28, ...b.style }}>
                  {b.label}
                </button>
              ))}
              <button className={`btn btn-fan btn-sm${state.link ? " on" : ""}`} type="button" aria-pressed={state.link} title="Link" aria-label="Link" onClick={startLink}>
                Link
              </button>
            </>
          )}
        </div>
      </div>
    </BubbleMenu>
  );
}
