import { useEffect, useMemo, useState } from "react";
import { goalsApi, studyApi } from "./api";
import { CardEditor } from "./CardEditor";
import type { Goal } from "./goals-types";
import { routeHash, pageHash } from "./nav";
import { displayTitle } from "./pages-tree";
import type { TreeNode } from "./pages-types";
import { openChat } from "./chat-types";
import { clozeSegments, estimateMinutes } from "./study-logic";
import type { Candidate, CardKind, Deck, StudyCard } from "./study-types";
import type { Toast } from "./toast";
import { useStudyOverview } from "./use-study";
import { ContextBox } from "./ContextBox";
import { Reveal } from "./Reveal";

interface StudyViewProps {
  nodes: TreeNode[];
  onToast: (toast: Toast) => void;
}

const H1 = { fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(40px * var(--fs, 1))", lineHeight: "calc(44px * var(--fs, 1))", letterSpacing: "-.02em" } as const;

function CardText({ card }: { card: Pick<StudyCard, "kind" | "front" | "back"> }) {
  if (card.kind === "cloze") {
    return (
      <span>
        {clozeSegments(card.front).map((seg, i) => (seg.blank ? <span key={i} className="cloze">{seg.text}</span> : <span key={i}>{seg.text}</span>))}
      </span>
    );
  }
  return (
    <span>
      {card.front}
      <span style={{ color: "var(--text-2)" }}> → {card.back}</span>
    </span>
  );
}

function DeckCards({ deckId, onChanged, onToast }: { deckId: string | "none"; onChanged: () => void; onToast: (t: Toast) => void }) {
  const [cards, setCards] = useState<StudyCard[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    studyApi
      .cards(deckId)
      .then((c) => live && setCards(c))
      .catch(() => live && setCards([]));
    return () => {
      live = false;
    };
  }, [deckId, version]);

  const remove = async (id: string) => {
    try {
      await studyApi.deleteCard(id);
      setConfirm(null);
      setVersion((v) => v + 1);
      onChanged();
    } catch {
      onToast({ text: "Não foi possível apagar o card." });
    }
  };

  if (cards === null) return <span className="sk" style={{ height: 16, width: "60%" }} aria-label="Carregando os cards" />;
  if (cards.length === 0) return <p className="muted" style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Nenhum card ainda. Adicione abaixo ou extraia de uma página.</p>;
  return (
    <div className="col">
      {cards.map((card) => (
        <ContextBox
          key={card.id}
          items={() => [
            { label: "Editar card", run: () => setEditing(card.id) },
            { label: "Apagar card", danger: true, run: () => setConfirm(card.id) },
          ]}
          className="row"
          style={{ gap: 12, minHeight: 44, borderTop: "1px solid var(--border)", padding: "6px 0", alignItems: "flex-start" }}
        >
          <span className="badge out" style={{ height: 18, fontSize: "calc(11px * var(--fs, 1))" }}>{card.kind === "basic" ? "básico" : "lacuna"}</span>
          {editing === card.id ? (
            <CardEditor
              card={card}
              onCancel={() => setEditing(null)}
              onSaved={(saved) => {
                setCards((cur) => cur && cur.map((c) => (c.id === saved.id ? saved : c)));
                setEditing(null);
              }}
            />
          ) : (
            <span className="grow1" style={{ fontSize: "calc(14px * var(--fs, 1))", minWidth: 0, overflowWrap: "anywhere" }}>
              <CardText card={card} />
            </span>
          )}
          {editing === card.id ? null : confirm === card.id ? (
            <>
              <button className="btn btn-sm btn-sec" type="button" onClick={() => void remove(card.id)}>Confirmar</button>
              <button className="btn btn-fan btn-sm" type="button" onClick={() => setConfirm(null)}>Cancelar</button>
            </>
          ) : (
            <>
              <button className="btn btn-fan btn-sm" type="button" onClick={() => setEditing(card.id)}>Editar</button>
              <button className="btn btn-fan btn-sm" type="button" onClick={() => setConfirm(card.id)}>Apagar</button>
            </>
          )}
        </ContextBox>
      ))}
    </div>
  );
}

