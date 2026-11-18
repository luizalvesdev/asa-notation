import type { DatabaseProps, DatabaseRow, KanbanView as KanbanViewDef } from "@asa/core";
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { Tag } from "./CellEditor.js";
import { groupRows, keyBetween, NO_GROUP, sortRows } from "./db-model.js";

interface Props {
  props: DatabaseProps;
  view: KanbanViewDef;
  rows: DatabaseRow[];
  onGroupChange: (key: string | null) => void;
  onMove: (row: DatabaseRow, group: string | null, sortKey: string) => void;
  onAddRow: (group: string | null) => void;
  onOpenRow: (id: string) => void;
}

const DRAG_TYPE = "application/x-asa-row";

export function KanbanView({ props, view, rows, onGroupChange, onMove, onAddRow, onOpenRow }: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const selects = props.schema.properties.filter((p) => p.type === "select");
  const property = selects.find((p) => p.key === view.groupBy) ?? null;

  const groups = useMemo(() => {
    if (!property) return null;
    const grouped = groupRows(rows, property);
    for (const [key, list] of grouped) grouped.set(key, sortRows(list, view.sort, props.schema));
    return grouped;
  }, [rows, property, view.sort, props.schema]);

  const picker = (
    <label className="group-picker">
      Agrupar por
      <select value={view.groupBy ?? ""} onChange={(e) => onGroupChange(e.target.value === "" ? null : e.target.value)}>
        <option value="">—</option>
        {selects.map((p) => (
          <option key={p.key} value={p.key}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );

  if (!property || !groups) {
    return (
      <div className="kanban-empty">
        {selects.length === 0 ? <p>Crie uma propriedade do tipo Seleção para usar o quadro.</p> : picker}
      </div>
    );
  }

  const drop = (event: DragEvent, group: string, beforeId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(null);
    const id = event.dataTransfer.getData(DRAG_TYPE);
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const list = (groups.get(group) ?? []).filter((r) => r.id !== id);
    const index = beforeId === null ? list.length : list.findIndex((r) => r.id === beforeId);
    const at = index < 0 ? list.length : index;
    const sortKey = keyBetween(list[at - 1]?.sortKey ?? null, list[at]?.sortKey ?? null);
    onMove(row, group === NO_GROUP ? null : group, sortKey);
  };

  const columns: { id: string; label: ReactNode }[] = [
    { id: NO_GROUP, label: <span className="muted">Sem {property.name.toLowerCase()}</span> },
    ...(property.options ?? []).map((o) => ({ id: o.id, label: <Tag option={o} /> })),
  ];

  return (
    <div className="kanban-wrap">
      {picker}
      <div className="kanban">
        {columns.map((column) => {
          const list = groups.get(column.id) ?? [];
          return (
            <section
              key={column.id}
              className={dragOver === column.id ? "kanban-col drag-over" : "kanban-col"}
              aria-label={typeof column.label === "string" ? column.label : undefined}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                setDragOver(column.id);
              }}
              onDragLeave={() => setDragOver((current) => (current === column.id ? null : current))}
              onDrop={(e) => drop(e, column.id, null)}
            >
              <header className="kanban-head">
                {column.label}
                <span className="count">{list.length}</span>
              </header>
              {list.map((row) => (
                <article
                  key={row.id}
                  className="card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, row.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => drop(e, column.id, row.id)}
                >
                  <button type="button" className="card-title" onClick={() => onOpenRow(row.id)}>
                    {row.title || "Sem título"}
                  </button>
                </article>
              ))}
              <button type="button" className="ghost add-card" onClick={() => onAddRow(column.id === NO_GROUP ? null : column.id)}>
                + Nova
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}
