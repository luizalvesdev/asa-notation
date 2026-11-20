import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { agentApi, ApiError } from "./api";
import type { AgentCard, AgentEvent, AgentJob, AgentRepo, AgentState, CardThread, JobStatus } from "./agent-types";
import { askConfirm } from "./confirm";
import { cardHash, routeHash } from "./nav";
import { Reveal } from "./Reveal";
import type { Toast } from "./toast";

/**
 * Trabalho: os cards do Jira num quadro, e em cada card um chat com o Claude Code que roda na máquina do usuário
 * (tools/asa-runner). A primeira mensagem põe o agente para trabalhar; as seguintes continuam a mesma sessão.
 */

const BOARD_POLL_MS = 8000;
const CARD_POLL_MS = 4000;
const ONLINE_MS = 2 * 60_000;

const STATUS: Record<JobStatus, { label: string; badge: string }> = {
  queued: { label: "Na fila", badge: "badge out" },
  running: { label: "Trabalhando", badge: "badge ac" },
  review: { label: "Para revisar", badge: "badge warn" },
  changes: { label: "Na fila", badge: "badge out" },
  approved: { label: "Aprovado", badge: "badge ok" },
  done: { label: "Concluído", badge: "badge ok" },
  failed: { label: "Erro", badge: "badge bad" },
  canceled: { label: "Cancelado", badge: "badge" },
};

/** Linhas de sistema no chat (o que não é mensagem sua nem do Claude). */
const SYSTEM: Partial<Record<AgentEvent["kind"], string>> = {
  started: "O agente começou",
  review: "Pronto para revisar",
  approved: "Você aprovou",
  done: "Finalizado",
  failed: "Parou com erro",
  canceled: "Cancelado",
};

const FINISHED: ReadonlySet<JobStatus> = new Set(["done", "failed", "canceled"]);
/** O agente está com o job: não dá para mandar mensagem até ele parar. */
const BUSY: ReadonlySet<JobStatus> = new Set(["queued", "running", "changes", "approved"]);
/** Colunas do quadro, na ordem do fluxo do time. Status desconhecidos entram depois. */
const COLUMN_ORDER = ["pendente", "em andamento", "aguardando teste"];
const PROGRESS = /^\d+ ações até agora$/;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function ago(isoDate: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(isoDate)) / 1000));
  if (s < 60) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

const small = { fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" } as const;
const H1 = { fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(36px * var(--fs, 1))", lineHeight: "calc(42px * var(--fs, 1))", letterSpacing: "-.02em" } as const;

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return "O card mudou de situação. A tela foi atualizada.";
  return "Não foi possível falar com o servidor.";
}

/** Usa `load` agora, a cada `ms` com a tela visível e ao voltar para a aba. */
function usePolling(load: () => void, ms: number) {
  useEffect(() => {
    load();
    const timer = window.setInterval(() => document.visibilityState === "visible" && load(), ms);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, ms]);
}

function RunnerStatus({ seenAt, now }: { seenAt: string | null; now: number }) {
  const online = seenAt ? now - Date.parse(seenAt) < ONLINE_MS : false;
  return (
    <span className="row" style={{ gap: 8, ...small }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: online ? "var(--success)" : "var(--text-3, var(--text-2))" }} />
      {online ? "Agente online" : seenAt ? `Agente offline · último sinal ${ago(seenAt, now)}` : "O agente ainda não se conectou"}
    </span>
  );
}

function PrLinks({ job }: { job: AgentJob }) {
  if (job.prs.length > 1) return <>{job.prs.map((p) => <a key={p.url} className="btn btn-sec btn-sm" href={p.url} target="_blank" rel="noreferrer">PR {p.repo}</a>)}</>;
  return job.prUrl ? <a className="btn btn-sec btn-sm" href={job.prUrl} target="_blank" rel="noreferrer">Ver PR</a> : null;
}

// ---------- quadro ----------

function CardTile({ card, job }: { card: AgentCard; job: AgentJob | undefined }) {
  return (
    <a className="kb-tile plain" href={cardHash(card.ref)} style={{ padding: "10px 12px", borderRadius: 10, display: "flex", flexDirection: "column", gap: 6, color: "inherit", textDecoration: "none" }}>
      <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>{card.ref}</span>
        {job && <span className={STATUS[job.status].badge}>{job.cancelRequested ? "Cancelando" : STATUS[job.status].label}</span>}
      </span>
      <span style={{ fontSize: "calc(14px * var(--fs, 1))", fontWeight: 500, lineHeight: "calc(19px * var(--fs, 1))" }}>{card.title || card.ref}</span>
      {job?.summary && job.status === "review" && <span style={small}>{job.summary}</span>}
    </a>
  );
}

