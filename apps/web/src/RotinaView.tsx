import { useCallback, useEffect, useRef, useState } from "react";
import { routineApi, settingsApi } from "./api";
import { useDataVersion } from "./data-events";
import { routeHash } from "./nav";
import { formatStudy, VERDICT_TEXT } from "./routine-logic";
import type { RoutineWeek, WeeklyReview } from "./routine-types";
import { DEFAULT_SETTINGS, type Settings } from "./settings-types";
import { addDays, formatWeekRange, localDate, localTimeZone, weekStart } from "./tasks-dates";
import type { Toast } from "./toast";

interface RotinaViewProps {
  sub?: string;
  onToast: (toast: Toast) => void;
}

const NOTES = [
  { v: 1, l: "difícil" },
  { v: 2, l: "fraca" },
  { v: 3, l: "ok" },
  { v: 4, l: "boa" },
  { v: 5, l: "ótima" },
];

const CHECKINS: { key: "plan" | "thursday" | "saturday" | "study"; title: string; when: string }[] = [
  { key: "plan", title: "Plano do dia", when: "todo dia" },
  { key: "thursday", title: "Métricas da quinta", when: "quinta" },
  { key: "saturday", title: "Revisão do sábado", when: "sábado" },
  { key: "study", title: "Lembrete de estudo", when: "todo dia" },
];

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat card rise" style={{ padding: 14 }}>
      <span className="v">{value}</span>
      <br />
      <span className="l">{label}</span>
    </div>
  );
}

function Metrics({ week }: { week: RoutineWeek }) {
  const m = week.metrics;
  const verdict = VERDICT_TEXT[week.verdict];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: 10 }}>
        <Stat value={`${m.tasksDone}/${m.tasksTotal}`} label="tarefas concluídas" />
        <Stat value={formatStudy(m.studySeconds)} label="de estudo" />
        <Stat value={String(m.cardsReviewed)} label="cards revisados" />
        <Stat value={`${m.activeDays}/${m.days}`} label="dias de constância" />
      </div>
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <span className="av h">H</span>
        <div className="col" style={{ gap: 6 }}>
          <span className="row" style={{ gap: 8 }}>
            <b style={{ fontWeight: 600, fontSize: "calc(14px * var(--fs, 1))" }}>{verdict.title}</b>
            <span className={`badge ${week.verdict === "forte" ? "ok" : week.verdict === "boa" ? "ac" : "warn"}`} style={{ height: 20 }}>{week.score} pontos</span>
          </span>
          <p style={{ fontSize: "calc(14px * var(--fs, 1))", lineHeight: "calc(21px * var(--fs, 1))" }}>{verdict.text}</p>
          <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)" }}>Avaliação por regra: 60% tarefas concluídas, 40% dias com atividade.</span>
        </div>
      </div>
    </>
  );
}

