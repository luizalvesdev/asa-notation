import { useMemo, useRef, useState } from "react";
import { PropEditor, ValueView } from "./db-cells";
import { calendarWeeks, groupRows, isoDate, rowsByDate } from "./db-logic";
import type { Property, PropValue, Row, Schema, View } from "./db-types";
import { Icon } from "./icons";
import { displayTitle } from "./pages-tree";
import { localDate } from "./tasks-dates";

export interface ViewProps {
  rows: Row[];
  schema: Schema;
  view: View;
  onOpen: (rowId: string) => void;
  onProps: (rowId: string, patch: Record<string, PropValue>) => void;
  onRename: (rowId: string, title: string) => void;
  onRemove: (rowId: string) => void;
  onAdd: (props?: Record<string, PropValue>) => void;
}

const visibleProps = (schema: Schema, view: View, exclude: string[] = []) => schema.properties.filter((p) => !view.hidden.includes(p.id) && !exclude.includes(p.id));

function RowTitle({ row, onRename, onOpen }: { row: Row; onRename: ViewProps["onRename"]; onOpen: ViewProps["onOpen"] }) {
  const [draft, setDraft] = useState(row.title);
  const [prev, setPrev] = useState(row.title);
  if (prev !== row.title) {
    setPrev(row.title);
    setDraft(row.title);
  }
  return (
    <div className="row" style={{ gap: 4, minHeight: 34, padding: "0 6px 0 10px" }}>
      <input
        value={draft}
        placeholder="Sem título"
        aria-label="Título da linha"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== row.title && onRename(row.id, draft)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        style={{ border: 0, background: "transparent", color: "inherit", font: "inherit", fontWeight: 500, outline: "none", flex: 1, minWidth: 0, height: 32 }}
      />
      <button className="btn btn-fan btn-sm row-open" type="button" onClick={() => onOpen(row.id)} aria-label={`Abrir ${displayTitle(row.title)}`}>Abrir</button>
    </div>
  );
}

export function TableView({ rows, schema, view, onOpen, onProps, onRename, onRemove, onAdd }: ViewProps) {
  const props = visibleProps(schema, view);
  const cols = `minmax(220px, 1.5fr) ${props.map(() => "minmax(150px, 1fr)").join(" ")} 40px`;
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
      <div className="dgrid" role="table" aria-label="Linhas" style={{ ["--cols" as string]: cols, minWidth: "max-content", width: "100%" }}>
        <div className="drow hd" role="row" style={{ overflow: "visible" }}>
          <span role="columnheader">Nome</span>
          {props.map((p) => <span key={p.id} role="columnheader" title={p.name}>{p.name}</span>)}
          <span role="columnheader" />
        </div>
        {rows.map((row) => (
          <div key={row.id} className="drow db-row" role="row" style={{ overflow: "visible" }}>
            <div role="cell" style={{ overflow: "visible", padding: 0 }}><RowTitle row={row} onRename={onRename} onOpen={onOpen} /></div>
            {props.map((p) => (
              <div key={p.id} role="cell" style={{ overflow: "visible", padding: 0 }}>
                <PropEditor cell prop={p} value={row.props[p.id]} onChange={(v) => onProps(row.id, { [p.id]: v })} />
              </div>
            ))}
            <div role="cell" style={{ padding: 0, overflow: "visible" }}>
              <button className="btn btn-fan btn-ico btn-sm row-open" type="button" aria-label={`Apagar ${displayTitle(row.title)}`} onClick={() => onRemove(row.id)}><Icon name="close" /></button>
            </div>
          </div>
        ))}
        <button className="plain drow add" type="button" onClick={() => onAdd()} style={{ cursor: "pointer", gridTemplateColumns: "1fr", textAlign: "left" }}>
          <span className="row" style={{ gap: 8, padding: "0 10px" }}><Icon name="plus" />Nova linha</span>
        </button>
      </div>
    </div>
  );
}

function cardProps(schema: Schema, view: View, exclude: string[]): Property[] {
  return visibleProps(schema, view, exclude).filter((p) => p.type !== "checkbox" || true);
}

export function KanbanView({ rows, schema, view, onOpen, onProps, onAdd }: ViewProps) {
  const prop = schema.properties.find((p) => p.id === view.groupBy);
  const dragging = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (!prop) return <p className="muted" style={{ fontSize: 14 }}>Escolha por qual propriedade agrupar (Seleção ou Status) para ver o Kanban.</p>;

  const groups = groupRows(rows, prop);
  const shown = cardProps(schema, view, [prop.id]);
  const move = (key: string) => {
    const id = dragging.current;
    dragging.current = null;
    setOver(null);
    if (id) onProps(id, { [prop.id]: key === "" ? null : key });
  };

  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", alignItems: "flex-start", paddingBottom: 8 }}>
      {groups.map((g) => (
        <section
          key={g.key || "none"}
          aria-label={g.label}
          onDragOver={(e) => { if (dragging.current) { e.preventDefault(); setOver(g.key); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((c) => (c === g.key ? null : c)); }}
          onDrop={(e) => { e.preventDefault(); move(g.key); }}
          style={{ flex: "0 0 270px", background: "var(--bg-2)", borderRadius: 12, padding: 8, display: "flex", flexDirection: "column", gap: 6, boxShadow: over === g.key ? "inset 0 0 0 2px var(--accent)" : "none", transition: "box-shadow var(--rapido) var(--padrao)" }}
        >
          <div className="row" style={{ padding: "2px 4px 6px", fontSize: 13, gap: 6 }}>
            <b style={{ fontWeight: 600 }}>{g.label}</b>
            <span style={{ color: "var(--text-3)" }}>{g.rows.length}</span>
          </div>
          {g.rows.map((row) => (
            <div key={row.id} draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", row.id); dragging.current = row.id; }} onDragEnd={() => { dragging.current = null; setOver(null); }}>
              <button className="plain wcard" type="button" onClick={() => onOpen(row.id)} style={{ width: "100%", textAlign: "left", cursor: "grab" }}>
                <span style={{ fontWeight: 500 }}>{displayTitle(row.title)}</span>
                <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                  {shown.map((p) => <ValueView key={p.id} prop={p} value={row.props[p.id]} />)}
                </span>
              </button>
            </div>
          ))}
          <button className="plain task add-task compact" type="button" onClick={() => onAdd({ [prop.id]: g.key === "" ? null : g.key })}><Icon name="plus" />Nova</button>
        </section>
      ))}
    </div>
  );
}

