import { useEffect, useRef, useState } from "react";
import { studyApi } from "./api";
import { hiddenAnswer, hiddenQuestion } from "./study-logic";
import type { Candidate, Deck } from "./study-types";
import { localDayStartIso } from "./tasks-dates";
import type { Toast } from "./toast";
import { useDismiss } from "./use-dismiss";

type State =
  | { status: "lendo" }
  | { status: "erro"; text: string }
  | { status: "pronto"; cards: Candidate[]; aiNote: string | null };

/**
 * "Sugerir cards": lê a página (marcações `::` e, com a IA, o texto) e lista perguntas. Nada é criado antes
 * de o usuário marcar o que quer e confirmar. A resposta fica escondida até ele pedir para ver.
 */
export function SuggestCards({ pageId, onClose, onToast }: { pageId: string; onClose: () => void; onToast: (toast: Toast) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, true, onClose);
  const [state, setState] = useState<State>({ status: "lendo" });
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deck, setDeck] = useState("none");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    studyApi
      .overview(localDayStartIso())
      .then((o) => live && setDecks(o.decks))
      .catch(() => undefined);
    // Marcações (grátis) e IA (pode falhar sem derrubar as marcações).
    Promise.allSettled([studyApi.extract(pageId), studyApi.generate(pageId)]).then(([marked, ai]) => {
      if (!live) return;
      const fromMarks = marked.status === "fulfilled" ? marked.value : [];
      const fromAi = ai.status === "fulfilled" ? ai.value : [];
      const code = ai.status === "rejected" ? (ai.reason as { body?: { error?: string } })?.body?.error : null;
      const aiNote =
        code === "page_too_short" ? "A página tem pouco texto para a IA sugerir cards."
        : code === "ai_not_configured" ? "A IA não está configurada: só as marcações da página foram lidas."
        : code === "ai_busy" ? "A IA está ocupada agora: só as marcações da página foram lidas."
        : ai.status === "rejected" ? "A IA falhou: só as marcações da página foram lidas."
        : null;
      const seen = new Set<string>();
      const cards = [...fromMarks, ...fromAi].filter((c) => {
        const key = `${c.kind}:${c.front}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (marked.status === "rejected" && ai.status === "rejected" && cards.length === 0) return setState({ status: "erro", text: aiNote ?? "Não foi possível ler a página." });
      setState({ status: "pronto", cards, aiNote });
      setPicked(new Set(cards.filter((c) => !c.exists).map((c) => c.sourceKey)));
    });
    return () => {
      live = false;
    };
  }, [pageId]);

  const toggle = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };

  const create = async () => {
    if (state.status !== "pronto" || picked.size === 0) return;
    setBusy(true);
    try {
      const items = state.cards.filter((c) => picked.has(c.sourceKey)).map((c) => ({ kind: c.kind, front: c.front, back: c.back, sourcePageId: pageId, sourceKey: c.sourceKey }));
      const res = await studyApi.createCards(deck === "none" ? null : deck, items);
      setCreated(res.created);
    } catch {
      onToast({ text: "Não foi possível criar os cards." });
    } finally {
      setBusy(false);
    }
  };

  const small = { fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" } as const;

  return (
    <div ref={ref} className="menu on" role="dialog" aria-label="Sugerir cards" style={{ position: "absolute", top: 34, right: 0, width: 440, maxHeight: "min(70vh, 560px)", overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12, zIndex: 40 }}>
      <b style={{ fontWeight: 600 }}>Sugerir cards</b>
      {state.status === "lendo" && (
        <div className="col" style={{ gap: 8 }} aria-busy="true" aria-label="Lendo a página">
          <span style={small}>Lendo a página e procurando o que vale um card…</span>
          <span className="sk" style={{ height: 14, width: "80%" }} />
          <span className="sk" style={{ height: 14, width: "60%" }} />
          <span className="sk" style={{ height: 14, width: "70%" }} />
        </div>
      )}
      {state.status === "erro" && <span role="alert" style={small}>{state.text}</span>}
      {state.status === "pronto" && created !== null && (
        <div className="col enter" style={{ gap: 8 }}>
          <span>{created === 1 ? "1 card criado" : `${created} cards criados`} nos seus estudos.</span>
          <button className="btn btn-sec btn-sm" type="button" onClick={onClose} style={{ alignSelf: "flex-start" }}>Fechar</button>
        </div>
      )}
      {state.status === "pronto" && created === null && (
        <>
          {state.aiNote && <span style={small}>{state.aiNote}</span>}
          {state.cards.length === 0 && <span style={small}>Não achei nada que valha um card nesta página.</span>}
          {state.cards.length > 0 && (
            <>
              <span style={small}>Marque os que quer criar. A resposta fica escondida até você pedir.</span>
              <div className="col" style={{ gap: 6 }}>
                {state.cards.map((c) => {
                  const on = picked.has(c.sourceKey);
                  const open = shown.has(c.sourceKey);
                  return (
                    <div key={c.sourceKey} className="row" style={{ gap: 10, padding: "8px 10px", borderRadius: 8, background: "var(--surface)", alignItems: "flex-start", opacity: c.exists ? 0.6 : 1 }}>
                      <button className="plain" type="button" role="checkbox" aria-checked={on} aria-label="Criar este card" disabled={c.exists} onClick={() => setPicked((cur) => toggle(cur, c.sourceKey))} style={{ paddingTop: 2 }}>
                        <span className={`cb${on ? " on" : ""}`}><svg className="ico tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" pathLength="1" /></svg></span>
                      </button>
                      <span className="col grow1" style={{ gap: 4, minWidth: 0 }}>
                        <span className="row" style={{ gap: 6 }}>
                          <span className="badge out" style={{ height: 18, fontSize: "calc(11px * var(--fs, 1))" }}>{c.kind === "basic" ? "básico" : "lacuna"}</span>
                          {c.exists && <span className="badge ok" style={{ height: 18, fontSize: "calc(11px * var(--fs, 1))" }}>já adicionado</span>}
                        </span>
                        <span style={{ fontSize: "calc(14px * var(--fs, 1))", overflowWrap: "anywhere" }}>{hiddenQuestion(c)}</span>
                        {open ? (
                          <span className="enter" style={{ ...small, color: "var(--text)" }}>Resposta: {hiddenAnswer(c)}</span>
                        ) : (
                          <button className="plain" type="button" onClick={() => setShown((cur) => toggle(cur, c.sourceKey))} style={{ ...small, alignSelf: "flex-start", textDecoration: "underline", cursor: "pointer" }}>
                            Ver resposta
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <select className="inp" aria-label="Trilha de destino" value={deck} onChange={(e) => setDeck(e.target.value)} style={{ width: "auto", height: 30 }}>
                  <option value="none">Sem trilha</option>
                  {decks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
                <button className="btn btn-sm" type="button" disabled={busy || picked.size === 0} onClick={() => void create()}>
                  Criar {picked.size} {picked.size === 1 ? "card" : "cards"}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
