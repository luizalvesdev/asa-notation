import { useEffect, useRef, useState } from "react";

interface CapturePanelProps {
  dark: boolean;
  offline: boolean;
  queued: number;
  onClose: () => void;
  /** Devolve false se falhou (o texto fica no campo para tentar de novo). */
  onSave: (text: string) => Promise<boolean>;
}

/** Captura rápida: painel pequeno, foco imediato, ⌘↵ salva, Esc fecha. */
export function CapturePanel({ dark, offline, queued, onClose, onSave }: CapturePanelProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => field.current?.focus(), []);
  // Entra com animação: monta fechado e abre no quadro seguinte.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const save = async () => {
    if (busy || text.trim() === "") return;
    setBusy(true);
    setFailed(false);
    const ok = await onSave(text.trim());
    setBusy(false);
    if (ok) onClose();
    else setFailed(true);
  };

  const tags = [...new Set([...text.matchAll(/(?<![\p{L}\p{N}_&])#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu)].map((m) => m[1]!.toLowerCase()))];

  return (
    <div className={`ds${dark ? " escuro" : ""} capture-layer${shown ? " on" : ""}`} style={{ position: "fixed", inset: 0, zIndex: 70 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`float${shown ? " on" : ""}`}
        role="dialog"
        aria-label="Captura rápida"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
        style={{ position: "absolute", left: 0, right: 0, top: 72, width: "min(520px, calc(100% - 24px))", margin: "0 auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--e3)", padding: 14, display: "flex", flexDirection: "column", gap: 12, transformOrigin: "50% 0" }}
      >
        <div className="row" style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>
          <span className="av r" style={{ width: 18, height: 18, fontSize: "calc(11px * var(--fs, 1))", borderRadius: 5 }}>
            R
          </span>
          Captura rápida · vai para a Inbox
          {(offline || queued > 0) && (
            <span className="badge warn" style={{ marginLeft: "auto", height: 20 }}>
              {offline ? "Offline" : "Na fila"}
              {queued > 0 ? ` · ${queued} na fila` : ""}
            </span>
          )}
        </div>
        <label htmlFor="cap-txt" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          Texto da captura
        </label>
        <textarea
          ref={field}
          id="cap-txt"
          className="inp is-fi"
          rows={3}
          value={text}
          placeholder="Escreva uma ideia, link ou tarefa…"
          onChange={(e) => setText(e.target.value)}
          style={{ fontSize: "calc(15px * var(--fs, 1))", lineHeight: "calc(23px * var(--fs, 1))", minHeight: 84 }}
        />
        <div className="row" style={{ flexWrap: "wrap", gap: 6, minHeight: 22 }}>
          {tags.map((tag) => (
            <span key={tag} className="badge out">
              #{tag}
            </span>
          ))}
          <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: failed ? "var(--danger)" : "var(--text-3)" }} role={failed ? "alert" : undefined}>
            {failed ? "Não foi possível salvar. Tente de novo." : "Use #tags no texto. Classifique depois, na Inbox."}
          </span>
        </div>
        <div className="row">
          <span className="kbd">⌘K</span>
          <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)" }}>de qualquer tela</span>
          <button className="btn btn-fan btn-sm" type="button" style={{ marginLeft: "auto" }} onClick={onClose}>
            Cancelar <span className="kbd">esc</span>
          </button>
          <button className="btn btn-pri btn-sm" type="button" disabled={busy || text.trim() === ""} onClick={() => void save()}>
            Salvar <span className="kbd" style={{ background: "transparent", color: "inherit", borderColor: "currentColor" }}>⌘↵</span>
          </button>
        </div>
      </div>
    </div>
  );
}