function Board({ state }: { state: AgentState }) {
  // O job mais recente de cada card que ainda não acabou (ou acabou com erro, para você ver).
  const jobByRef = new Map<string, AgentJob>();
  for (const j of state.jobs) if (!jobByRef.has(j.ref) && (!FINISHED.has(j.status) || j.status === "failed")) jobByRef.set(j.ref, j);

  const columns = new Map<string, { name: string; cards: AgentCard[] }>();
  for (const c of state.cards) {
    const key = norm(c.status || "sem status");
    if (!columns.has(key)) columns.set(key, { name: c.status || "Sem status", cards: [] });
    columns.get(key)!.cards.push(c);
  }
  const rank = (key: string) => {
    const i = COLUMN_ORDER.indexOf(key);
    return i < 0 ? COLUMN_ORDER.length : i;
  };
  const ordered = [...columns.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([, col]) => col);

  if (state.cards.length === 0) return <span style={small}>Nenhum card ainda. Eles aparecem quando o agente sincroniza com o Jira.</span>;
  return (
    <div className="kanban" role="list" aria-label="Cards por status" style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 8, margin: "0 -20px", paddingLeft: 20, paddingRight: 20 }}>
      {ordered.map((col) => (
        <section key={col.name} role="listitem" aria-label={col.name} style={{ flex: "1 1 0", minWidth: 272, scrollSnapAlign: "start", display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-2)", borderRadius: 12, padding: 10 }}>
          <h2 className="row" style={{ gap: 8, fontSize: "calc(13px * var(--fs, 1))", fontWeight: 600, color: "var(--text-2)", padding: "2px 4px" }}>
            {col.name}
            <span style={{ fontWeight: 400 }}>{col.cards.length}</span>
          </h2>
          {col.cards.map((c) => <CardTile key={c.ref} card={c} job={jobByRef.get(c.ref)} />)}
        </section>
      ))}
    </div>
  );
}

// ---------- chat do card ----------

/** Uma linha do texto do Claude: títulos "##" em negrito e `código` em fonte mono. */
function Line({ line }: { line: string }) {
  const heading = /^#{1,4}\s+(.*)$/.exec(line);
  const content = heading ? heading[1]! : line;
  const bits = content.split(/`([^`]+)`/);
  const inner = bits.map((b, i) => (i % 2 === 1 ? <code key={i} className="mono reply-code">{b}</code> : b));
  return heading ? <strong style={{ display: "block", marginTop: 4 }}>{inner}</strong> : <>{inner}{"\n"}</>;
}

/** Texto do Claude com os blocos de código separados (sem renderizar Markdown inteiro). */
function ReplyText({ text }: { text: string }) {
  const parts = text.split(/```[^\n]*\n?/);
  return (
    <div className="col" style={{ gap: 8, minWidth: 0, flex: 1 }}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="mono" style={{ margin: 0, padding: "8px 10px", background: "var(--bg-2)", borderRadius: 8, overflowX: "auto", fontSize: "calc(12px * var(--fs, 1))", lineHeight: 1.5 }}>{part.replace(/\n$/, "")}</pre>
        ) : (
          part.trim() && (
            <div key={i} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {part.trim().split("\n").map((line, j) => <Line key={j} line={line} />)}
            </div>
          )
        ),
      )}
    </div>
  );
}

function SystemLine({ children }: { children: ReactNode }) {
  return <div style={{ ...small, textAlign: "center", padding: "2px 0" }}>{children}</div>;
}

function JobMessages({ job, events, now }: { job: AgentJob; events: AgentEvent[]; now: number }) {
  return (
    <>
      <SystemLine>
        {[job.repos.join(" · "), job.base && `a partir de ${job.base}`].filter(Boolean).join(" ") || "Novo trabalho"} · {ago(job.createdAt, now)}
      </SystemLine>
      {events.map((e) => {
        if (e.kind === "created" || e.kind === "feedback") return e.text ? <div key={e.id} className="bub-u" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{e.text}</div> : <SystemLine key={e.id}>Você mandou o agente sem instruções</SystemLine>;
        if (e.kind === "reply")
          return (
            <div key={e.id} className="bub-a">
              <span className="av u" aria-hidden="true">C</span>
              <ReplyText text={e.text} />
            </div>
          );
        if (e.kind === "progress") return PROGRESS.test(e.text) ? null : <SystemLine key={e.id}>{e.text}</SystemLine>;
        const label = SYSTEM[e.kind];
        return label ? <SystemLine key={e.id}>{e.text ? `${label} · ${e.text}` : label}</SystemLine> : null;
      })}
    </>
  );
}

