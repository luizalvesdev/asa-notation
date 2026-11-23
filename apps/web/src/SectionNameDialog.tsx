import { useEffect, useRef, useState } from "react";

export const MAX_SECTION_TITLE = 80;

interface SectionNameDialogProps {
  /** "new" cria uma seção; "rename" troca o nome de uma existente. */
  mode: "new" | "rename";
  initial?: string;
  onSubmit: (title: string) => void;
  onClose: () => void;
}

/** Modal com o nome de uma seção da barra lateral. Enter salva, Esc ou clicar fora cancela. */
export function SectionNameDialog({ mode, initial = "", onSubmit, onClose }: SectionNameDialogProps) {
  const [title, setTitle] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const clean = title.trim();

  useEffect(() => {
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const submit = () => {
    if (clean === "" || (mode === "rename" && clean === initial.trim())) return onClose();
    onSubmit(clean);
  };

  return (
    <div className="checkin-scrim" style={{ zIndex: 120 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="checkin-box confirm-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-name-title"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 id="section-name-title">{mode === "new" ? "Nova seção" : "Renomear seção"}</h2>
        {mode === "new" && <p>Uma seção própria na barra lateral, com as páginas que você criar dentro dela.</p>}
        <input
          ref={input}
          className="inp"
          type="text"
          value={title}
          maxLength={MAX_SECTION_TITLE}
          placeholder="Nome da seção"
          aria-label="Nome da seção"
          onChange={(e) => setTitle(e.target.value)}
          style={{ marginBottom: 6 }}
        />
        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-fan" type="button" onClick={onClose}>
            Cancelar <span className="kbd">esc</span>
          </button>
          <button className="btn btn-pri" type="submit" disabled={clean === ""}>
            {mode === "new" ? "Criar" : "Salvar"} <span className="kbd">enter</span>
          </button>
        </div>
      </form>
    </div>
  );
}
