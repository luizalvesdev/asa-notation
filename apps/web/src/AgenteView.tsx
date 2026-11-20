import { useCallback, useEffect, useState } from "react";
import { agentApi, ApiError } from "./api";
import type { AgentCard, AgentEvent, AgentJob, AgentRepo, AgentState, JobStatus } from "./agent-types";
import { askConfirm } from "./confirm";
import { Reveal } from "./Reveal";
import type { Toast } from "./toast";

/**
 * Trabalho: os cards do Jira e os jobs do agente que roda na máquina do usuário (tools/asa-runner).
 * Aqui só ficam chave, título, status e links. O código e a descrição dos cards nunca passam pelo asa.
 */

const POLL_MS = 8000;
const ONLINE_MS = 2 * 60_000;

const STATUS: Record<JobStatus, { label: string; badge: string }> = {
  queued: { label: "Na fila", badge: "badge out" },
  running: { label: "Trabalhando", badge: "badge ac" },
  review: { label: "Para revisar", badge: "badge warn" },
  changes: { label: "Mudança pedida", badge: "badge out" },
  approved: { label: "Aprovado", badge: "badge ok" },
  done: { label: "Concluído", badge: "badge ok" },
  failed: { label: "Erro", badge: "badge bad" },
  canceled: { label: "Cancelado", badge: "badge" },
};

const EVENT: Record<AgentEvent["kind"], string> = {
  created: "Pedido criado",
  started: "O agente começou",
  progress: "Andamento",
  review: "Pronto para revisar",
  feedback: "Você pediu mudança",
  approved: "Você aprovou",
  done: "Finalizado",
  failed: "Erro",
  canceled: "Cancelado",
};

const FINISHED: ReadonlySet<JobStatus> = new Set(["done", "failed", "canceled"]);

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
const H2 = { fontSize: "calc(13px * var(--fs, 1))", fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: ".04em" } as const;

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return "Esse job mudou de situação. A tela foi atualizada.";
  return "Não foi possível falar com o servidor.";
}

function NewJob({ card, repos, onCreated, onToast }: { card: AgentCard; repos: AgentRepo[]; onCreated: () => void; onToast: (t: Toast) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>(() => (repos[0] ? [repos[0].name] : []));
  const [base, setBase] = useState("");
  const toggle = (name: string) => setPicked((list) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]));
  const bases = repos.filter((r) => picked.includes(r.name)).map((r) => r.base);
  const baseHint = [...new Set(bases)].join(", ");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        agentApi
          .create(card.ref, text.trim(), picked, base.trim() || null)
          .then(() => {
            onToast({ text: `${card.ref} foi para a fila do agente` });
            onCreated();
          })
          .catch((err) => onToast({ text: err instanceof ApiError && err.status === 409 ? `${card.ref} já tem um job em andamento.` : errorText(err) }))
          .finally(() => setBusy(false));
      }}
      style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 10 }}
    >
      {repos.length > 1 && (
        <div className="row" role="group" aria-label="Repositórios" style={{ gap: 6, flexWrap: "wrap" }}>
          {repos.map((r) => (
            <button key={r.name} className={`btn btn-sec btn-sm${picked.includes(r.name) ? " on" : ""}`} type="button" aria-pressed={picked.includes(r.name)} onClick={() => toggle(r.name)}>
              {r.name}
            </button>
          ))}
        </div>
      )}
      {repos.length > 0 && (
        <input className="inp" value={base} onChange={(e) => setBase(e.target.value)} placeholder={baseHint ? `Branch de partida (padrão: ${baseHint})` : "Branch de partida"} aria-label="Branch de partida" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      )}
      <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Instruções para o agente (opcional). Ex.: comece pelo checkout, não mexa no layout." aria-label={`Instruções para ${card.ref}`} style={{ height: "auto", padding: 10, resize: "vertical" }} />
      <button className="btn btn-pri btn-sm" type="submit" disabled={busy || (repos.length > 1 && picked.length === 0)} style={{ alignSelf: "flex-start" }}>
        Mandar o agente
      </button>
    </form>
  );
}

