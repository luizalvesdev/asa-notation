import { useEffect, useState } from "react";
import { studyApi } from "./api";
import { routeHash } from "./nav";
import { fillDays, formatClock } from "./study-logic";
import type { Stats } from "./study-types";
import { addDays, localDate, localTimeZone } from "./tasks-dates";

type Load = { status: "carregando" } | { status: "erro" } | { status: "pronto"; stats: Stats };

const DAYS = 30;

function Bars({ values, label, color = "var(--accent)" }: { values: { key: string; value: number; title: string }[]; label: string; color?: string }) {
  const max = Math.max(1, ...values.map((v) => v.value));
  return (
    <div role="img" aria-label={label} style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
      {values.map((v) => (
        <div key={v.key} title={v.title} style={{ flex: 1, minWidth: 2, height: `${Math.max(v.value === 0 ? 2 : 6, (v.value / max) * 100)}%`, background: v.value === 0 ? "var(--hover)" : color, borderRadius: 3 }} />
      ))}
    </div>
  );
}

export function StatsView() {
  const [load, setLoad] = useState<Load>({ status: "carregando" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ status: "carregando" });
    studyApi
      .stats(localTimeZone(), DAYS)
      .then((stats) => live && setLoad({ status: "pronto", stats }))
      .catch(() => live && setLoad({ status: "erro" }));
    return () => {
      live = false;
    };
  }, [attempt]);

  const today = localDate();
  return (
    <div className="screen screen-col">
      <div className="screen-head">
        <h1 className="screen-title">Estatísticas</h1>
        <span className="muted screen-sub">últimos {DAYS} dias</span>
        <a className="btn btn-fan btn-sm" href={routeHash("estudo")} style={{ marginLeft: "auto" }}>Voltar ao Estudo</a>
      </div>

      {load.status === "carregando" && <span className="sk" style={{ height: 200, borderRadius: 12 }} aria-busy="true" aria-label="Carregando as estatísticas" />}
      {load.status === "erro" && (
        <div className="card" role="alert" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Não foi possível carregar as estatísticas.</span>
          <button className="btn btn-sec btn-sm" type="button" onClick={() => setAttempt((a) => a + 1)} style={{ marginLeft: "auto" }}>Tentar de novo</button>
        </div>
      )}

      {load.status === "pronto" && (() => {
        const s = load.stats;
        const days = fillDays(s, today, DAYS);
        const totalCards = s.states.new + s.states.learning + s.states.review + s.states.relearning;
        const upcoming = Array.from({ length: 7 }, (_, i) => {
          const day = addDays(today, i);
          return { day, due: s.upcoming.find((u) => u.day === day)?.due ?? 0 };
        });
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: 12 }}>
              <div className="stat card" style={{ padding: 16 }}><span className="v">{s.reviews}</span><br /><span className="l">revisões</span></div>
              <div className="stat card" style={{ padding: 16 }}><span className="v">{s.retention === null ? "—" : `${Math.round(s.retention * 100)}%`}</span><br /><span className="l">retenção em cards de revisão</span></div>
              <div className="stat card" style={{ padding: 16 }}><span className="v">{formatClock(s.seconds)}</span><br /><span className="l">tempo estudado (min)</span></div>
              <div className="stat card" style={{ padding: 16 }}><span className="v">{totalCards}</span><br /><span className="l">cards no total</span></div>
            </div>

            <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Revisões por dia</b>
              {s.reviews === 0 ? (
                <span style={{ fontSize: "calc(14px * var(--fs, 1))", color: "var(--text-2)" }}>Ainda não há revisões neste período.</span>
              ) : (
                <Bars label="Revisões por dia nos últimos 30 dias" values={days.map((d) => ({ key: d.day, value: d.reviews, title: `${d.day}: ${d.reviews} ${d.reviews === 1 ? "revisão" : "revisões"}` }))} />
              )}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <div className="card" style={{ flex: "1 1 320px", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                <b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Próximos 7 dias</b>
                <Bars color="var(--hermes)" label="Cards a revisar nos próximos 7 dias" values={upcoming.map((u) => ({ key: u.day, value: u.due, title: `${u.day}: ${u.due} para revisar` }))} />
                <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)" }}>Hoje inclui os cards atrasados.</span>
              </div>
              <div className="card" style={{ flex: "1 1 320px", padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                <b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Estado dos cards</b>
                {([["Novos", s.states.new], ["Aprendendo", s.states.learning], ["Em revisão", s.states.review], ["Reaprendendo", s.states.relearning]] as const).map(([label, n]) => (
                  <div key={label} className="row" style={{ gap: 12, fontSize: "calc(13px * var(--fs, 1))" }}>
                    <span style={{ width: 110 }}>{label}</span>
                    <div className="bar grow1"><span style={{ width: `${totalCards === 0 ? 0 : (n / totalCards) * 100}%`, animation: "none" }} /></div>
                    <span className="mono" style={{ width: 28, textAlign: "right" }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              <b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Cards mais errados</b>
              {s.hardest.length === 0 && <span style={{ fontSize: "calc(14px * var(--fs, 1))", color: "var(--text-2)" }}>Nenhum erro registrado no período.</span>}
              {s.hardest.map((h) => (
                <div key={h.id} className="row" style={{ gap: 8, fontSize: "calc(13px * var(--fs, 1))", minHeight: 32, borderTop: "1px solid var(--border)" }}>
                  <span className="badge bad" style={{ height: 20 }}>{h.lapses}×</span>
                  <span className="grow1 trunc">{h.front.replace(/\{\{|\}\}/g, "")}</span>
                </div>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}
