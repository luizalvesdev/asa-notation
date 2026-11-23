import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, goalsApi } from "./api";
import { useDataVersion } from "./data-events";
import { goalCounts, goalPct, progressLabel, STATUS_BADGE, STATUS_LABEL, goalStatus } from "./goals-logic";
import type { Goal } from "./goals-types";
import { routeHash } from "./nav";
import { useDismiss } from "./use-dismiss";
import type { Toast } from "./toast";

/** Dia de hoje (AAAA-MM-DD) no fuso do aparelho, para o status da meta. */
const today = () => new Date().toLocaleDateString("sv-SE");

/** Goals ligados a páginas: o botão da barra da página diz se há meta (a tela de Metas é a dona dos detalhes). */
export function useGoalOfPage(pageId: string) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const version = useDataVersion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    goalsApi
      .list()
      .then((list) => live && setGoals(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pageId, version, tick]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { goals, goal: goals?.find((g) => g.page?.id === pageId) ?? null, refresh };
}

interface Props {
  pageId: string;
  title: string;
  goals: Goal[] | null;
  goal: Goal | null;
  onChanged: () => void;
  onClose: () => void;
  onToast: (toast: Toast) => void;
}

const parseTarget = (raw: string): number | null | "invalid" => {
  const text = raw.trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : "invalid";
};

export function GoalLink({ pageId, title, goals, goal, onChanged, onClose, onToast }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, true, onClose);
  const [name, setName] = useState(title.trim() === "" ? "" : title);
  const [newTarget, setNewTarget] = useState("");
  const [targetText, setTargetText] = useState(goal?.target ? String(goal.target) : "");
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setTargetText(goal?.target ? String(goal.target) : ""), [goal?.id, goal?.target]);

  const run = async (action: () => Promise<unknown>, fail: string) => {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      onToast({ text: err instanceof ApiError && err.status === 409 ? "Esta página já está ligada a outra meta." : fail });
    } finally {
      setBusy(false);
    }
  };

  const free = (goals ?? []).filter((g) => !g.page && !g.done);

  return (
    <div ref={ref} className="menu on" role="dialog" aria-label="Meta desta página" style={{ position: "absolute", top: 34, right: 0, width: 340, padding: 16, display: "flex", flexDirection: "column", gap: 12, zIndex: 40 }}>
      {goal ? (
        <>
          <b style={{ fontWeight: 600 }}>{goal.title}</b>
          <div className="col" style={{ gap: 6 }}>
            <span className="bar" style={{ width: "100%" }}>
              <span style={{ width: `${goalPct(goal)}%` }} />
            </span>
            <span className="row" style={{ gap: 8, fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>
              <span>{progressLabel(goal)}</span>
              <span className={STATUS_BADGE[goalStatus(goal, today())]} style={{ marginLeft: "auto" }}>{STATUS_LABEL[goalStatus(goal, today())]}</span>
            </span>
          </div>
          <label className="col" style={{ gap: 4, fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>
            Alvo (deixe vazio para contar todas as caixinhas: {goal.checkboxes})
            <input
              className="inp"
              inputMode="numeric"
              value={targetText}
              placeholder={`Ex.: 30 (hoje: ${goalCounts(goal).total})`}
              aria-label="Alvo da meta"
              onChange={(e) => setTargetText(e.target.value)}
              onBlur={() => {
                const next = parseTarget(targetText);
                if (next === "invalid") return onToast({ text: "O alvo precisa ser um número inteiro maior que zero." });
                if (next !== goal.target) void run(() => goalsApi.update(goal.id, { target: next }), "Não foi possível salvar o alvo.");
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <a className="btn btn-sec btn-sm" href={routeHash("metas")} onClick={onClose}>Abrir Metas</a>
            <button className="btn btn-fan btn-sm" type="button" disabled={busy} onClick={() => void run(() => goalsApi.update(goal.id, { pageId: null }), "Não foi possível desligar a meta.")}>
              Desligar
            </button>
          </div>
        </>
      ) : (
        <>
          <b style={{ fontWeight: 600 }}>Transformar em meta</b>
          <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>Cada caixinha marcada nesta página conta como 1 na meta.</span>
          <label className="col" style={{ gap: 4, fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>
            Nome da meta
            <input className="inp" value={name} aria-label="Nome da meta" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="col" style={{ gap: 4, fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>
            Alvo (opcional; vazio = todas as caixinhas)
            <input className="inp" inputMode="numeric" value={newTarget} placeholder="Ex.: 30" aria-label="Alvo da meta" onChange={(e) => setNewTarget(e.target.value)} />
          </label>
          <button
            className="btn btn-sm"
            type="button"
            disabled={busy || name.trim() === ""}
            onClick={() => {
              const target = parseTarget(newTarget);
              if (target === "invalid") return onToast({ text: "O alvo precisa ser um número inteiro maior que zero." });
              void run(() => goalsApi.create({ title: name.trim(), pageId, target }), "Não foi possível criar a meta.");
            }}
          >
            Criar meta
          </button>
          {free.length > 0 && (
            <div className="col" style={{ gap: 6, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>Ou ligar a uma meta que já existe</span>
              <div className="row" style={{ gap: 6 }}>
                <select className="inp" value={pick} aria-label="Meta existente" onChange={(e) => setPick(e.target.value)}>
                  <option value="">Escolher…</option>
                  {free.map((g) => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
                <button className="btn btn-sec btn-sm" type="button" disabled={busy || pick === ""} onClick={() => void run(() => goalsApi.update(pick, { pageId }), "Não foi possível ligar a meta.")}>
                  Ligar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