function CardRow({ card, job, repos, onCreated, onToast }: { card: AgentCard; job: AgentJob | undefined; repos: AgentRepo[]; onCreated: () => void; onToast: (t: Toast) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ padding: "12px 14px", borderRadius: 10 }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <div className="grow1" style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {card.url ? (
              <a className="mono" href={card.url} target="_blank" rel="noreferrer" style={{ fontSize: "calc(12px * var(--fs, 1))" }}>{card.ref}</a>
            ) : (
              <span className="mono" style={{ fontSize: "calc(12px * var(--fs, 1))" }}>{card.ref}</span>
            )}
            {card.status && <span className="badge out">{card.status}</span>}
            {job && <span className={STATUS[job.status].badge}>{STATUS[job.status].label}</span>}
          </span>
          <span style={{ fontSize: "calc(14px * var(--fs, 1))", fontWeight: 500 }}>{card.title || card.ref}</span>
        </div>
        {!job && (
          <button className={`btn btn-sec btn-sm${open ? " on" : ""}`} type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? "Fechar" : "Agente"}
          </button>
        )}
      </div>
      <Reveal show={open && !job}>
        <NewJob card={card} repos={repos} onToast={onToast} onCreated={() => { setOpen(false); onCreated(); }} />
      </Reveal>
    </div>
  );
}

