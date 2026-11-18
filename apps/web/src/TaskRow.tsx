import { useState } from "react";
import { Icon } from "./icons";
import type { TaskItem } from "./tasks-types";

interface TaskRowProps {
  item: TaskItem;
  /** Texto à direita quando não há hora (ex.: "ontem"). */
  when?: string;
  whenLate?: boolean;
  onToggle: (item: TaskItem) => void;
  onToggleSubtask: (subId: string, done: boolean) => void;
  onRemove: (item: TaskItem) => void;
  /** Ação extra (ex.: "Fazer hoje") mostrada ao passar o mouse. */
  extra?: { label: string; run: (item: TaskItem) => void };
}

function Check({ on, small }: { on: boolean; small?: boolean }) {
  return (
    <span className={`cb${on ? " on" : ""}`} style={small ? { width: 16, height: 16 } : undefined}>
      <svg className="ico tick" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7" pathLength="1" />
      </svg>
    </span>
  );
}

export function TaskRow({ item, when, whenLate, onToggle, onToggleSubtask, onRemove, extra }: TaskRowProps) {
  const [open, setOpen] = useState(false);
  const subDone = item.subtasks.filter((s) => s.done).length;
  const hasSubs = item.subtasks.length > 0;

  return (
    <div className="col">
      <div className="task">
        <button className="plain row" type="button" role="checkbox" aria-checked={item.done} onClick={() => onToggle(item)} style={{ gap: 12, flex: 1, minWidth: 0 }}>
          <Check on={item.done} />
          <span className={item.done ? "done-txt" : undefined} style={{ textAlign: "left" }}>
            {item.title}
          </span>
        </button>
        {hasSubs && (
          <button className="btn btn-fan btn-sm" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ color: "var(--text-2)" }}>
            <svg className={`chev${open ? " on" : ""}`} viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}>
              <path d="M9 6l6 6-6 6" />
            </svg>
            {subDone}/{item.subtasks.length}
          </button>
        )}
        <span className="meta">
          {extra && (
            <button className="btn btn-fan btn-sm row-action" type="button" onClick={() => extra.run(item)}>
              {extra.label}
            </button>
          )}
          {item.recurrence && (
            <span title="Recorrente" aria-label="Recorrente" style={{ display: "inline-flex" }}>
              <Icon name="repeat" className="sm" />
            </span>
          )}
          {item.time ? <span className="mono">{item.time}</span> : when ? <span style={whenLate ? { color: "var(--danger)" } : undefined}>{when}</span> : null}
          <button className="btn btn-fan btn-ico btn-sm row-action" type="button" aria-label={`Apagar “${item.title}”`} onClick={() => onRemove(item)}>
            <Icon name="close" />
          </button>
        </span>
      </div>
      {hasSubs && (
        <div className={`kids${open ? " on" : ""}`}>
          <div style={{ paddingLeft: 32 }}>
            {item.subtasks.map((sub) => (
              <button key={sub.id} className="plain task kid" type="button" role="checkbox" aria-checked={sub.done} tabIndex={open ? 0 : -1} onClick={() => onToggleSubtask(sub.id, !sub.done)} style={{ minHeight: 34, fontSize: 13 }}>
                <Check on={sub.done} small />
                <span className={sub.done ? "done-txt" : undefined}>{sub.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
