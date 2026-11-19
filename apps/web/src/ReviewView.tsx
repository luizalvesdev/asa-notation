import { useCallback, useEffect, useRef, useState } from "react";
import { studyApi } from "./api";
import { CardEditor } from "./CardEditor";
import { pageHash, routeHash } from "./nav";
import { applyGrade, clozeAnswers, clozeSegments, current, formatClock, formatInterval, isFinished, replaceCurrent, reveal, startSession, summarize, type Session } from "./study-logic";
import type { Grade, QueueCard } from "./study-types";
import { localDayStartIso } from "./tasks-dates";
import { ActiveClock, checkAnswer, expectedAnswer, formatSeconds, loadSamples, loadTypedAnswers, recordSample, suggestGrade, thresholdsFrom } from "./typed-answer";

const LAST_CHECKIN = "asa-checkin-last";

/** Check-in: um card só, e não o mesmo da última entrada (se houver outro para hoje). */
function pickForCheckin(queue: QueueCard[]): QueueCard[] {
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_CHECKIN);
  } catch {
    // sem armazenamento
  }
  const chosen = queue.find((c) => c.id !== last) ?? queue[0];
  if (!chosen) return [];
  try {
    localStorage.setItem(LAST_CHECKIN, chosen.id);
  } catch {
    // sem armazenamento
  }
  return [chosen];
}

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
        seg.blank ? <span key={i} className="cloze" style={{ fontFamily: "var(--sans)", fontSize: "calc(20px * var(--fs, 1))" }}>[...]</span> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

