import { useRef, useState } from "react";
import { AddTask } from "./AddTask";
import { Icon } from "./icons";
import type { Toast } from "./toast";
import { addDays, dayOfMonth, formatWeekRange, formatWhen, localDate, weekDates, weekStart, weekdayShort } from "./tasks-dates";
import { groupByDate } from "./tasks-logic";
import type { TaskItem } from "./tasks-types";
import { useTasks } from "./use-tasks";

interface SemanaViewProps {
  onToast: (toast: Toast) => void;
}

/** Só tarefas simples (sem recorrência) mudam de dia por arrastar. */
const movable = (item: TaskItem) => item.recurrence === null;

function WeekCard({ item, onToggle, onDragStart, onDragEnd }: { item: TaskItem; onToggle: (item: TaskItem) => void; onDragStart: (item: TaskItem) => void; onDragEnd: () => void }) {
  const canMove = movable(item);
  return (
    <div
      className="wcard-wrap"
      draggable={canMove}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.id);
        onDragStart(item);
      }}
      onDragEnd={onDragEnd}
    >
      <button className="plain wcard enter" type="button" role="checkbox" aria-checked={item.done} onClick={() => onToggle(item)} style={{ width: "100%", textAlign: "left", cursor: canMove ? "grab" : "pointer" }}>
        <span className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <span className={`cb${item.done ? " on" : ""}`} style={{ width: 16, height: 16, marginTop: 1 }}>
            <svg className="ico tick" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7" pathLength="1" />
            </svg>
          </span>
          <span className={item.done ? "done-txt" : undefined}>{item.title}</span>
        </span>
        {(item.time || item.recurrence || item.subtasks.length > 0) && (
          <span className="row" style={{ gap: 6, fontSize: 11, color: "var(--text-3)", paddingLeft: 24 }}>
            {item.time && <span className="mono">{item.time}</span>}
            {item.recurrence && <Icon name="repeat" className="sm" />}
            {item.subtasks.length > 0 && (
              <span>
                {item.subtasks.filter((s) => s.done).length}/{item.subtasks.length}
              </span>
            )}
          </span>
        )}
      </button>
    </div>
  );
}

export function SemanaView({ onToast }: SemanaViewProps) {
  const today = localDate();
  const [start, setStart] = useState(() => weekStart(today));
  const dates = weekDates(start);
  const tasks = useTasks(start, addDays(start, 6), today);
  const dragging = useRef<TaskItem | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const byDay = groupByDate(tasks.list.days);
  const ready = tasks.status === "pronto";
  const isThisWeek = start === weekStart(today);

  const fail = (text: string) => onToast({ text });
  const toggle = (item: TaskItem) => void tasks.toggle(item).then((ok) => !ok && fail("Não foi possível atualizar a tarefa."));
  const moveTo = (item: TaskItem, date: string) => {
    if (item.date === date) return;
    void tasks.reschedule([item.id], date).then((ok) => !ok && fail("Não foi possível mover a tarefa."));
  };

  const drop = (date: string) => {
    const item = dragging.current;
    dragging.current = null;
    setOver(null);
    if (item) moveTo(item, date);
  };
  const dropZone = (date: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (over !== date) setOver(date);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((current) => (current === date ? null : current));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      drop(date);
    },
  });
  const cardProps = {
    onToggle: toggle,
    onDragStart: (item: TaskItem) => {
      dragging.current = item;
    },
    onDragEnd: () => {
      dragging.current = null;
      setOver(null);
    },
  };

  return (
    <div style={{ padding: "36px 32px 120px" }}>
      <div className="row" style={{ flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 18 }}>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 40, lineHeight: "44px", letterSpacing: "-.02em" }}>Semana</h1>
        <span className="muted" style={{ fontSize: 15, paddingBottom: 4 }}>
          {formatWeekRange(start)}
        </span>
        <span className="row" style={{ marginLeft: "auto", gap: 2 }}>
          <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Semana anterior" onClick={() => setStart(addDays(start, -7))}>
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button className="btn btn-sec btn-sm" type="button" disabled={isThisWeek} onClick={() => setStart(weekStart(today))}>
            Esta semana
          </button>
          <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Próxima semana" onClick={() => setStart(addDays(start, 7))}>
            <Icon name="chevron" />
          </button>
        </span>
      </div>

      {tasks.status === "erro" && (
        <div className="card" role="alert" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14 }}>Não foi possível carregar a semana.</span>
          <button className="btn btn-sec btn-sm" type="button" onClick={tasks.reload} style={{ marginLeft: "auto" }}>
            Tentar de novo
          </button>
        </div>
      )}

      {ready && tasks.list.late.length > 0 && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap", padding: "10px 12px", borderRadius: 10, background: "var(--danger-soft)", marginBottom: 14 }}>
          <b style={{ fontWeight: 600, fontSize: 13, color: "var(--danger)" }}>Atrasadas · {tasks.list.late.length}</b>
          {tasks.list.late.map((t) => (
            <span key={t.id} className="badge" style={{ background: "var(--surface)" }}>
              {t.title} · {t.date ? formatWhen(t.date, today) : ""}
            </span>
          ))}
          <button className="btn btn-fan btn-sm" type="button" style={{ marginLeft: "auto" }} onClick={() => void tasks.reschedule(tasks.list.late.map((t) => t.id), today).then((ok) => !ok && fail("Não foi possível mover as tarefas."))}>
            Mover para hoje
          </button>
        </div>
      )}

      {tasks.status === "carregando" ? (
        <div className="wk" aria-busy="true" aria-label="Carregando a semana">
          {dates.map((d) => (
            <div key={d} className="wkd">
              <span className="sk" style={{ height: 14, width: "40%" }} />
              <span className="sk" style={{ height: 46 }} />
              <span className="sk" style={{ height: 46 }} />
            </div>
          ))}
        </div>
      ) : (
        ready && (
          <div className="wk">
            {dates.map((date) => {
              const items = byDay.get(date) ?? [];
              const done = items.filter((t) => t.done).length;
              return (
                <section key={date} className={`wkd${date === today ? " today" : ""}${over === date ? " over" : ""}`} aria-label={`${weekdayShort(date)} ${dayOfMonth(date)}`} {...dropZone(date)}>
                  <div className="row" style={{ padding: "2px 4px 6px", fontSize: 13 }}>
                    <b style={{ fontWeight: 600 }}>{weekdayShort(date)}</b>
                    <span style={{ color: "var(--text-3)" }}>{dayOfMonth(date)}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)" }}>{items.length > 0 ? `${done}/${items.length}` : ""}</span>
                  </div>
                  {items.map((item) => (
                    <WeekCard key={`${item.id}-${item.date}`} item={item} {...cardProps} />
                  ))}
                  <AddTask compact label="Adicionar" onAdd={(q) => tasks.add({ title: q.title, date, time: q.time, recurrence: q.recurrence })} />
                </section>
              );
            })}
          </div>
        )
      )}

      {ready && (
        <div style={{ marginTop: 18, padding: 12, borderRadius: 12, border: "1px dashed var(--border-2)" }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <b style={{ fontWeight: 600, fontSize: 13 }}>Sem prazo</b>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>arraste para um dia</span>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            {tasks.list.undated.map((item) => (
              <div key={item.id} style={{ width: 220 }}>
                <WeekCard item={item} {...cardProps} />
              </div>
            ))}
            <div style={{ width: 220 }}>
              <AddTask compact label="Adicionar sem prazo" onAdd={(q) => tasks.add({ title: q.title })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
