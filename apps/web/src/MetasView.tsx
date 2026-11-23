import { useEffect, useMemo, useState } from "react";
import { AddTask } from "./AddTask";
import { pageHash } from "./nav";
import { goalPct, goalStatus, STATUS_BADGE, STATUS_LABEL, progressLabel } from "./goals-logic";
import type { Goal } from "./goals-types";
import { Icon } from "./icons";
import { formatDate, formatWhen, localDate } from "./tasks-dates";
import { TaskRow } from "./TaskRow";
import type { TaskItem } from "./tasks-types";
import type { Toast } from "./toast";
import { useGoalDetail, useGoals } from "./use-goals";
import { useContextItems } from "./use-context-items";
import { Reveal } from "./Reveal";
import { askConfirm } from "./confirm";

interface MetasViewProps {
  onToast: (toast: Toast) => void;
}

type Tab = "ativas" | "concluidas";

function Title({ children }: { children: string }) {
  return <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(36px * var(--fs, 1))", lineHeight: "calc(42px * var(--fs, 1))", letterSpacing: "-.02em" }}>{children}</h1>;
}

interface GoalCardProps {
  goal: Goal;
  today: string;
  selected: boolean;
  onPick: () => void;
  onToggleDone: () => void;
  onDelete: () => void;
}