function Back({ card }: { card: QueueCard }) {
  if (card.kind === "basic") return <>{card.back}</>;
  return (
    <>
      {clozeSegments(card.front).map((seg, i) =>
        seg.blank ? <span key={i} className="cloze" style={{ fontFamily: "var(--sans)", fontSize: "calc(20px * var(--fs, 1))" }}>{seg.text}</span> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

/**
 * `checkin`: a revisão abre como check-in (modal sobre Hoje), com um card só, sem Esc;
 * avaliar fecha o modal (`onExit`). Sem isso, é a sessão completa do Estudo.
 */
export function ReviewView({ onExit, checkin = false }: { onExit?: () => void; checkin?: boolean } = {}) {
  const [load, setLoad] = useState<Load>({ status: "carregando" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const startedAt = useRef(Date.now());
  // Responder digitando: o tempo até lembrar (só com o Asa em foco) sugere a nota.
  const [typing] = useState(loadTypedAnswers);
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState<{ correct: boolean; latency: number | null; suggestion: Grade | null; errors: number } | null>(null);
  /** Quantas vezes errou o card atual (refazendo). */
  const [errors, setErrors] = useState(0);
  const limits = useRef(thresholdsFrom(loadSamples()));
  const clock = useRef(new ActiveClock());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    setLoad({ status: "carregando" });
    studyApi
      .queue(localDayStartIso())
      .then((queue) => {
        if (!live) return;
        startedAt.current = Date.now();
        setLoad({ status: "pronto", session: startSession(checkin ? pickForCheckin(queue) : queue, Date.now()) });
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

  // Cada card novo (ou "refazer") zera a resposta e o cronômetro.
  const cardKey = card ? `${card.id}-${session?.results.length}` : "";
  const [retry, setRetry] = useState(0);
  // Card novo: zera tudo. "Refazer" zera na própria ação (redo), sem perder teclas já digitadas.
  useEffect(() => {
    clock.current = new ActiveClock();
    setTyped("");
    setVerdict(null);
    setErrors(0);
  }, [cardKey]);
  useEffect(() => {
    if (!typing || !card) return;
    const active = () => document.visibilityState === "visible" && document.hasFocus();
    const sync = () => (active() ? clock.current.start() : clock.current.pause());
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey, retry, typing]);

  const submitTyped = useCallback(() => {
    if (!card || !session || session.revealed) return;
    clock.current.pause();
    const correct = checkAnswer(typed, expectedAnswer(card));
    const latency = clock.current.latency();
    const wrongSoFar = errors + (correct ? 0 : 1);
    if (correct && errors === 0 && latency !== null) recordSample(latency);
    if (!correct) setErrors(wrongSoFar);
    setVerdict({ correct, latency, suggestion: suggestGrade(correct, latency, errors, limits.current), errors: wrongSoFar });
    flip();
  }, [card, session, typed, flip, errors]);

  const redo = useCallback(() => {
    // Zera na hora (não só no efeito), para o que for digitado logo em seguida não somar com a tentativa anterior.
    clock.current = new ActiveClock();
    setTyped("");
    setVerdict(null);
    setLoad((l) => (l.status === "pronto" ? { status: "pronto", session: { ...l.session, revealed: false } } : l));
    setRetry((n) => n + 1);
  }, []);

  const grade = useCallback(
    async (value: Grade) => {
      if (!session || !card || !session.revealed || busy) return;
      setBusy(true);
      setFailed(false);
      try {
        const spent = typing ? Math.round(clock.current.elapsed()) : Date.now() - session.shownAt;
        const response = await studyApi.review(card.id, value, spent);
        setLoad((l) => (l.status === "pronto" ? { status: "pronto", session: applyGrade(l.session, value, response, Date.now()) } : l));
        if (checkin) onExit?.();
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [session, card, busy, typing, checkin, onExit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (editing) return;
      // Digitando a resposta: qualquer letra vai para o campo (mesmo antes de ele ganhar foco), e não vira atalho.
      if (typing && session && !session.revealed && card && e.key.length === 1) {
        inputRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        // No check-in não tem saída pelo Esc: o card é a porta de entrada.
        if (!checkin) location.hash = routeHash("estudo");
      } else if (e.key === "e" && card) {
        e.preventDefault();
        setEditing(true);
      } else if (e.key === " " || e.key === "Enter") {
        if (session && !session.revealed && card) {
          e.preventDefault();
          if (typing) inputRef.current?.focus();
          else flip();
        } else if (e.key === "Enter" && session?.revealed && verdict?.suggestion) {
          e.preventDefault();
          void grade(verdict.suggestion);
        }
      } else if ((e.key === "r" || e.key === "R") && verdict && !verdict.correct && session?.revealed) {
        e.preventDefault();
        redo();
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        void grade(Number(e.key) as Grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, card, flip, grade, editing, checkin, typing, verdict, redo]);

  const back = checkin ? (
    <span className="eyebrow">Check-in de estudo</span>
  ) : (
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
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(34px * var(--fs, 1))", lineHeight: "calc(40px * var(--fs, 1))" }}>Nada para revisar</h1>
        <p className="muted">Todos os cards estão em dia. Volte mais tarde.</p>
        {onExit ? <button className="btn btn-pri" type="button" onClick={onExit}>Fechar</button> : <a className="btn btn-pri" href={routeHash("estudo")}>Voltar ao Estudo</a>}
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
          <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(34px * var(--fs, 1))", lineHeight: "calc(40px * var(--fs, 1))" }}>Sessão concluída</h1>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(130px, 100%), 1fr))", gap: 8 }}>
          <div className="stat card" style={{ padding: 14 }}><span className="v">{sum.cards}</span><br /><span className="l">cards</span></div>
          <div className="stat card" style={{ padding: 14 }}><span className="v">{sum.remembered}%</span><br /><span className="l">lembrados</span></div>
          <div className="stat card" style={{ padding: 14 }}><span className="v">{formatClock(seconds)}</span><br /><span className="l">minutos</span></div>
          <div className="stat card" style={{ padding: 14 }}><span className="v">{sum.struggled.length}</span><br /><span className="l">para reforçar</span></div>
        </div>
        <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Para reforçar</b>
          {sum.struggled.length === 0 && <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>Nada para reforçar. Nenhum card foi marcado como “De novo”.</span>}
          {sum.struggled.map((front) => (
            <div key={front} className="row" style={{ fontSize: "calc(13px * var(--fs, 1))", gap: 8, minHeight: 32, borderTop: "1px solid var(--border)" }}>
              <span className="badge bad" style={{ height: 20 }}>De novo</span>
              <span className="grow1 trunc">{front.replace(/\{\{|\}\}/g, "")}</span>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 8, justifyContent: "center" }}>
          {onExit ? (
            <button className="btn btn-pri" type="button" onClick={onExit}>Seguir para o dia</button>
          ) : (
            <a className="btn btn-pri" href={routeHash("estudo")}>Voltar ao Estudo</a>
          )}
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
        <span className="mono" style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)", whiteSpace: "nowrap" }}>{Math.min(done + 1, s.total)} de {s.total}</span>
      </div>
      <div className={s.revealed ? "flipon" : ""} style={{ width: "100%", maxWidth: 620, display: "flex", flexDirection: "column", gap: 22 }}>
        <div className="rise flipwrap" style={{ height: 300 }} key={`${card.id}-${s.results.length}`}>
          <div className="flipinner">
            <div className="face front" aria-hidden={s.revealed}>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge out" style={{ height: 20 }}>{card.kind === "basic" ? "básico" : "lacuna"}</span>
                {card.state === 0 && <span className="badge ac" style={{ height: 20 }}>novo</span>}
                {errors > 0 && <span className="badge" style={{ height: 20, background: "var(--danger-soft)", color: "var(--danger)" }}>{errors === 1 ? "errou 1 vez" : `errou ${errors} vezes`}</span>}
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: "calc(28px * var(--fs, 1))", lineHeight: "calc(36px * var(--fs, 1))", textWrap: "balance", overflowWrap: "anywhere" }}><Front card={card} /></div>
            </div>
            <div className="face back" aria-hidden={!s.revealed}>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge ok" style={{ height: 20 }}>resposta</span>
                {card.sourcePageId && <a href={pageHash(card.sourcePageId)} style={{ fontSize: "calc(12px * var(--fs, 1))", marginLeft: "auto" }}>Fonte: {card.sourceTitle ?? "página"}</a>}
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: "calc(26px * var(--fs, 1))", lineHeight: "calc(34px * var(--fs, 1))", textWrap: "balance", overflowWrap: "anywhere" }}><Back card={card} /></div>
              {card.kind === "cloze" && <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>{clozeAnswers(card.front)}</span>}
            </div>
          </div>
        </div>
        {editing ? (
          <div className="card" style={{ padding: 14 }}>
            <CardEditor
              card={card}
              onCancel={() => setEditing(false)}
              onSaved={(saved) => {
                setLoad((l) => (l.status === "pronto" ? { status: "pronto", session: replaceCurrent(l.session, saved) } : l));
                setEditing(false);
              }}
            />
          </div>
        ) : (
          <div className="row" style={{ justifyContent: "flex-end", marginTop: -12 }}>
            <button className="btn btn-fan btn-sm" type="button" onClick={() => setEditing(true)}>
              Editar card <span className="kbd">e</span>
            </button>
          </div>
        )}
        {!s.revealed && !editing && typing && (
          <form
            className="row"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              submitTyped();
            }}
          >
            <input
              ref={inputRef}
              className="inp grow1"
              value={typed}
              placeholder={card.kind === "cloze" ? "O que falta nas lacunas…" : "Sua resposta…"}
              aria-label="Sua resposta"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                clock.current.key();
                setTyped(e.target.value);
              }}
              style={{ height: 48, fontSize: "calc(16px * var(--fs, 1))" }}
            />
            <button className="btn btn-pri" type="submit" style={{ height: 48 }}>
              Conferir <span className="kbd" style={{ background: "transparent", color: "inherit", borderColor: "currentColor" }}>enter</span>
            </button>
            <button
              className="btn btn-fan"
              type="button"
              style={{ height: 48 }}
              onClick={() => {
                clock.current.pause();
                setTyped("");
                setErrors(errors + 1);
                setVerdict({ correct: false, latency: clock.current.latency(), suggestion: 1, errors: errors + 1 });
                flip();
              }}
            >
              Não sei
            </button>
          </form>
        )}
        {!s.revealed && !editing && !typing && (
          <button className="btn btn-pri" type="button" onClick={flip} style={{ height: 48, fontSize: "calc(15px * var(--fs, 1))" }}>
            Mostrar resposta <span className="kbd" style={{ background: "transparent", color: "inherit", borderColor: "currentColor" }}>espaço</span>
          </button>
        )}
        {s.revealed && verdict && (
          <div className="card" role="status" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, borderColor: verdict.correct ? "var(--success)" : "var(--danger)" }}>
            <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <b style={{ fontWeight: 600, color: verdict.correct ? "var(--success)" : "var(--danger)" }}>
                {verdict.correct ? (verdict.errors > 0 ? `Certo, depois de errar ${verdict.errors === 1 ? "1 vez" : `${verdict.errors} vezes`}` : "Certo") : verdict.errors >= 2 ? `Você errou ${verdict.errors} vezes` : "Você errou"}
              </b>
              <span className="muted" style={{ fontSize: "calc(13px * var(--fs, 1))" }}>
                {verdict.latency === null ? "tempo não medido (ficou parado mais de 1 min)" : `lembrou em ${formatSeconds(verdict.latency)}`}
              </span>
              {!verdict.correct && (
                <button className="btn btn-sec btn-sm" type="button" onClick={redo} style={{ marginLeft: "auto" }}>
                  Refazer agora <span className="kbd">r</span>
                </button>
              )}
            </span>
            {typed.trim() !== "" && (
              <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>
                Você digitou: <span style={{ color: "var(--text)" }}>{typed}</span>
              </span>
            )}
            <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)" }}>
              {verdict.suggestion ? (
                <>
                  {verdict.errors >= 2 ? "É recomendado" : "Sugestão"}: <b style={{ fontWeight: 600 }}>{RATES.find((r) => r.grade === verdict.suggestion)!.name}</b> · enter aceita, ou escolha outra (1–4)
                </>
              ) : (
                "Escolha a nota (1–4)."
              )}
            </span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
          {RATES.map((r, i) => (
            <button key={r.grade} className="rate" type="button" disabled={!s.revealed || busy} tabIndex={s.revealed ? 0 : -1} onClick={() => void grade(r.grade)} style={{ transitionDelay: `${i * 30}ms`, ...(s.revealed && verdict?.suggestion === r.grade ? { boxShadow: `inset 0 0 0 2px ${r.color}` } : {}) }}>
              <span style={{ font: "600 calc(14px * var(--fs, 1))/calc(18px * var(--fs, 1)) var(--sans)", color: r.color }}>{r.name}</span>
              <span>{formatInterval(now, card.preview[r.grade])}</span>
              <span className="kpad" style={{ marginTop: 2 }}>{r.grade}</span>
            </button>
          ))}
        </div>
        {failed && <span role="alert" style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--danger)", textAlign: "center" }}>Não foi possível salvar a avaliação. Tente de novo.</span>}
      </div>
    </div>
  );
}