function NewCardForm({ decks, defaultDeck, onCreated, onToast }: { decks: Deck[]; defaultDeck: string; onCreated: () => void; onToast: (t: Toast) => void }) {
  const [kind, setKind] = useState<CardKind>("basic");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [deck, setDeck] = useState(defaultDeck);
  const [reverse, setReverse] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDeck(defaultDeck), [defaultDeck]);

  const valid = front.trim() !== "" && (kind === "cloze" ? /\{\{[^{}]+\}\}/.test(front) : back.trim() !== "");

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await studyApi.createCard({ kind, front, back: kind === "basic" ? back : "", deckId: deck === "none" ? null : deck, ...(kind === "basic" && reverse ? { reverse: true } : {}) });
      setFront("");
      setBack("");
      onCreated();
    } catch {
      onToast({ text: "Não foi possível criar o card." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="col" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <div className="seg" role="tablist" aria-label="Tipo do card">
          <span className="seg-ind" style={{ width: "calc((100% - 4px) / 2)", transform: `translateX(${kind === "basic" ? 0 : 100}%)` }} />
          <button className={`seg-b${kind === "basic" ? " on" : ""}`} type="button" role="tab" aria-selected={kind === "basic"} onClick={() => setKind("basic")}>Básico</button>
          <button className={`seg-b${kind === "cloze" ? " on" : ""}`} type="button" role="tab" aria-selected={kind === "cloze"} onClick={() => setKind("cloze")}>Lacuna</button>
        </div>
        <select className="add-task-input" aria-label="Trilha" value={deck} onChange={(e) => setDeck(e.target.value)} style={{ width: "auto", height: 30 }}>
          <option value="none">Sem trilha</option>
          {decks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
      </div>
      <input className="add-task-input" value={front} onChange={(e) => setFront(e.target.value)} aria-label={kind === "basic" ? "Frente" : "Texto com lacuna"} placeholder={kind === "basic" ? "Frente (pergunta)" : "Texto com {{lacuna}} no meio"} />
      {kind === "basic" && <input className="add-task-input" value={back} onChange={(e) => setBack(e.target.value)} aria-label="Verso" placeholder="Verso (resposta)" />}
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <button className="btn btn-pri btn-sm" type="submit" disabled={!valid || busy}>{kind === "basic" && reverse ? "Adicionar 2 cards" : "Adicionar card"}</button>
        {kind === "basic" && (
          <button className="plain row" type="button" role="checkbox" aria-checked={reverse} onClick={() => setReverse((r) => !r)} style={{ gap: 8, fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)", cursor: "pointer" }}>
            <span className={`cb${reverse ? " on" : ""}`}><svg className="ico tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" pathLength="1" /></svg></span>
            Também ao contrário (resposta → pergunta)
          </button>
        )}
      </div>
    </form>
  );
}

function Extractor({ nodes, decks, onCreated, onToast }: { nodes: TreeNode[]; decks: Deck[]; onCreated: () => void; onToast: (t: Toast) => void }) {
  const [pageId, setPageId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [deck, setDeck] = useState("none");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [source, setSource] = useState<"marks" | "ai">("marks");
  const [generating, setGenerating] = useState(false);

  const show = (found: Candidate[]) => {
    setCandidates(found);
    setPicked(new Set(found.filter((c) => !c.exists).map((c) => c.sourceKey)));
  };

  const extract = async (id: string) => {
    setPageId(id);
    setCandidates(null);
    setDone(null);
    setSource("marks");
    if (!id) return;
    try {
      show(await studyApi.extract(id));
    } catch {
      onToast({ text: "Não foi possível ler a página." });
    }
  };

  const generate = async () => {
    if (!pageId || generating) return;
    setGenerating(true);
    setDone(null);
    try {
      show(await studyApi.generate(pageId));
      setSource("ai");
    } catch (err) {
      const code = (err as { body?: { error?: string } }).body?.error;
      onToast({
        text:
          code === "page_too_short" ? "A página tem pouco texto para virar cards."
          : code === "ai_not_configured" ? "Configure os assistentes em Configurações para gerar cards."
          : code === "ai_busy" ? "A IA está ocupada. Tente de novo em instantes."
          : "Não foi possível gerar os cards.",
      });
    } finally {
      setGenerating(false);
    }
  };

  const approve = async () => {
    if (!candidates || picked.size === 0) return;
    setBusy(true);
    try {
      const items = candidates.filter((c) => picked.has(c.sourceKey)).map((c) => ({ kind: c.kind, front: c.front, back: c.back, sourcePageId: pageId, sourceKey: c.sourceKey }));
      const res = await studyApi.createCards(deck === "none" ? null : deck, items);
      setDone(res.created);
      setCandidates(null);
      onCreated();
    } catch {
      onToast({ text: "Não foi possível adicionar os cards." });
    } finally {
      setBusy(false);
    }
  };

  const sorted = useMemo(() => [...nodes].sort((a, b) => displayTitle(a.title).localeCompare(displayTitle(b.title))), [nodes]);

  return (
    <div className="draft r">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="av r" style={{ width: 18, height: 18, fontSize: "calc(11px * var(--fs, 1))" }}>R</span>
        <span className="draft-t">Extrair cards de uma página</span>
        {pageId && <a href={pageHash(pageId)} style={{ marginLeft: "auto", fontSize: "calc(12px * var(--fs, 1))" }}>Ver página</a>}
      </div>
      <p style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>
        Na página, escreva <code>Pergunta :: resposta</code> para um card básico, <code>Pergunta ::: resposta</code> para ele valer nos dois sentidos, ou <code>texto com {"{{lacuna}}"}</code> para um card de lacuna. Ou deixe a IA sugerir cards a partir do texto: você escolhe quais entram.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <select className="add-task-input grow1" aria-label="Página" value={pageId} onChange={(e) => void extract(e.target.value)} style={{ height: 32, minWidth: 0, width: "auto" }}>
          <option value="">Escolha uma página…</option>
          {sorted.map((n) => <option key={n.id} value={n.id}>{displayTitle(n.title)}</option>)}
        </select>
        <button className="btn btn-sec btn-sm" type="button" disabled={!pageId || generating} onClick={() => void generate()} aria-busy={generating}>
          {generating ? "Gerando…" : "Gerar com IA"}
        </button>
      </div>
      {candidates && candidates.length === 0 && <p style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>{source === "ai" ? "A IA não achou nada que valha um card nesta página." : "Nenhuma marcação de card nesta página. Tente \"Gerar com IA\"."}</p>}
      {candidates && candidates.length > 0 && (
        <>
          {candidates.map((c) => {
            const on = picked.has(c.sourceKey);
            return (
              <button key={c.sourceKey} className="plain" type="button" role="checkbox" aria-checked={on} disabled={c.exists} onClick={() => setPicked((cur) => { const next = new Set(cur); if (!next.delete(c.sourceKey)) next.add(c.sourceKey); return next; })} style={{ display: "flex", gap: 12, padding: "10px 12px", borderRadius: 8, background: "var(--surface)", textAlign: "left", cursor: c.exists ? "default" : "pointer", opacity: c.exists ? 0.6 : 1 }}>
                <span className={`cb${on ? " on" : ""}`}><svg className="ico tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" pathLength="1" /></svg></span>
                <span className="col grow1" style={{ gap: 4 }}>
                  <span className="row" style={{ gap: 6 }}>
                    <span className="badge out" style={{ height: 18, fontSize: "calc(11px * var(--fs, 1))" }}>{c.kind === "basic" ? "básico" : "lacuna"}</span>
                    {source === "ai" && <span className="badge ac" style={{ height: 18, fontSize: "calc(11px * var(--fs, 1))" }}>IA</span>}
                    {c.exists && <span className="badge ok" style={{ height: 18, fontSize: "calc(11px * var(--fs, 1))" }}>já adicionado</span>}
                  </span>
                  <span style={{ fontSize: "calc(14px * var(--fs, 1))" }}><CardText card={c} /></span>
                </span>
              </button>
            );
          })}
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select className="add-task-input" aria-label="Trilha de destino" value={deck} onChange={(e) => setDeck(e.target.value)} style={{ width: "auto", height: 30 }}>
              <option value="none">Sem trilha</option>
              {decks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
            <button className="btn btn-ink btn-sm" type="button" disabled={busy || picked.size === 0} onClick={() => void approve()}>Aprovar {picked.size} {picked.size === 1 ? "card" : "cards"}</button>
          </div>
        </>
      )}
      {done !== null && <div className="draft-ok enter">{done} {done === 1 ? "card adicionado" : "cards adicionados"} aos seus estudos.</div>}
    </div>
  );
}

function NewDeckForm({ goals, onCreate, onCancel }: { goals: Goal[]; onCreate: (title: string, goalId: string | null) => Promise<boolean>; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState("");
  const [failed, setFailed] = useState(false);
  return (
    <form className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }} onKeyDown={(e) => e.key === "Escape" && onCancel()} onSubmit={(e) => { e.preventDefault(); if (title.trim()) void onCreate(title.trim(), goalId || null).then((ok) => setFailed(!ok)); }}>
      <input className="add-task-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome da trilha" aria-label="Nome da trilha" />
      <label className="row" style={{ gap: 8, fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>
        Meta
        <select className="add-task-input" value={goalId} onChange={(e) => setGoalId(e.target.value)} style={{ width: "auto", height: 30 }}>
          <option value="">Sem meta</option>
          {goals.filter((g) => !g.done).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      </label>
      {failed && <span role="alert" style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--danger)" }}>Não foi possível criar a trilha.</span>}
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-pri btn-sm" type="submit" disabled={title.trim() === ""}>Criar trilha</button>
        <button className="btn btn-fan btn-sm" type="button" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export function StudyView({ nodes, onToast }: StudyViewProps) {
  const { overview, status, reload, retry } = useStudyOverview();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [cardsVersion, setCardsVersion] = useState(0);

  useEffect(() => {
    let live = true;
    goalsApi.list().then((g) => live && setGoals(g)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const decks = overview?.decks ?? [];
  // Sem escolha, abre a primeira trilha; "none" mostra os cards que não pertencem a nenhuma.
  const deck = selected === "none" ? undefined : (decks.find((d) => d.id === selected) ?? decks[0]);
  const activeId = deck ? deck.id : "none";
  const changed = () => {
    reload();
    setCardsVersion((v) => v + 1);
  };

  const total = overview ? overview.dueReview + overview.newAvailable : 0;
  const reviewCount = overview?.dueReview ?? 0;
  const newCount = overview?.newAvailable ?? 0;

  return (
    <div style={{ padding: "36px 40px 120px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="row" style={{ alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <h1 style={H1}>Estudo</h1>
        <a className="btn btn-fan btn-sm" href={routeHash("estudo-stats")} style={{ marginLeft: "auto" }}>Estatísticas</a>
      </div>

      {status === "carregando" && <div className="col" style={{ gap: 12 }} aria-busy="true" aria-label="Carregando o estudo"><span className="sk" style={{ height: 120, borderRadius: 12 }} /><span className="sk" style={{ height: 80, borderRadius: 12 }} /></div>}
      {status === "erro" && (
        <div className="card" role="alert" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Não foi possível carregar o estudo.</span>
          <button className="btn btn-sec btn-sm" type="button" onClick={retry} style={{ marginLeft: "auto" }}>Tentar de novo</button>
        </div>
      )}

      {overview && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <div className="card" style={{ flex: "2 1 420px", padding: 20, display: "flex", flexDirection: "column", gap: 10, background: "var(--accent-soft)", borderColor: "transparent" }}>
              <span className="eyebrow" style={{ color: "var(--accent)" }}>Revisão de hoje</span>
              {total === 0 ? (
                <>
                  <span style={{ fontFamily: "var(--serif)", fontSize: "calc(30px * var(--fs, 1))", lineHeight: "calc(36px * var(--fs, 1))" }}>Nada para revisar agora</span>
                  <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>{overview.totalCards === 0 ? "Crie cards abaixo para começar." : "Volte mais tarde: o FSRS avisa quando um card precisar de revisão."}</span>
                </>
              ) : (
                <>
                  <span style={{ fontFamily: "var(--serif)", fontSize: "calc(30px * var(--fs, 1))", lineHeight: "calc(36px * var(--fs, 1))" }}>{total} {total === 1 ? "card" : "cards"} · cerca de {estimateMinutes(total, overview.avgSeconds)} min</span>
                  <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>{reviewCount} de revisão e {newCount} {newCount === 1 ? "novo" : "novos"}</span>
                  <a className="btn btn-pri" href={routeHash("revisao")} style={{ alignSelf: "flex-start", marginTop: 4 }}>Começar revisão</a>
                </>
              )}
            </div>
            <div className="card" style={{ flex: "1 1 260px", padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="eyebrow">Pontos fracos</span>
              {overview.weak.length === 0 ? (
                <span style={{ fontSize: "calc(14px * var(--fs, 1))", lineHeight: "calc(21px * var(--fs, 1))", color: "var(--text-2)" }}>Nenhum card foi errado duas vezes esta semana.</span>
              ) : (
                <>
                  <span style={{ fontSize: "calc(14px * var(--fs, 1))", lineHeight: "calc(21px * var(--fs, 1))" }}>{overview.weak.length} {overview.weak.length === 1 ? "card errado" : "cards errados"} 2 vezes ou mais esta semana:</span>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <button className="btn btn-sec btn-sm" type="button" onClick={() => openChat({ agent: "tutor", prompt: "Me faça um quiz nos meus pontos fracos, uma pergunta por vez." })}>Quiz nos pontos fracos</button>
                    <button className="btn btn-fan btn-sm" type="button" onClick={() => openChat({ agent: "tutor", prompt: "Quero uma sessão guiada: me ensine os meus pontos fracos com perguntas." })}>Sessão guiada com tutor</button>
                  </div>
                  {overview.weak.map((w) => <span key={w.id} className="trunc" style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>· {w.kind === "cloze" ? w.front.replace(/\{\{|\}\}/g, "") : w.front} <span className="badge bad" style={{ height: 18, fontSize: "calc(11px * var(--fs, 1))" }}>{w.lapses}×</span></span>)}
                </>
              )}
            </div>
          </div>

          <div className="col" style={{ gap: 12 }}>
            <div className="row">
              <h2 style={{ font: "600 calc(18px * var(--fs, 1))/calc(26px * var(--fs, 1)) var(--sans)" }}>Trilhas</h2>
              <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-3)", marginLeft: 8 }}>ligadas às metas</span>
              <button className="btn btn-fan btn-sm" type="button" style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}>Nova trilha</button>
            </div>
            <Reveal show={creating}><NewDeckForm
                goals={goals}
                onCancel={() => setCreating(false)}
                onCreate={async (title, goalId) => {
                  try {
                    const created = await studyApi.createDeck(title, goalId);
                    setCreating(false);
                    setSelected(created.id);
                    reload();
                    return true;
                  } catch {
                    return false;
                  }
                }}
              /></Reveal>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 12 }}>
              {decks.map((d) => (
                <button key={d.id} className="plain card" type="button" aria-pressed={activeId === d.id} onClick={() => setSelected(d.id)} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, textAlign: "left", cursor: "pointer", boxShadow: activeId === d.id ? "inset 0 0 0 2px var(--accent)" : "none" }}>
                  <span className="row" style={{ gap: 8 }}>
                    <b className="grow1" style={{ fontWeight: 600, fontSize: "calc(14px * var(--fs, 1))" }}>{d.title}</b>
                    <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)" }}>{d.cards} {d.cards === 1 ? "card" : "cards"}{d.due > 0 ? ` · ${d.due} para revisar` : ""}</span>
                  </span>
                  <span className="bar" style={{ width: "100%" }}><span style={{ width: `${d.cards === 0 ? 0 : Math.round((d.learned / d.cards) * 100)}%` }} /></span>
                  <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>{d.goalTitle ? `Meta: ${d.goalTitle}` : "Sem meta"} · {d.learned} de {d.cards} aprendidos</span>
                </button>
              ))}
              <button className="plain card" type="button" aria-pressed={activeId === "none"} onClick={() => setSelected("none")} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6, textAlign: "left", cursor: "pointer", boxShadow: activeId === "none" ? "inset 0 0 0 2px var(--accent)" : "none" }}>
                <b style={{ fontWeight: 600, fontSize: "calc(14px * var(--fs, 1))" }}>Sem trilha</b>
                <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>Cards que não pertencem a nenhuma trilha</span>
              </button>
            </div>
            <div className="card enter" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }} key={`${activeId}-${cardsVersion}`}>
              <div className="row"><b style={{ fontWeight: 600 }}>{deck ? deck.title : "Sem trilha"} · cards</b></div>
              <DeckCards deckId={activeId} onChanged={changed} onToast={onToast} />
              <NewCardForm decks={decks} defaultDeck={activeId} onCreated={changed} onToast={onToast} />
            </div>
          </div>

          <div className="col" style={{ gap: 12 }}>
            <h2 style={{ font: "600 calc(18px * var(--fs, 1))/calc(26px * var(--fs, 1)) var(--sans)" }}>Cards extraídos das páginas</h2>
            <Extractor nodes={nodes} decks={decks} onCreated={changed} onToast={onToast} />
          </div>
        </>
      )}
    </div>
  );
}