function Review({ start, review, onSaved, onToast }: { start: string; review: WeeklyReview | null; onSaved: (r: WeeklyReview) => void; onToast: (t: Toast) => void }) {
  const [rating, setRating] = useState<number | null>(review?.rating ?? null);
  const [worked, setWorked] = useState(review?.worked ?? "");
  const [blocked, setBlocked] = useState(review?.blocked ?? "");
  const [focus, setFocus] = useState<string[]>([...(review?.focus ?? []), "", "", ""].slice(0, 3));
  const [busy, setBusy] = useState(false);
  const applied = review?.applied ?? false;

  const save = async (patch: Parameters<typeof routineApi.saveReview>[1]) => {
    try {
      onSaved(await routineApi.saveReview(start, patch));
      return true;
    } catch {
      onToast({ text: "Não foi possível salvar a revisão." });
      return false;
    }
  };
  const saveFocus = (list: string[]) => void save({ focus: list.map((f) => f.trim()).filter(Boolean) });
  const filled = focus.map((f) => f.trim()).filter(Boolean);

  const apply = async () => {
    setBusy(true);
    try {
      if (!(await save({ focus: filled }))) return;
      const res = await routineApi.apply(start);
      onToast({ text: `${res.created} ${res.created === 1 ? "tarefa criada" : "tarefas criadas"} para ${res.date.split("-").reverse().slice(0, 2).join("/")}` });
      onSaved((await routineApi.week(start, localTimeZone())).review!);
    } catch {
      onToast({ text: "Não foi possível criar as tarefas." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col enter" style={{ gap: 18 }}>
      <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ fontWeight: 600, fontSize: "calc(15px * var(--fs, 1))" }}>Como você avalia a semana?</b>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }} role="radiogroup" aria-label="Avaliação de 1 a 5">
          {NOTES.map((n) => (
            <button key={n.v} className={`btn ${rating === n.v ? "btn-pri" : "btn-sec"}`} type="button" role="radio" aria-checked={rating === n.v} onClick={() => { setRating(n.v); void save({ rating: n.v }); }} style={{ width: 56, height: 56, flexDirection: "column", gap: 0, fontSize: "calc(18px * var(--fs, 1))", fontFamily: "var(--serif)" }}>
              {n.v}
              <span style={{ font: "500 calc(10px * var(--fs, 1))/calc(12px * var(--fs, 1)) var(--sans)", opacity: 0.8 }}>{n.l}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field"><label className="label" htmlFor="r1">O que funcionou?</label><textarea id="r1" className="inp" rows={2} value={worked} onChange={(e) => setWorked(e.target.value)} onBlur={() => worked !== (review?.worked ?? "") && void save({ worked })} /></div>
      <div className="field"><label className="label" htmlFor="r2">O que travou?</label><textarea id="r2" className="inp" rows={2} value={blocked} onChange={(e) => setBlocked(e.target.value)} onBlur={() => blocked !== (review?.blocked ?? "") && void save({ blocked })} /></div>
      <div className="draft">
        <span className="draft-t">Foco da próxima semana</span>
        <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>Até três prioridades. Elas viram tarefas na segunda-feira.</span>
        {focus.map((value, i) => (
          <input key={i} className="inp" aria-label={`Foco ${i + 1}`} placeholder={`Prioridade ${i + 1}`} value={value} disabled={applied} onChange={(e) => setFocus(focus.map((f, j) => (j === i ? e.target.value : f)))} onBlur={() => saveFocus(focus)} />
        ))}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-ink btn-sm" type="button" disabled={busy || applied || filled.length === 0} onClick={() => void apply()}>{applied ? "Tarefas criadas" : "Criar tarefas para a segunda"}</button>
        </div>
      </div>
    </div>
  );
}

export function RotinaView({ sub, onToast }: RotinaViewProps) {
  const today = localDate();
  const [tab, setTab] = useState<"quinta" | "sabado">(sub === "quinta" ? "quinta" : sub === "sabado" ? "sabado" : "sabado");
  const [start, setStart] = useState(() => weekStart(today));
  const [week, setWeek] = useState<RoutineWeek | null>(null);
  const [status, setStatus] = useState<"carregando" | "erro" | "pronto">("carregando");
  const [settings, setSettings] = useState<Settings | null>(null);
  const dataVersion = useDataVersion();
  const [attempt, setAttempt] = useState(0);
  const reviewKey = useRef(0);

  useEffect(() => {
    if (sub === "quinta" || sub === "sabado") setTab(sub);
  }, [sub]);

  useEffect(() => {
    let live = true;
    settingsApi.get().then((s) => live && setSettings(s)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [dataVersion]);

  useEffect(() => {
    let live = true;
    setStatus("carregando");
    routineApi
      .week(start, localTimeZone())
      .then((w) => {
        if (!live) return;
        reviewKey.current += 1;
        setWeek(w);
        setStatus("pronto");
      })
      .catch(() => live && setStatus("erro"));
    return () => {
      live = false;
    };
  }, [start, attempt]);

  const saved = useCallback((review: WeeklyReview) => setWeek((w) => (w ? { ...w, review } : w)), []);
  const toggleCheckin = async (key: "plan" | "thursday" | "saturday" | "study") => {
    if (!settings) return;
    const next = !settings.checkinsEnabled[key];
    setSettings({ ...settings, checkinsEnabled: { ...settings.checkinsEnabled, [key]: next } });
    try {
      setSettings(await settingsApi.patch({ checkinsEnabled: { [key]: next } }));
    } catch {
      setSettings(settings);
      onToast({ text: "Não foi possível salvar o check-in." });
    }
  };
  const s = settings ?? DEFAULT_SETTINGS;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, padding: "36px 40px 120px" }}>
      <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="screen-head">
          <h1 className="screen-title">Rotina</h1>
          <span className="muted screen-sub">{formatWeekRange(start)}</span>
          <span className="row" style={{ marginLeft: "auto", gap: 2 }}>
            <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Semana anterior" onClick={() => setStart(addDays(start, -7))}><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
            <button className="btn btn-sec btn-sm" type="button" disabled={start === weekStart(today)} onClick={() => setStart(weekStart(today))}>Esta semana</button>
            <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Próxima semana" onClick={() => setStart(addDays(start, 7))}><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
          </span>
        </div>
        <div className="tabs" role="tablist" aria-label="Check-ins">
          {([["sabado", "Revisão do sábado"], ["quinta", "Métricas da quinta"]] as const).map(([id, label]) => (
            <button key={id} className={`plain tab${tab === id ? " on" : ""}`} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={{ position: "relative", padding: "8px 12px", height: 36 }}>{label}</button>
          ))}
        </div>

        {status === "carregando" && <span className="sk" style={{ height: 160, borderRadius: 12 }} aria-busy="true" aria-label="Carregando a semana" />}
        {status === "erro" && (
          <div className="card" role="alert" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Não foi possível carregar a semana.</span>
            <button className="btn btn-sec btn-sm" type="button" onClick={() => setAttempt((a) => a + 1)} style={{ marginLeft: "auto" }}>Tentar de novo</button>
          </div>
        )}
        {status === "pronto" && week && (
          <div className="col enter" style={{ gap: 18 }} key={`${tab}-${start}`}>
            <Metrics week={week} />
            {tab === "sabado" && <Review key={`${start}-${reviewKey.current}`} start={start} review={week.review} onSaved={saved} onToast={onToast} />}
            {tab === "quinta" && (
              <div className="row" style={{ gap: 8 }}>
                <a className="btn btn-sec btn-sm" href={routeHash("metas")}>Ver metas</a>
                <a className="btn btn-fan btn-sm" href={routeHash("progresso")}>Ver progresso</a>
              </div>
            )}
          </div>
        )}
      </div>

      <aside style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="row" style={{ paddingBottom: 8 }}>
            <b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Check-ins agendados</b>
            <a href={routeHash("configuracoes")} style={{ marginLeft: "auto", fontSize: "calc(12px * var(--fs, 1))" }}>Horários</a>
          </div>
          {CHECKINS.map((c) => (
            <div key={c.key} className="row" style={{ gap: 10, minHeight: 44, borderTop: "1px solid var(--border)" }}>
              <span className="col grow1">
                <span style={{ fontSize: "calc(13px * var(--fs, 1))", fontWeight: 500 }}>{c.title}</span>
                <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)" }}>{c.when}, {s.checkins[c.key]}</span>
              </span>
              <button className="tog" type="button" role="switch" aria-checked={s.checkinsEnabled[c.key]} aria-label={`Ligar ${c.title}`} disabled={!settings} onClick={() => void toggleCheckin(c.key)} style={{ padding: "0 4px" }}>
                <span className={`sw${s.checkinsEnabled[c.key] ? " on" : ""}`}><span className="knob" /></span>
              </button>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          <b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Lembretes semanais</b>
          <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)", lineHeight: "calc(19px * var(--fs, 1))" }}>Para um lembrete que se repete, crie uma tarefa com <code>/semanal</code> no fim (ex.: “17:00 Backup /semanal”).</span>
        </div>
      </aside>
    </div>
  );
}