function RepoPicker({ repos, picked, setPicked, base, setBase }: { repos: AgentRepo[]; picked: string[]; setPicked: (f: (l: string[]) => string[]) => void; base: string; setBase: (v: string) => void }) {
  if (repos.length === 0) return null;
  const hint = [...new Set(repos.filter((r) => picked.includes(r.name)).map((r) => r.base))].join(", ");
  return (
    <div className="col" style={{ gap: 8 }}>
      {repos.length > 1 && (
        <div className="row" role="group" aria-label="Repositórios" style={{ gap: 6, flexWrap: "wrap" }}>
          {repos.map((r) => {
            const on = picked.includes(r.name);
            return (
              <button key={r.name} className="btn btn-sec btn-sm repo-chip" type="button" aria-pressed={on} onClick={() => setPicked((l) => (on ? l.filter((n) => n !== r.name) : [...l, r.name]))}>
                {r.name}
              </button>
            );
          })}
        </div>
      )}
      <input className="inp" value={base} onChange={(e) => setBase(e.target.value)} placeholder={hint ? `Branch de partida (padrão: ${hint})` : "Branch de partida"} aria-label="Branch de partida" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
    </div>
  );
}

function CardChat({ cardRef, onToast }: { cardRef: string; onToast: (t: Toast) => void }) {
  const [data, setData] = useState<CardThread | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [base, setBase] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(() => {
    agentApi
      .thread(cardRef)
      .then((d) => {
        setData(d);
        setFailed(false);
        setNow(Date.now());
      })
      .catch(() => setFailed(true));
  }, [cardRef]);
  const current = data?.thread.at(-1)?.job ?? null;
  usePolling(load, current && !FINISHED.has(current.status) ? CARD_POLL_MS : BOARD_POLL_MS);

  // Desce para a última mensagem quando chega coisa nova.
  const count = data?.thread.reduce((n, t) => n + t.events.length, 0) ?? 0;
  useEffect(() => {
    if (count > lastCount.current) endRef.current?.scrollIntoView({ block: "end", behavior: lastCount.current === 0 ? "auto" : "smooth" });
    lastCount.current = count;
  }, [count]);

  const repos = data?.repos ?? [];
  const chosen = picked ?? (repos[0] ? [repos[0].name] : []);
  const working = current !== null && BUSY.has(current.status);
  const canReply = current !== null && (current.status === "review" || current.status === "failed");
  const startsNew = current === null || current.status === "done" || current.status === "canceled";
  const actions = current?.status === "running" ? [...(data?.thread.at(-1)?.events ?? [])].reverse().find((e) => e.kind === "progress" && PROGRESS.test(e.text))?.text : undefined;

  const run = (p: Promise<unknown>, done?: string) => {
    setBusy(true);
    return p
      .then(() => {
        if (done) onToast({ text: done });
        return true;
      })
      .catch((err) => {
        onToast({ text: errorText(err) });
        return false;
      })
      .finally(() => {
        setBusy(false);
        load();
      });
  };

  const send = () => {
    const message = text.trim();
    if (busy || working) return;
    if (startsNew) {
      void run(agentApi.create(cardRef, message, chosen, base.trim() || null)).then((ok) => ok && setText(""));
    } else if (canReply && current && message) {
      void run(agentApi.feedback(current.id, message)).then((ok) => ok && setText(""));
    }
  };

  const card = data?.card;
  const title = card?.title || current?.title || cardRef;
  const jiraUrl = card?.url ?? current?.url ?? null;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 0", display: "flex", flexDirection: "column", gap: 14, minHeight: "100%" }}>
      <a href={routeHash("agente")} style={{ ...small, textDecoration: "none" }}>← Trabalho</a>
      <header className="col" style={{ gap: 6 }}>
        <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {jiraUrl ? <a className="mono" href={jiraUrl} target="_blank" rel="noreferrer" style={{ fontSize: "calc(12px * var(--fs, 1))" }}>{cardRef}</a> : <span className="mono" style={{ fontSize: "calc(12px * var(--fs, 1))" }}>{cardRef}</span>}
          {card?.status && <span className="badge out">{card.status}</span>}
          {current && <span className={STATUS[current.status].badge}>{current.cancelRequested ? "Cancelando" : STATUS[current.status].label}</span>}
        </span>
        <h1 style={{ ...H1, fontSize: "calc(26px * var(--fs, 1))", lineHeight: "calc(32px * var(--fs, 1))" }}>{title}</h1>
        {data && <RunnerStatus seenAt={data.runnerSeenAt} now={now} />}
      </header>

      {current && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {current.summary && <span style={{ ...small, flexBasis: "100%" }}>{current.summary}</span>}
          <PrLinks job={current} />
          {current.status === "review" && (
            <button className="btn btn-pri btn-sm" type="button" disabled={busy} onClick={() => void askConfirm({ title: `Aprovar ${cardRef}?`, body: "O agente tira os PRs de rascunho e move o card no Jira.", confirmLabel: "Aprovar" }).then((ok) => ok && run(agentApi.approve(current.id), `${cardRef} aprovado`))}>
              Aprovar
            </button>
          )}
          {!FINISHED.has(current.status) && !current.cancelRequested && (
            <button className="btn btn-fan btn-sm" type="button" disabled={busy} onClick={() => void askConfirm({ title: `Cancelar o trabalho em ${cardRef}?`, body: "O agente para o que estiver fazendo. As branches ficam na sua máquina.", confirmLabel: "Cancelar trabalho" }).then((ok) => ok && run(agentApi.cancel(current.id), "Cancelamento pedido"))}>
              Cancelar
            </button>
          )}
        </div>
      )}

      {!data && !failed && <span className="sk" style={{ height: 160, borderRadius: 10 }} aria-busy="true" aria-label="Carregando" />}
      {failed && !data && <div className="card" role="alert" style={{ padding: 16 }}>Não foi possível carregar o card.</div>}

      {data && (
        <div className="col" role="log" aria-live="polite" aria-label={`Conversa com o agente sobre ${cardRef}`} style={{ gap: 12, flex: 1 }}>
          {data.thread.length === 0 && <SystemLine>Escreva o que o agente deve fazer neste card. Ele lê o card no Jira antes de começar.</SystemLine>}
          {data.thread.map((t) => <JobMessages key={t.job.id} job={t.job} events={t.events} now={now} />)}
          {working && (
            <div className="bub-a" aria-label="O agente está trabalhando">
              <span className="av u" aria-hidden="true">C</span>
              <span style={small}>
                {current?.status === "running" ? `Trabalhando${actions ? ` · ${actions}` : ""}` : current?.status === "approved" ? "Finalizando: PRs e card no Jira" : "Na fila do agente"}
                <span className="hcaret" style={{ marginLeft: 6 }} />
              </span>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {data && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="col agent-composer"
          style={{ gap: 8, position: "sticky", bottom: 0, background: "var(--bg)", padding: "10px 0 calc(16px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)" }}
        >
          <Reveal show={startsNew}>
            <RepoPicker repos={repos} picked={chosen} setPicked={(f) => setPicked(f(chosen))} base={base} setBase={setBase} />
          </Reveal>
          <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
            <textarea
              className="inp grow1"
              rows={2}
              value={text}
              disabled={working}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={working ? "O agente está trabalhando. Você responde quando ele parar." : startsNew ? "O que o agente deve fazer neste card? (opcional)" : "Responda ou peça uma mudança"}
              aria-label="Mensagem para o agente"
              style={{ height: "auto", padding: 10, resize: "none", minHeight: 44 }}
            />
            <button className="btn btn-pri" type="submit" disabled={busy || working || (startsNew ? repos.length > 1 && chosen.length === 0 : !canReply || text.trim() === "")}>
              {startsNew ? "Mandar" : "Enviar"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------- tela ----------

function BoardView() {
  const [state, setState] = useState<AgentState | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const load = useCallback(() => {
    agentApi
      .state()
      .then((s) => {
        setState(s);
        setFailed(false);
        setNow(Date.now());
      })
      .catch(() => setFailed(true));
  }, []);
  usePolling(load, BOARD_POLL_MS);

  return (
    <div style={{ width: "100%", padding: "36px 20px 120px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="col" style={{ gap: 6 }}>
        <h1 style={H1}>Trabalho</h1>
        {state && <RunnerStatus seenAt={state.runnerSeenAt} now={now} />}
      </div>
      {!state && !failed && <span className="sk" style={{ height: 160, borderRadius: 10 }} aria-busy="true" aria-label="Carregando" />}
      {failed && !state && <div className="card" role="alert" style={{ padding: 16 }}>Não foi possível carregar.</div>}
      {state && <Board state={state} />}
    </div>
  );
}

export function AgenteView({ cardRef, onToast }: { cardRef?: string; onToast: (t: Toast) => void }) {
  return cardRef ? <CardChat cardRef={cardRef} onToast={onToast} /> : <BoardView />;
}