function GoalCard({ goal, today, selected, onPick, onToggleDone, onDelete }: GoalCardProps) {
  const status = goalStatus(goal, today);
  const pct = goalPct(goal);
  const menuRef = useContextItems<HTMLButtonElement>(() => [
    { label: "Abrir", run: onPick },
    { label: goal.done ? "Reabrir meta" : "Concluir meta", run: onToggleDone },
    { label: "Apagar meta", danger: true, run: onDelete },
  ]);
  return (
    <button
      ref={menuRef}
      className="plain card goal-card"
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", textAlign: "left", borderRadius: 10, cursor: "pointer", boxShadow: selected ? "inset 0 0 0 2px var(--accent)" : "none" }}
    >
      <span className="row" style={{ gap: 8 }}>
        <span className="grow1" style={{ fontWeight: 600, fontSize: "calc(14px * var(--fs, 1))" }}>
          {goal.title}
        </span>
        <span className={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</span>
      </span>
      <span className="bar" style={{ width: "100%" }}>
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="row" style={{ gap: 12, fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-2)" }}>
        <span>{pct}%</span>
        <span>{progressLabel(goal)}</span>
        <span style={{ marginLeft: "auto" }}>{goal.dueDate ? formatDate(goal.dueDate) : "sem prazo"}</span>
      </span>
    </button>
  );
}

function NewGoalForm({ onCreate, onCancel }: { onCreate: (title: string, dueDate: string | null) => Promise<boolean>; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    if (title.trim() === "") return;
    setFailed(false);
    if (!(await onCreate(title.trim(), due || null))) setFailed(true);
  };

  return (
    <form
      className="card"
      style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <input className="add-task-input" autoFocus value={title} placeholder="Nome da meta" aria-label="Nome da meta" onChange={(e) => setTitle(e.target.value)} />
      <label className="row" style={{ gap: 8, fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>
        Prazo
        <input className="add-task-input" type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: "auto", height: 30 }} />
      </label>
      {failed && (
        <span role="alert" style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--danger)" }}>
          Não foi possível criar a meta.
        </span>
      )}
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-pri btn-sm" type="submit" disabled={title.trim() === ""}>
          Criar meta
        </button>
        <button className="btn btn-fan btn-sm" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

interface DetailProps {
  goal: Goal;
  today: string;
  onBack: () => void;
  onChanged: () => void;
  onUpdate: (patch: { title?: string; description?: string; dueDate?: string | null; done?: boolean }) => Promise<boolean>;
  onDelete: () => void;
  onToast: (toast: Toast) => void;
}

function GoalDetail({ goal, today, onBack, onChanged, onUpdate, onDelete, onToast }: DetailProps) {
  const detail = useGoalDetail(goal.id, onChanged);
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description);
  const status = goalStatus(goal, today);
  const pct = goalPct(goal);
  const fail = (text: string) => onToast({ text });

  const saveTitle = () => {
    const next = title.trim();
    if (next === "") return setTitle(goal.title);
    if (next !== goal.title) void onUpdate({ title: next }).then((ok) => !ok && fail("Não foi possível salvar o nome."));
  };
  const saveDescription = () => {
    if (description !== goal.description) void onUpdate({ description }).then((ok) => !ok && fail("Não foi possível salvar a descrição."));
  };

  const toggle = (item: TaskItem) => void detail.toggle(item).then((ok) => !ok && fail("Não foi possível atualizar a tarefa."));
  const toggleSub = (id: string, done: boolean) => void detail.toggleSubtask(id, done).then((ok) => !ok && fail("Não foi possível atualizar a subtarefa."));
  const remove = (item: TaskItem) =>
    void detail.removeTask(item).then((ok) => {
      if (!ok) return fail("Não foi possível apagar a tarefa.");
      onToast({ text: "Tarefa apagada", action: { label: "Desfazer", run: () => void detail.restoreTask(item.id) } });
    });

  return (
    <div className="enter rel metas-detail-in" style={{ padding: "32px 36px 120px", display: "flex", flexDirection: "column", gap: 18 }}>
      <button className="btn btn-fan btn-sm metas-back" type="button" onClick={onBack} style={{ alignSelf: "flex-start" }}>
        <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Metas
      </button>
      <span className="eyebrow">Meta</span>
      <input
        className="goal-title"
        value={title}
        aria-label="Nome da meta"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <div className="props">
        <span className="pk">Prazo</span>
        <span className="pv">
          <input
            className="goal-date"
            type="date"
            value={goal.dueDate ?? ""}
            aria-label="Prazo da meta"
            onChange={(e) => void onUpdate({ dueDate: e.target.value || null }).then((ok) => !ok && fail("Não foi possível salvar o prazo."))}
          />
        </span>
        <span className="pk">Status</span>
        <span className="pv">
          <span className={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</span>
        </span>
        <span className="pk">Progresso</span>
        <span className="pv">
          {pct}% · {progressLabel(goal)}
        </span>
        {goal.page && (
          <>
            <span className="pk">Página</span>
            <span className="pv">
              <a href={pageHash(goal.page.id)}>{goal.page.title.trim() === "" ? "Sem título" : goal.page.title}</a>
              {goal.target ? ` · alvo ${goal.target}` : ""}
            </span>
          </>
        )}
      </div>
      <textarea
        className="goal-desc"
        value={description}
        placeholder="Descreva o que significa concluir esta meta."
        aria-label="Descrição da meta"
        rows={3}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={saveDescription}
      />

      <div className="col" style={{ gap: 2 }}>
        <div className="row" style={{ paddingBottom: 6 }}>
          <b style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))" }}>Tarefas ligadas</b>
        </div>
        {detail.status === "carregando" && (
          <div className="col" style={{ gap: 12 }} aria-busy="true" aria-label="Carregando as tarefas">
            <span className="sk" style={{ height: 16, width: "70%" }} />
            <span className="sk" style={{ height: 16, width: "50%" }} />
          </div>
        )}
        {detail.status === "erro" && (
          <div role="alert" className="row" style={{ gap: 12, fontSize: "calc(14px * var(--fs, 1))" }}>
            Não foi possível carregar as tarefas.
            <button className="btn btn-sec btn-sm" type="button" onClick={detail.reload}>
              Tentar de novo
            </button>
          </div>
        )}
        {detail.status === "pronto" && (
          <>
            {detail.tasks.length === 0 && (
              <p className="muted" style={{ fontSize: "calc(14px * var(--fs, 1))", padding: "4px 10px 8px" }}>
                Nenhuma tarefa ligada ainda. O progresso da meta vem delas.
              </p>
            )}
            {detail.tasks.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                hideGoal
                when={item.date ? formatWhen(item.date, today) : "sem prazo"}
                onToggle={toggle}
                onToggleSubtask={toggleSub}
                onRemove={remove}
                onAddSubtask={(parentId, title) => detail.addSubtask(parentId, title)}
                extra={{ label: "Desligar", run: (t) => void detail.unlinkTask(t).then((ok) => !ok && fail("Não foi possível desligar a tarefa.")) }}
              />
            ))}
            <AddTask label="Adicionar tarefa" onAdd={(q) => detail.addTask(q.title)} />
          </>
        )}
      </div>

      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button
          className="btn btn-sec btn-sm"
          type="button"
          onClick={() => void onUpdate({ done: !goal.done }).then((ok) => !ok && fail("Não foi possível atualizar a meta."))}
        >
          <Icon name="check" />
          {goal.done ? "Reabrir meta" : "Concluir meta"}
        </button>
        <button className="btn btn-fan btn-sm" type="button" style={{ color: "var(--danger)" }} onClick={onDelete}>
          Apagar meta
        </button>
      </div>
    </div>
  );
}

