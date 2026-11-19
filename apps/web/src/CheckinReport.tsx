import type { Stats } from "./study-types";
import { addDays, localDate } from "./tasks-dates";

/** O que o check-in mostra quando já não há card para hoje: o resumo do dia e o que vem depois. */
export function todaySummary(stats: Pick<Stats, "days" | "upcoming">, today: string) {
  const day = stats.days.find((d) => d.day === today);
  const reviews = day?.reviews ?? 0;
  const tomorrow = addDays(today, 1);
  return {
    reviews,
    remembered: reviews > 0 ? Math.round(((day?.remembered ?? 0) / reviews) * 100) : null,
    minutes: Math.round((day?.seconds ?? 0) / 60),
    tomorrow: stats.upcoming.find((u) => u.day === tomorrow)?.due ?? 0,
  };
}

export function CheckinReport({ stats, onClose }: { stats: Stats; onClose: () => void }) {
  const s = todaySummary(stats, localDate());
  return (
    <div className="col" style={{ padding: "32px 28px", gap: 18 }}>
      <span className="eyebrow">Check-in de estudo</span>
      <h2 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(30px * var(--fs, 1))", lineHeight: "calc(36px * var(--fs, 1))" }}>Tudo revisado por hoje</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(130px, 100%), 1fr))", gap: 8 }}>
        <div className="stat card" style={{ padding: 14 }}><span className="v">{s.reviews}</span><br /><span className="l">{s.reviews === 1 ? "revisão hoje" : "revisões hoje"}</span></div>
        <div className="stat card" style={{ padding: 14 }}><span className="v">{s.remembered === null ? "–" : `${s.remembered}%`}</span><br /><span className="l">lembrados</span></div>
        <div className="stat card" style={{ padding: 14 }}><span className="v">{s.minutes} min</span><br /><span className="l">estudando</span></div>
        <div className="stat card" style={{ padding: 14 }}><span className="v">{s.tomorrow}</span><br /><span className="l">{s.tomorrow === 1 ? "card amanhã" : "cards amanhã"}</span></div>
      </div>
      <button className="btn btn-pri" type="button" autoFocus onClick={onClose} style={{ alignSelf: "flex-start" }}>
        Seguir para o dia
      </button>
    </div>
  );
}
