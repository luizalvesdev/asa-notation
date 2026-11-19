import { useEffect, useMemo, useState } from "react";
import { goalsApi, progressApi } from "./api";
import { goalPct, goalStatus, STATUS_BADGE, STATUS_LABEL, tasksLabel } from "./goals-logic";
import type { Goal } from "./goals-types";
import { routeHash } from "./nav";
import { activityLevel, formatStudy } from "./routine-logic";
import type { ProgressData } from "./routine-types";
import { formatDate, localDate, localTimeZone } from "./tasks-dates";

const WEEKS = 12;

function WeekBars({ values, label, color }: { values: { key: string; value: number; title: string }[]; label: string; color: string }) {
  const max = Math.max(1, ...values.map((v) => v.value));
  return (
    <div role="img" aria-label={label} style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
      {values.map((v) => (
        <div key={v.key} title={v.title} style={{ flex: 1, height: `${v.value === 0 ? 3 : Math.max(8, (v.value / max) * 100)}%`, background: v.value === 0 ? "var(--hover)" : color, borderRadius: 4, transformOrigin: "bottom", animation: "grow var(--lento) var(--entrada) both" }} />
      ))}
    </div>
  );
}

const LEVEL_OPACITY = [0, 0.25, 0.45, 0.7, 1];

export function ProgressoView() {
  const today = localDate();
  const [load, setLoad] = useState<{ status: "carregando" | "erro" | "pronto"; data?: ProgressData; goals: Goal[] }>({ status: "carregando", goals: [] });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad((l) => ({ ...l, status: "carregando" }));
    Promise.all([progressApi.get(today, localTimeZone(), WEEKS), goalsApi.list()])
      .then(([data, goals]) => live && setLoad({ status: "pronto", data, goals }))
      .catch(() => live && setLoad((l) => ({ ...l, status: "erro" })));
    return () => {
      live = false;
    };
  }, [today, attempt]);

  const data = load.data;
  const totals = useMemo(() => {
    if (!data) return null;
    return data.weeks.reduce((t, w) => ({ tasks: t.tasks + w.tasks, reviews: t.reviews + w.reviews, seconds: t.seconds + w.seconds, activeDays: t.activeDays + w.activeDays }), { tasks: 0, reviews: 0, seconds: 0, activeDays: 0 });
  }, [data]);
  const maxDay = data ? Math.max(0, ...data.days.map((d) => d.tasks + d.reviews)) : 0;

  return (
    <div style={{ padding: "36px 40px 120px", maxWidth: 1120, display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(40px * var(--fs, 1))", lineHeight: "calc(44px * var(--fs, 1))", letterSpacing: "-.02em" }}>Progresso</h1>
        <span className="muted" style={{ fontSize: "calc(15px * var(--fs, 1))", paddingBottom: 4 }}>últimas {WEEKS} semanas</span>
      </div>

      {load.status === "carregando" && <span className="sk" style={{ height: 200, borderRadius: 12 }} aria-busy="true" aria-label="Carregando o progresso" />}
      {load.status === "erro" && (
        <div className="card" role="alert" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Não foi possível carregar o progresso.</span>
          <button className="btn btn-sec btn-sm" type="button" onClick={() => setAttempt((a) => a + 1)} style={{ marginLeft: "auto" }}>Tentar de novo</button>
        </div>
      )}

      {load.status === "pronto" && data && totals && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: 12 }}>
            <div className="stat card rise" style={{ padding: 16 }}><span className="v">{totals.tasks}</span><br /><span className="l">tarefas concluídas</span></div>
            <div className="stat card rise" style={{ padding: 16, animationDelay: "40ms" }}><span className="v">{totals.reviews}</span><br /><span className="l">cards revisados</span></div>
            <div className="stat card rise" style={{ padding: 16, animationDelay: "80ms" }}><span className="v">{formatStudy(totals.seconds)}</span><br /><span className="l">de estudo</span></div>
            <div className="stat card rise" style={{ padding: 16, animationDelay: "120ms" }}><span className="v">{data.streak}</span><br /><span className="l">{data.streak === 1 ? "dia seguido" : "dias seguidos"}</span></div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <div className="card" style={{ flex: "1 1 320px", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Tarefas concluídas por semana</b>
              <WeekBars color="var(--accent)" label="Tarefas concluídas por semana" values={data.weeks.map((w) => ({ key: w.start, value: w.tasks, title: `Semana de ${formatDate(w.start)}: ${w.tasks}` }))} />
            </div>
            <div className="card" style={{ flex: "1 1 320px", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Cards revisados por semana</b>
              <WeekBars color="var(--hermes)" label="Cards revisados por semana" values={data.weeks.map((w) => ({ key: w.start, value: w.reviews, title: `Semana de ${formatDate(w.start)}: ${w.reviews}` }))} />
            </div>
          </div>

          <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="row">
              <b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Constância</b>
              <span style={{ marginLeft: "auto", fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)" }}>{totals.activeDays} de {WEEKS * 7} dias com atividade</span>
            </div>
            <div role="img" aria-label="Mapa de constância: um quadrado por dia, de segunda a domingo, por semana" style={{ display: "grid", gridTemplateColumns: `repeat(${WEEKS}, 22px)`, gridTemplateRows: "repeat(7, 22px)", gridAutoFlow: "column", gap: 4, maxWidth: "100%", overflowX: "auto" }}>
              {data.days.map((d) => {
                const level = activityLevel(d.tasks + d.reviews, maxDay);
                return <span key={d.day} title={`${formatDate(d.day)}: ${d.tasks} tarefas, ${d.reviews} cards`} style={{ borderRadius: 4, background: level === 0 ? "var(--hover)" : "var(--accent)", opacity: level === 0 ? 1 : LEVEL_OPACITY[level], outline: d.day === today ? "2px solid var(--text)" : undefined, outlineOffset: 1 }} />;
              })}
            </div>
          </div>

          <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="row"><b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Metas</b><a href={routeHash("metas")} style={{ marginLeft: "auto", fontSize: "calc(12px * var(--fs, 1))" }}>Ver todas</a></div>
            {load.goals.filter((g) => !g.done).length === 0 && <span style={{ fontSize: "calc(14px * var(--fs, 1))", color: "var(--text-2)" }}>Nenhuma meta ativa.</span>}
            {load.goals.filter((g) => !g.done).map((g) => {
              const status = goalStatus(g, today);
              return (
                <a key={g.id} href={routeHash("metas")} className="col" style={{ gap: 6, textDecoration: "none", color: "var(--text)" }}>
                  <span className="row" style={{ fontSize: "calc(13px * var(--fs, 1))" }}><span className="grow1 trunc">{g.title}</span><span className={STATUS_BADGE[status]} style={{ height: 20 }}>{STATUS_LABEL[status]}</span></span>
                  <div className="bar"><span style={{ width: `${goalPct(g)}%` }} /></div>
                  <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)" }}>{goalPct(g)}% · {tasksLabel(g)}{g.dueDate ? ` · prazo ${formatDate(g.dueDate)}` : ""}</span>
                </a>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
