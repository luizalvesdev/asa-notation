import { useCallback, useEffect, useRef, useState } from "react";
import { studyApi } from "./api";
import { pageHash, routeHash } from "./nav";
import { applyGrade, clozeAnswers, clozeSegments, current, formatClock, formatInterval, isFinished, reveal, startSession, summarize, type Session } from "./study-logic";
import type { Grade, QueueCard } from "./study-types";
import { localDayStartIso } from "./tasks-dates";

type Load = { status: "carregando" } | { status: "erro" } | { status: "pronto"; session: Session };

const RATES: { grade: Grade; name: string; color: string }[] = [
  { grade: 1, name: "De novo", color: "var(--danger)" },
  { grade: 2, name: "Difícil", color: "var(--warning)" },
  { grade: 3, name: "Bom", color: "var(--success)" },
  { grade: 4, name: "Fácil", color: "var(--accent)" },
];

function Front({ card }: { card: QueueCard }) {
  if (card.kind === "basic") return <>{card.front}</>;
  return (
    <>
      {clozeSegments(card.front).map((seg, i) =>
        seg.blank ? <span key={i} className="cloze" style={{ fontFamily: "var(--sans)", fontSize: 20 }}>[...]</span> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

function Back({ card }: { card: QueueCard }) {
  if (card.kind === "basic") return <>{card.back}</>;
  return (
    <>
      {clozeSegments(card.front).map((seg, i) =>
        seg.blank ? <span key={i} className="cloze" style={{ fontFamily: "var(--sans)", fontSize: 20 }}>{seg.text}</span> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

export function ReviewView() {
  const [load, setLoad] = useState<Load>({ status: "carregando" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let live = true;
    setLoad({ status: "carregando" });
    studyApi
      .queue(localDayStartIso())
      .then((queue) => {
        if (!live) return;
        startedAt.current = Date.now();
        setLoad({ status: "pronto", session: startSession(queue, Date.now()) });
      })
      .catch(() => live && setLoad({ status: "erro" }));
    return () => {
      live = false;
    };
  }, [attempt]);

  const session = load.status === "pronto" ? load.session : null;
  const card = session ? current(session) : null;

  const flip = useCallback(() => {
    setLoad((l) => (l.status === "pronto" ? { status: "pronto", session: reveal(l.session) } : l));
  }, []);

  const grade = useCallback(
    async (value: Grade) => {
      if (!session || !card || !session.revealed || busy) return;
      setBusy(true);
      setFailed(false);
      try {
        const response = await studyApi.review(card.id, value, Date.now() - session.shownAt);
        setLoad((l) => (l.status === "pronto" ? { status: "pronto", session: applyGrade(l.session, value, response, Date.now()) } : l));
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [session, card, busy],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.key === "Escape") {
        location.hash = routeHash("estudo");
      } else if (e.key === " " || e.key === "Enter") {
        if (session && !session.revealed && card) {
          e.preventDefault();
          flip();
        }
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        void grade(Number(e.key) as Grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, card, flip, grade]);

  const back = (
    <a className="btn btn-fan btn-sm" href={routeHash("estudo")}>
      Sair <span className="kbd">esc</span>
    </a>
  );

  if (load.status === "carregando") {
    return (
      <div style={{ padding: 40, maxWidth: 640, margin: "0 auto" }} aria-busy="true" aria-label="Carregando a revisão">
        <span className="sk" style={{ height: 300, borderRadius: 16, display: "block" }} />
      </div>
    );
  }
  if (load.status === "erro") {
    return (
      <div style={{ padding: 40, maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }} role="alert">
        <span>Não foi possível carregar a revisão.</span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sec btn-sm" type="button" onClick={() => setAttempt((a) => a + 1)}>Tentar de novo</button>
          {back}
        </div>
      </div>
    );
  }

  const s = load.session;
  if (s.total === 0) {
    return (
      <div className="col rise" style={{ padding: "80px 20px", maxWidth: 640, margin: "0 auto", alignItems: "center", gap: 12, textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 34, lineHeight: "40px" }}>Nada para revisar</h1>
        <p className="muted">Todos os cards estão em dia. Volte mais tarde.</p>
        <a className="btn btn-pri" href={routeHash("estudo")}>Voltar ao Estudo</a>
      </div>
    );
  }

  if (isFinished(s) || !card) {
    const sum = summarize(s.results);
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    return (
      <div className="col rise" style={{ padding: "48px 20px", maxWidth: 640, margin: "0 auto", gap: 20 }}>
        <div className="col" style={{ gap: 6, alignItems: "center", textAlign: "center" }}>
          <span style={{ width: 52, height: 52, borderRadius: 16, background: "var(--success-soft)", color: "var(--success)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 26, height: 26, strokeWidth: 2 }}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
          </span>
          <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 34, lineHeight: "40px" }}>Sessão concluída</h1>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(130px, 100%), 1fr))", gap: 8 }}>
          <div className="stat card" style={{ padding: 14 }}><span className="v">{sum.cards}</span><br /><span className="l">cards</span></div>
          <div className="stat card" style={{ padding: 14 }}><span className="v">{sum.remembered}%</span><br /><span className="l">lembrados</span></div>
          <div className="stat card" style={{ padding: 14 }}><span className="v">{formatClock(seconds)}</span><br /><span className="l">minutos</span></div>
          <div className="stat card" style={{ padding: 14 }}><span className="v">{sum.struggled.length}</span><br /><span className="l">para reforçar</span></div>
        </div>
        <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ fontWeight: 600, fontSize: 13 }}>Para reforçar</b>
          {sum.struggled.length === 0 && <span style={{ fontSize: 13, color: "var(--text-2)" }}>Nada para reforçar. Nenhum card foi marcado como “De novo”.</span>}
          {sum.struggled.map((front) => (
            <div key={front} className="row" style={{ fontSize: 13, gap: 8, minHeight: 32, borderTop: "1px solid var(--border)" }}>
              <span className="badge bad" style={{ height: 20 }}>De novo</span>
              <span className="grow1 trunc">{front.replace(/\{\{|\}\}/g, "")}</span>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 8, justifyContent: "center" }}>
          <a className="btn btn-pri" href={routeHash("estudo")}>Voltar ao Estudo</a>
          <button className="btn btn-fan" type="button" onClick={() => setAttempt((a) => a + 1)}>Revisar de novo</button>
        </div>
      </div>
    );
  }

  const done = s.seen.size;
  const pct = Math.round((done / s.total) * 100);
  const now = new Date();
  return (
    <div className="col" style={{ minHeight: "100%", alignItems: "center", justifyContent: "center", padding: "24px 20px", gap: 22 }}>
      <div className="row" style={{ gap: 12, width: "100%", maxWidth: 620 }}>
        {back}
        <div className="bar grow1" role="progressbar" aria-valuemin={0} aria-valuemax={s.total} aria-valuenow={done} aria-label="Progresso da sessão"><span style={{ width: `${pct}%`, animation: "none", transition: "width var(--medio) var(--padrao)" }} /></div>
        <span className="mono" style={{ fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}>{Math.min(done + 1, s.total)} de {s.total}</span>
      </div>
      <div className={s.revealed ? "flipon" : ""} style={{ width: "100%", maxWidth: 620, display: "flex", flexDirection: "column", gap: 22 }}>
        <div className="rise flipwrap" style={{ height: 300 }} key={`${card.id}-${s.results.length}`}>
          <div className="flipinner">
            <div className="face front" aria-hidden={s.revealed}>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge out" style={{ height: 20 }}>{card.kind === "basic" ? "básico" : "lacuna"}</span>
                {card.state === 0 && <span className="badge ac" style={{ height: 20 }}>novo</span>}
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 28, lineHeight: "36px", textWrap: "balance", overflowWrap: "anywhere" }}><Front card={card} /></div>
            </div>
            <div className="face back" aria-hidden={!s.revealed}>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge ok" style={{ height: 20 }}>resposta</span>
                {card.sourcePageId && <a href={pageHash(card.sourcePageId)} style={{ fontSize: 12, marginLeft: "auto" }}>Fonte: {card.sourceTitle ?? "página"}</a>}
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 26, lineHeight: "34px", textWrap: "balance", overflowWrap: "anywhere" }}><Back card={card} /></div>
              {card.kind === "cloze" && <span style={{ fontSize: 13, color: "var(--text-2)" }}>{clozeAnswers(card.front)}</span>}
            </div>
          </div>
        </div>
        {!s.revealed && (
          <button className="btn btn-pri" type="button" onClick={flip} style={{ height: 48, fontSize: 15 }}>
            Mostrar resposta <span className="kbd" style={{ background: "transparent", color: "inherit", borderColor: "currentColor" }}>espaço</span>
          </button>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
          {RATES.map((r, i) => (
            <button key={r.grade} className="rate" type="button" disabled={!s.revealed || busy} tabIndex={s.revealed ? 0 : -1} onClick={() => void grade(r.grade)} style={{ transitionDelay: `${i * 30}ms` }}>
              <span style={{ font: "600 14px/18px var(--sans)", color: r.color }}>{r.name}</span>
              <span>{formatInterval(now, card.preview[r.grade])}</span>
              <span className="kpad" style={{ marginTop: 2 }}>{r.grade}</span>
            </button>
          ))}
        </div>
        {failed && <span role="alert" style={{ fontSize: 13, color: "var(--danger)", textAlign: "center" }}>Não foi possível salvar a avaliação. Tente de novo.</span>}
      </div>
    </div>
  );
}
