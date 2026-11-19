import { useEffect, useRef } from "react";
import { AddTask, type AddTaskHandle } from "./AddTask";
import type { Toast } from "./toast";
import { formatHeading, formatWhen, localDate } from "./tasks-dates";
import { progress } from "./tasks-logic";
import { TaskRow } from "./TaskRow";
import type { TaskItem } from "./tasks-types";
import { useTasks } from "./use-tasks";

interface HojeViewProps {
  onToast: (toast: Toast) => void;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function HojeView({ onToast }: HojeViewProps) {
  const today = localDate();
  const tasks = useTasks(today, today, today);
  const addToday = useRef<AddTaskHandle>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target)) {
        event.preventDefault();
        addToday.current?.open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { list } = tasks;
  const todayItems = list.days.filter((t) => t.date === today);
  const stats = progress([...list.late, ...todayItems]);
  const ready = tasks.status === "pronto";

  const fail = (text: string) => onToast({ text });
  const toggle = (item: TaskItem) => void tasks.toggle(item).then((ok) => !ok && fail("Não foi possível atualizar a tarefa."));
  const toggleSub = (id: string, done: boolean) => void tasks.toggleSubtask(id, done).then((ok) => !ok && fail("Não foi possível atualizar a subtarefa."));
  const remove = (item: TaskItem) =>
    void tasks.remove(item).then((ok) => {
      if (!ok) return fail("Não foi possível apagar a tarefa.");
      onToast({ text: "Tarefa apagada", action: { label: "Desfazer", run: () => void tasks.restore(item.id) } });
    });
  const moveToToday = (ids: string[]) => void tasks.reschedule(ids, today).then((ok) => !ok && fail("Não foi possível mover as tarefas."));

  const rowProps = { onToggle: toggle, onToggleSubtask: toggleSub, onRemove: remove, onAddSubtask: (parentId: string, title: string) => tasks.addSubtask(parentId, title) };

  return (
    <div style={{ padding: "40px 40px 120px", maxWidth: 780 }}>
      <div className="row" style={{ alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(40px * var(--fs, 1))", lineHeight: "calc(44px * var(--fs, 1))", letterSpacing: "-.02em" }}>Hoje</h1>
        <span className="muted" style={{ fontSize: "calc(15px * var(--fs, 1))", paddingBottom: 4 }}>
          {formatHeading(today)}
        </span>
      </div>

      {tasks.status === "carregando" && (
        <div className="col" style={{ gap: 14, marginTop: 28 }} aria-label="Carregando as tarefas" aria-busy="true">
          <span className="sk" style={{ height: 6 }} />
          {[70, 55, 62].map((w) => (
            <span key={w} className="sk" style={{ height: 18, width: `${w}%` }} />
          ))}
        </div>
      )}

      {tasks.status === "erro" && (
        <div className="card" role="alert" style={{ marginTop: 28, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Não foi possível carregar as tarefas.</span>
          <button className="btn btn-sec btn-sm" type="button" onClick={tasks.reload} style={{ marginLeft: "auto" }}>
            Tentar de novo
          </button>
        </div>
      )}

      {ready && (
        <>
          <div className="row" style={{ marginTop: 20, gap: 12 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.pct} aria-label="Progresso do dia">
            <div className="bar grow1">
              <span style={{ width: `${stats.pct}%`, transition: "width var(--medio) var(--padrao)", animation: "none", background: stats.total > 0 && stats.pct === 100 ? "var(--success)" : undefined }} />
            </div>
            <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)", whiteSpace: "nowrap" }}>
              {stats.done} de {stats.total} concluídas
            </span>
          </div>

          {list.late.length > 0 && (
            <>
              <div className="sec-h" style={{ color: "var(--danger)" }}>
                Atrasadas <span className="n">{list.late.length}</span>
                <button className="btn btn-fan btn-sm" type="button" style={{ marginLeft: "auto" }} onClick={() => moveToToday(list.late.map((t) => t.id))}>
                  Mover para hoje
                </button>
              </div>
              {list.late.map((item) => (
                <TaskRow key={item.id} item={item} when={item.date ? formatWhen(item.date, today) : undefined} whenLate {...rowProps} />
              ))}
            </>
          )}

          <div className="sec-h">
            Hoje <span className="n">{todayItems.length}</span>
          </div>
          {todayItems.length === 0 && list.late.length === 0 && (
            <p className="muted" style={{ fontSize: "calc(14px * var(--fs, 1))", padding: "4px 10px 8px" }}>
              Dia livre. Adicione uma tarefa ou puxe algo de Sem prazo.
            </p>
          )}
          {todayItems.map((item) => (
            <TaskRow key={`${item.id}-${item.date}`} item={item} {...rowProps} />
          ))}
          <AddTask ref={addToday} shortcut="N" onAdd={(q) => tasks.add({ title: q.title, date: today, time: q.time, recurrence: q.recurrence })} />

          <div className="sec-h">
            Sem prazo <span className="n">{list.undated.length}</span>
          </div>
          {list.undated.map((item) => (
            <TaskRow key={item.id} item={item} extra={{ label: "Fazer hoje", run: (t) => moveToToday([t.id]) }} {...rowProps} />
          ))}
          <AddTask label="Adicionar tarefa sem prazo" onAdd={(q) => tasks.add({ title: q.title })} />
        </>
      )}
    </div>
  );
}