export function ListView({ rows, schema, view, onOpen, onAdd }: ViewProps) {
  const group = schema.properties.find((p) => p.id === view.groupBy);
  const shown = visibleProps(schema, view, group ? [group.id] : []);
  const groups = useMemo(() => (group ? groupRows(rows, group) : [{ key: "all", label: "", color: null, rows: [...rows] }]), [rows, group]);
  return (
    <div className="col" style={{ gap: 4 }}>
      {groups.map((g) => (
        <div key={g.key || "none"} className="col">
          {group && <div className="sec-h">{g.label}<span className="n">{g.rows.length}</span></div>}
          {g.rows.map((row) => (
            <button key={row.id} className="plain task" type="button" onClick={() => onOpen(row.id)} style={{ cursor: "pointer", textAlign: "left" }}>
              <span className="grow1 trunc" style={{ fontWeight: 500 }}>{displayTitle(row.title)}</span>
              <span className="meta" style={{ gap: 6 }}>{shown.map((p) => <ValueView key={p.id} prop={p} value={row.props[p.id]} />)}</span>
            </button>
          ))}
        </div>
      ))}
      {rows.length === 0 && <p className="muted" style={{ fontSize: 14, padding: "4px 10px" }}>Nenhuma linha.</p>}
      <button className="plain task add-task" type="button" onClick={() => onAdd(group ? { [group.id]: null } : undefined)}><Icon name="plus" />Nova linha</button>
    </div>
  );
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export function CalendarView({ rows, schema, view, onOpen, onAdd, weekStart = 1 }: ViewProps & { weekStart?: 0 | 1 }) {
  const prop = schema.properties.find((p) => p.id === view.dateProp);
  const today = localDate();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split("-").map(Number) as [number, number];
    return { year: y, month: m - 1 };
  });
  if (!prop) return <p className="muted" style={{ fontSize: 14 }}>Escolha qual propriedade de data posiciona as linhas para ver o calendário.</p>;

  const byDate = rowsByDate(rows, prop.id);
  const weeks = calendarWeeks(cursor.year, cursor.month, weekStart);
  const step = (delta: number) => setCursor(({ year, month }) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });
  const names = weekStart === 1 ? WEEKDAYS : [WEEKDAYS[6]!, ...WEEKDAYS.slice(0, 6)];
  const undated = rows.filter((r) => typeof r.props[prop.id] !== "string").length;

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 6 }}>
        <b style={{ fontWeight: 600, fontSize: 15, textTransform: "capitalize" }}>{MONTHS[cursor.month]} de {cursor.year}</b>
        <span className="row" style={{ marginLeft: "auto", gap: 2 }}>
          <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Mês anterior" onClick={() => step(-1)}><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
          <button className="btn btn-sec btn-sm" type="button" onClick={() => { const [y, m] = today.split("-").map(Number) as [number, number]; setCursor({ year: y, month: m - 1 }); }}>Hoje</button>
          <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Próximo mês" onClick={() => step(1)}><Icon name="chevron" /></button>
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div role="grid" aria-label="Calendário" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(110px, 1fr))", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", minWidth: 770 }}>
          {names.map((n) => <div key={n} role="columnheader" style={{ background: "var(--bg-2)", padding: "6px 8px", fontSize: 12, color: "var(--text-2)" }}>{n}</div>)}
          {weeks.flat().map((date) => {
            const inMonth = date.startsWith(isoDate(cursor.year, cursor.month, 1).slice(0, 7));
            const items = byDate.get(date) ?? [];
            return (
              <div key={date} role="gridcell" className="cal-day" style={{ background: date === today ? "var(--accent-soft)" : "var(--surface)", minHeight: 96, padding: 6, display: "flex", flexDirection: "column", gap: 3, opacity: inMonth ? 1 : 0.5 }}>
                <span className="row" style={{ fontSize: 12, color: "var(--text-2)" }}>
                  {Number(date.slice(8))}
                  <button className="btn btn-fan btn-ico btn-sm row-open" type="button" aria-label={`Nova linha em ${date.split("-").reverse().join("/")}`} onClick={() => onAdd({ [prop.id]: date })} style={{ marginLeft: "auto", width: 20, height: 20 }}><Icon name="plus" /></button>
                </span>
                {items.slice(0, 3).map((r) => <button key={r.id} className="plain badge ac trunc" type="button" onClick={() => onOpen(r.id)} style={{ cursor: "pointer", justifyContent: "flex-start", maxWidth: "100%" }}>{displayTitle(r.title)}</button>)}
                {items.length > 3 && <span style={{ fontSize: 11, color: "var(--text-3)" }}>+{items.length - 3}</span>}
              </div>
            );
          })}
        </div>
      </div>
      {undated > 0 && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{undated} {undated === 1 ? "linha sem data não aparece" : "linhas sem data não aparecem"} no calendário.</span>}
    </div>
  );
}