function JobRow({ job, now, onChanged, onToast }: { job: AgentJob; now: number; onChanged: () => void; onToast: (t: Toast) => void }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AgentEvent[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    agentApi.job(job.id).then((d) => live && setEvents(d.events)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, job.id, job.updatedAt]);

  const run = (p: Promise<unknown>, done: string) => {
    setBusy(true);
    p.then(() => {
      onToast({ text: done });
      setAsking(false);
      setText("");
    })
      .catch((err) => onToast({ text: errorText(err) }))
      .finally(() => {
        setBusy(false);
        onChanged();
      });
  };

  const canAsk = job.status === "review" || job.status === "failed";
  const s = STATUS[job.status];
  return (
    <div className="card" style={{ padding: "12px 14px", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <button className="plain" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left", cursor: "pointer" }}>
        <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="mono" style={{ fontSize: "calc(12px * var(--fs, 1))" }}>{job.ref}</span>
          <span className={s.badge}>{job.cancelRequested ? "Cancelando" : s.label}</span>
          <span style={small}>{ago(job.updatedAt, now)}</span>
        </span>
        <span style={{ fontSize: "calc(14px * var(--fs, 1))", fontWeight: 500 }}>{job.title || job.ref}</span>
        {(job.repos.length > 0 || job.base) && <span className="mono" style={small}>{[job.repos.join(" · "), job.base && `a partir de ${job.base}`].filter(Boolean).join(" ")}</span>}
        {job.summary && <span style={small}>{job.summary}</span>}
      </button>

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {job.prs.length > 1
          ? job.prs.map((p) => <a key={p.url} className="btn btn-sec btn-sm" href={p.url} target="_blank" rel="noreferrer">PR {p.repo}</a>)
          : job.prUrl && <a className="btn btn-sec btn-sm" href={job.prUrl} target="_blank" rel="noreferrer">Ver PR</a>}
        {job.url && <a className="btn btn-fan btn-sm" href={job.url} target="_blank" rel="noreferrer">Jira</a>}
        {job.status === "review" && (
          <button
            className="btn btn-pri btn-sm"
            type="button"
            disabled={busy}
            onClick={() => void askConfirm({ title: `Aprovar ${job.ref}?`, body: "O agente tira o PR de rascunho e move o card no Jira.", confirmLabel: "Aprovar" }).then((ok) => ok && run(agentApi.approve(job.id), `${job.ref} aprovado`))}
          >
            Aprovar
          </button>
        )}
        {canAsk && (
          <button className={`btn btn-sec btn-sm${asking ? " on" : ""}`} type="button" aria-expanded={asking} onClick={() => setAsking((v) => !v)}>
            Pedir mudança
          </button>
        )}
        {!FINISHED.has(job.status) && !job.cancelRequested && (
          <button
            className="btn btn-fan btn-sm"
            type="button"
            disabled={busy}
            onClick={() => void askConfirm({ title: `Cancelar ${job.ref}?`, body: "O agente para o que estiver fazendo. A branch fica na sua máquina.", confirmLabel: "Cancelar job" }).then((ok) => ok && run(agentApi.cancel(job.id), "Cancelamento pedido"))}
          >
            Cancelar
          </button>
        )}
      </div>

      <Reveal show={asking && canAsk}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) run(agentApi.feedback(job.id, text.trim()), "Pedido enviado ao agente");
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="O que mudar" aria-label="O que mudar" style={{ height: "auto", padding: 10, resize: "vertical" }} />
          <button className="btn btn-pri btn-sm" type="submit" disabled={busy || text.trim() === ""} style={{ alignSelf: "flex-start" }}>Enviar</button>
        </form>
      </Reveal>

      <Reveal show={open}>
        <ol style={{ listStyle: "none", margin: 0, padding: "6px 0 0", display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)" }}>
          {events === null && <li style={small}>Carregando…</li>}
          {events?.map((e) => (
            <li key={e.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={small}>{EVENT[e.kind]} · {ago(e.createdAt, now)}</span>
              {e.text && <span style={{ fontSize: "calc(13px * var(--fs, 1))", whiteSpace: "pre-wrap" }}>{e.text}</span>}
            </li>
          ))}
        </ol>
      </Reveal>
    </div>
  );
}

export function AgenteView({ onToast }: { onToast: (t: Toast) => void }) {
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

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const online = state?.runnerSeenAt ? now - Date.parse(state.runnerSeenAt) < ONLINE_MS : false;
  const active = state?.jobs.filter((j) => !FINISHED.has(j.status)) ?? [];
  const history = state?.jobs.filter((j) => FINISHED.has(j.status)).slice(0, 15) ?? [];
  const activeByRef = new Map(active.map((j) => [j.ref, j]));

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 20px 120px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(36px * var(--fs, 1))", lineHeight: "calc(42px * var(--fs, 1))", letterSpacing: "-.02em" }}>Trabalho</h1>
        {state && (
          <span className="row" style={{ gap: 8, ...small }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: online ? "var(--success)" : "var(--text-3, var(--text-2))" }} />
            {online ? "Agente online" : state.runnerSeenAt ? `Agente offline · último sinal ${ago(state.runnerSeenAt, now)}` : "O agente ainda não se conectou"}
          </span>
        )}
      </div>

      {!state && !failed && <span className="sk" style={{ height: 120, borderRadius: 10 }} aria-busy="true" aria-label="Carregando" />}
      {failed && !state && <div className="card" role="alert" style={{ padding: 16 }}>Não foi possível carregar.</div>}

      {state && (
        <>
          {active.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={H2}>Em andamento</h2>
              {active.map((j) => <JobRow key={j.id} job={j} now={now} onChanged={load} onToast={onToast} />)}
            </section>
          )}
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={H2}>Meus cards</h2>
            {state.cards.length === 0 && <span style={small}>Nenhum card ainda. Eles aparecem quando o agente sincroniza com o Jira.</span>}
            {state.cards.map((c) => <CardRow key={c.ref} card={c} job={activeByRef.get(c.ref)} repos={state.repos ?? []} onCreated={load} onToast={onToast} />)}
          </section>
          {history.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={H2}>Histórico</h2>
              {history.map((j) => <JobRow key={j.id} job={j} now={now} onChanged={load} onToast={onToast} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