export function MetasView({ onToast }: MetasViewProps) {
  const today = localDate();
  const goals = useGoals();
  const [tab, setTab] = useState<Tab>("ativas");
  const [picked, setPicked] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const shown = useMemo(() => goals.goals.filter((g) => g.done === (tab === "concluidas")), [goals.goals, tab]);
  // No computador a primeira meta já vem aberta; no celular só abre o que foi tocado.
  const effective = shown.find((g) => g.id === picked) ?? shown[0] ?? null;
  const explicit = shown.some((g) => g.id === picked);

  useEffect(() => {
    if (picked && goals.status === "pronto" && !goals.goals.some((g) => g.id === picked)) setPicked(null);
  }, [picked, goals.goals, goals.status]);

  const ready = goals.status === "pronto";

  const deleteGoal = async (goal: Goal) => {
    if (!(await askConfirm({ title: `Apagar a meta “${goal.title}”?`, body: "As tarefas ligadas a ela continuam, só deixam de estar na meta." }))) return;
    void goals.remove(goal.id).then((ok) => {
      if (!ok) return onToast({ text: "Não foi possível apagar a meta." });
      setPicked(null);
      onToast({ text: "Meta apagada", action: { label: "Desfazer", run: () => void goals.restore(goal.id) } });
    });
  };

  return (
    <div className={`metas${explicit ? " has-sel" : ""}`} style={{ display: "flex", minHeight: "100%" }}>
      {/* Sem meta para mostrar, a lista ocupa a tela toda (nada de painel vazio ao lado). */}
      <div className="metas-list" style={{ flex: "1 1 420px", ...(ready && effective ? { borderRight: "1px solid var(--border)" } : {}) }}>
        <div style={{ padding: "32px 28px 120px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <Title>Metas</Title>
            <div className="seg" role="tablist" aria-label="Filtro" style={{ marginLeft: "auto" }}>
              <span className="seg-ind" style={{ width: "calc((100% - 4px) / 2)", transform: `translateX(${tab === "ativas" ? 0 : 100}%)` }} />
              <button className={`seg-b${tab === "ativas" ? " on" : ""}`} type="button" role="tab" aria-selected={tab === "ativas"} onClick={() => setTab("ativas")}>
                Ativas
              </button>
              <button className={`seg-b${tab === "concluidas" ? " on" : ""}`} type="button" role="tab" aria-selected={tab === "concluidas"} onClick={() => setTab("concluidas")}>
                Concluídas
              </button>
            </div>
            <button className="btn btn-pri btn-sm" type="button" onClick={() => setCreating(true)}>
              <Icon name="plus" />
              Nova meta
            </button>
          </div>

          <Reveal show={creating}><NewGoalForm
              onCancel={() => setCreating(false)}
              onCreate={async (title, dueDate) => {
                const goal = await goals.create({ title, dueDate });
                if (!goal) return false;
                setCreating(false);
                setTab("ativas");
                setPicked(goal.id);
                return true;
              }}
            /></Reveal>

          {goals.status === "carregando" && (
            <div className="col" style={{ gap: 8 }} aria-busy="true" aria-label="Carregando as metas">
              {[0, 1, 2].map((i) => (
                <span key={i} className="sk" style={{ height: 88, borderRadius: 10 }} />
              ))}
            </div>
          )}
          {goals.status === "erro" && (
            <div className="card" role="alert" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Não foi possível carregar as metas.</span>
              <button className="btn btn-sec btn-sm" type="button" onClick={goals.reload} style={{ marginLeft: "auto" }}>
                Tentar de novo
              </button>
            </div>
          )}
          {ready && shown.length === 0 && !creating && (
            <p className="muted" style={{ fontSize: "calc(14px * var(--fs, 1))" }}>
              {tab === "ativas" ? "Nenhuma meta ativa. Crie uma para acompanhar tarefas e prazo no mesmo lugar." : "Nenhuma meta concluída ainda."}
            </p>
          )}
          {ready && (
            <div className="col" style={{ gap: 8 }}>
              {shown.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  today={today}
                  selected={effective?.id === goal.id}
                  onPick={() => setPicked(goal.id)}
                  onToggleDone={() => void goals.update(goal.id, { done: !goal.done }).then((ok) => !ok && onToast({ text: "Não foi possível atualizar a meta." }))}
                  onDelete={() => deleteGoal(goal)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {ready && effective && (
      <div className="metas-detail" style={{ flex: "1 1 520px" }}>
        {(
          <GoalDetail
            key={effective.id}
            goal={effective}
            today={today}
            onBack={() => setPicked(null)}
            onChanged={goals.reload}
            onUpdate={(patch) => goals.update(effective.id, patch)}
            onDelete={() => deleteGoal(effective)}
            onToast={onToast}
          />
        )}
      </div>
      )}
    </div>
  );
}
