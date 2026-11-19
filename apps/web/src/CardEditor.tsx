import { useState } from "react";
import { studyApi } from "./api";
import type { StudyCard } from "./study-types";

/** Corrige o texto de um card (na lista da trilha ou no meio da revisão). O histórico de revisão continua. */
export function CardEditor({ card, onSaved, onCancel }: { card: Pick<StudyCard, "id" | "kind" | "front" | "back">; onSaved: (card: StudyCard) => void; onCancel: () => void }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const valid = front.trim() !== "" && (card.kind === "cloze" ? /\{\{[^{}]+\}\}/.test(front) : back.trim() !== "");

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(false);
    try {
      onSaved(await studyApi.updateCard(card.id, card.kind === "basic" ? { front, back } : { front }));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="col grow1"
      style={{ gap: 8, minWidth: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <textarea className="add-task-input" rows={2} autoFocus value={front} onChange={(e) => setFront(e.target.value)} aria-label={card.kind === "basic" ? "Frente" : "Texto com lacuna"} style={{ height: "auto", padding: "8px 10px", resize: "vertical" }} />
      {card.kind === "basic" && <textarea className="add-task-input" rows={2} value={back} onChange={(e) => setBack(e.target.value)} aria-label="Verso" style={{ height: "auto", padding: "8px 10px", resize: "vertical" }} />}
      {card.kind === "cloze" && !valid && front.trim() !== "" && <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>Marque a lacuna com {"{{ }}"}.</span>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-pri btn-sm" type="submit" disabled={!valid || busy}>Salvar</button>
        <button className="btn btn-fan btn-sm" type="button" onClick={onCancel}>Cancelar</button>
        {error && <span role="alert" style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--danger)" }}>Não foi possível salvar.</span>}
      </div>
    </form>
  );
}
