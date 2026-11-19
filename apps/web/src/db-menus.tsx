import { useRef, useState } from "react";
import { Popover } from "./db-cells";
import { newId, newProperty, NO_VALUE_OPS, OPS_BY_TYPE, removeProperty } from "./db-logic";
import { COLOR_BADGE, OP_LABEL, OPTION_COLORS, TYPE_LABEL, type Filter, type FilterOp, type Option, type Property, type PropertyType, type Schema, type Sort, type View } from "./db-types";
import { Icon, type IconName } from "./icons";

interface Common {
  schema: Schema;
  view: View;
  onSchema: (next: Schema) => void;
}

const patchView = (schema: Schema, viewId: string, patch: Partial<View>): Schema => ({ ...schema, views: schema.views.map((v) => (v.id === viewId ? { ...v, ...patch } : v)) });

function MenuButton({ icon, label, count, children, width }: { icon: IconName; label: string; count?: number; width?: number; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  return (
    <span ref={anchor} style={{ display: "inline-flex" }}>
      <button className={`btn btn-fan btn-sm${open || (count ?? 0) > 0 ? " on" : ""}`} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name={icon} />
        {label}
        {(count ?? 0) > 0 && <span className="badge ac" style={{ height: 16, padding: "0 5px", fontSize: "calc(11px * var(--fs, 1))" }}>{count}</span>}
      </button>
      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} width={width ?? 340}>
          <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }} role="dialog" aria-label={label}>
            {children(() => setOpen(false))}
          </div>
        </Popover>
      )}
    </span>
  );
}

const propLabel = (schema: Schema, id: string) => (id === "title" ? "Nome" : id === "created" ? "Criação" : (schema.properties.find((p) => p.id === id)?.name ?? "?"));

export function FilterMenu({ schema, view, onSchema }: Common) {
  const set = (filters: Filter[]) => onSchema(patchView(schema, view.id, { filters }));
  const typeOf = (prop: string): PropertyType | "title" => (prop === "title" ? "title" : (schema.properties.find((p) => p.id === prop)?.type ?? "text"));
  const update = (i: number, patch: Partial<Filter>) => set(view.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <MenuButton icon="filter" label="Filtrar" count={view.filters.length} width={440}>
      {() => (
        <>
          {view.filters.length === 0 && <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>Nenhum filtro. Todas as linhas aparecem.</span>}
          {view.filters.map((f, i) => {
            const type = typeOf(f.prop);
            const prop = schema.properties.find((p) => p.id === f.prop);
            return (
              <div key={i} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <select className="inp" aria-label="Propriedade" style={{ width: 130 }} value={f.prop} onChange={(e) => { const t = typeOf(e.target.value); set(view.filters.map((x, j) => (j === i ? { prop: e.target.value, op: OPS_BY_TYPE[t][0]!, value: null } : x))); }}>
                  <option value="title">Nome</option>
                  {schema.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select className="inp" aria-label="Operação" style={{ width: 130 }} value={f.op} onChange={(e) => update(i, { op: e.target.value as FilterOp, value: NO_VALUE_OPS.includes(e.target.value as FilterOp) ? null : f.value })}>
                  {OPS_BY_TYPE[type].map((op) => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
                </select>
                {!NO_VALUE_OPS.includes(f.op) && (prop && (prop.type === "select" || prop.type === "status" || prop.type === "multiselect") ? (
                  <select className="inp" aria-label="Valor" style={{ width: 120 }} value={String(f.value ?? "")} onChange={(e) => update(i, { value: e.target.value || null })}>
                    <option value="">Escolher…</option>
                    {prop.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                ) : (
                  <input className="inp" aria-label="Valor" style={{ width: 120 }} type={prop?.type === "date" ? "date" : "text"} value={String(f.value ?? "")} onChange={(e) => update(i, { value: prop?.type === "number" && e.target.value !== "" && Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : e.target.value })} />
                ))}
                <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Remover filtro" onClick={() => set(view.filters.filter((_, j) => j !== i))}><Icon name="close" /></button>
              </div>
            );
          })}
          <button className="btn btn-fan btn-sm" type="button" style={{ alignSelf: "flex-start" }} disabled={view.filters.length >= 20} onClick={() => set([...view.filters, { prop: "title", op: "contains", value: "" }])}><Icon name="plus" />Adicionar filtro</button>
        </>
      )}
    </MenuButton>
  );
}

export function SortMenu({ schema, view, onSchema }: Common) {
  const set = (sorts: Sort[]) => onSchema(patchView(schema, view.id, { sorts }));
  return (
    <MenuButton icon="sort" label="Ordenar" count={view.sorts.length} width={360}>
      {() => (
        <>
          {view.sorts.length === 0 && <span style={{ fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>Na ordem em que as linhas foram criadas.</span>}
          {view.sorts.map((s, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <select className="inp" aria-label="Propriedade" value={s.prop} onChange={(e) => set(view.sorts.map((x, j) => (j === i ? { ...x, prop: e.target.value } : x)))}>
                <option value="title">Nome</option>
                <option value="created">Criação</option>
                {schema.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="inp" aria-label="Direção" style={{ width: 120 }} value={s.dir} onChange={(e) => set(view.sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value as "asc" | "desc" } : x)))}>
                <option value="asc">Crescente</option>
                <option value="desc">Decrescente</option>
              </select>
              <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Remover ordenação" onClick={() => set(view.sorts.filter((_, j) => j !== i))}><Icon name="close" /></button>
            </div>
          ))}
          <button className="btn btn-fan btn-sm" type="button" style={{ alignSelf: "flex-start" }} disabled={view.sorts.length >= 5} onClick={() => set([...view.sorts, { prop: "title", dir: "asc" }])}><Icon name="plus" />Adicionar ordenação</button>
        </>
      )}
    </MenuButton>
  );
}

function OptionsEditor({ prop, onChange }: { prop: Property; onChange: (options: Option[]) => void }) {
  const set = (i: number, patch: Partial<Option>) => onChange(prop.options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div className="col" style={{ gap: 6 }}>
      {prop.options.map((o, i) => (
        <div key={o.id} className="row" style={{ gap: 6 }}>
          <input className="inp" aria-label="Nome da opção" value={o.name} onChange={(e) => set(i, { name: e.target.value })} />
          <select className="inp" aria-label="Cor" style={{ width: 90 }} value={o.color ?? "gray"} onChange={(e) => set(i, { color: e.target.value })}>
            {OPTION_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {prop.type === "status" && (
            <select className="inp" aria-label="Etapa" style={{ width: 110 }} value={o.group ?? "todo"} onChange={(e) => set(i, { group: e.target.value as Option["group"] })}>
              <option value="todo">A fazer</option>
              <option value="doing">Em andamento</option>
              <option value="done">Concluído</option>
            </select>
          )}
          <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label={`Remover ${o.name}`} onClick={() => onChange(prop.options.filter((_, j) => j !== i))}><Icon name="close" /></button>
        </div>
      ))}
      <button className="btn btn-fan btn-sm" type="button" style={{ alignSelf: "flex-start" }} disabled={prop.options.length >= 100} onClick={() => onChange([...prop.options, { id: newId(), name: "Nova opção", color: "gray", group: prop.type === "status" ? "todo" : null }])}><Icon name="plus" />Opção</button>
    </div>
  );
}

export function PropertiesMenu({ schema, view, onSchema, databases }: Common & { databases: { id: string; title: string }[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const [relationDb, setRelationDb] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  const setProp = (id: string, patch: Partial<Property>) => onSchema({ ...schema, properties: schema.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const toggleHidden = (id: string) => onSchema(patchView(schema, view.id, { hidden: view.hidden.includes(id) ? view.hidden.filter((h) => h !== id) : [...view.hidden, id] }));
  const valid = name.trim() !== "" && (type !== "relation" || relationDb !== "") && schema.properties.length < 50;

  return (
    <MenuButton icon="table" label="Propriedades" width={420}>
      {() => (
        <>
          {schema.properties.map((p) => (
            <div key={p.id} className="col" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 6 }}>
                <button className="tog" type="button" role="switch" aria-checked={!view.hidden.includes(p.id)} aria-label={`Mostrar ${p.name}`} onClick={() => toggleHidden(p.id)} style={{ padding: 0 }}><span className={`sw${view.hidden.includes(p.id) ? "" : " on"}`}><span className="knob" /></span></button>
                <span className="grow1 trunc" style={{ fontSize: "calc(13px * var(--fs, 1))" }}>{p.name}</span>
                <span className="badge out" style={{ height: 18, fontSize: "calc(11px * var(--fs, 1))" }}>{TYPE_LABEL[p.type]}</span>
                <button className="btn btn-fan btn-sm" type="button" aria-expanded={editing === p.id} onClick={() => setEditing(editing === p.id ? null : p.id)}>Editar</button>
              </div>
              {editing === p.id && (
                <div className="col enter" style={{ gap: 8, padding: "6px 0 8px 36px" }}>
                  <input className="inp" aria-label="Nome da propriedade" value={p.name} onChange={(e) => setProp(p.id, { name: e.target.value })} />
                  {(p.type === "select" || p.type === "multiselect" || p.type === "status") && <OptionsEditor prop={p} onChange={(options) => setProp(p.id, { options })} />}
                  {confirm === p.id ? (
                    <div className="row" style={{ gap: 6 }}>
                      <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--danger)" }}>Apaga a coluna e os valores dela nas views.</span>
                      <button className="btn btn-sec btn-sm" type="button" onClick={() => { onSchema(removeProperty(schema, p.id)); setConfirm(null); setEditing(null); }}>Confirmar</button>
                    </div>
                  ) : (
                    <button className="btn btn-fan btn-sm" type="button" style={{ alignSelf: "flex-start", color: "var(--danger)" }} onClick={() => setConfirm(p.id)}>Apagar propriedade</button>
                  )}
                </div>
              )}
            </div>
          ))}
          <form className="col" style={{ gap: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (!valid) return; onSchema({ ...schema, properties: [...schema.properties, newProperty(type, name.trim(), newId(), type === "relation" ? relationDb : null)] }); setName(""); setType("text"); }}>
            <b style={{ fontWeight: 600, fontSize: "calc(12px * var(--fs, 1))" }}>Nova propriedade</b>
            <div className="row" style={{ gap: 6 }}>
              <input className="inp" aria-label="Nome da nova propriedade" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
              <select className="inp" aria-label="Tipo" style={{ width: 150 }} value={type} onChange={(e) => setType(e.target.value as PropertyType)}>
                {(Object.keys(TYPE_LABEL) as PropertyType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            {type === "relation" && (
              <select className="inp" aria-label="Database ligada" value={relationDb} onChange={(e) => setRelationDb(e.target.value)}>
                <option value="">Ligar a qual database?</option>
                {databases.map((d) => <option key={d.id} value={d.id}>{d.title || "Sem título"}</option>)}
              </select>
            )}
            <button className="btn btn-sec btn-sm" type="submit" disabled={!valid} style={{ alignSelf: "flex-start" }}>Adicionar</button>
          </form>
        </>
      )}
    </MenuButton>
  );
}

/** Agrupar (Kanban e Lista) ou escolher a data (Calendário). */
export function ViewSettings({ schema, view, onSchema }: Common) {
  if (view.type === "kanban" || view.type === "list") {
    const options = schema.properties.filter((p) => p.type === "select" || p.type === "status");
    return (
      <label className="row" style={{ gap: 6, fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>
        Agrupar por
        <select className="inp" aria-label="Agrupar por" style={{ width: "auto", height: 28 }} value={view.groupBy ?? ""} onChange={(e) => onSchema(patchView(schema, view.id, { groupBy: e.target.value || null }))}>
          <option value="">{view.type === "list" ? "Nada" : "Escolher…"}</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
    );
  }
  if (view.type === "calendar") {
    const dates = schema.properties.filter((p) => p.type === "date");
    return (
      <label className="row" style={{ gap: 6, fontSize: "calc(13px * var(--fs, 1))", color: "var(--text-2)" }}>
        Data
        <select className="inp" aria-label="Propriedade de data" style={{ width: "auto", height: 28 }} value={view.dateProp ?? ""} onChange={(e) => onSchema(patchView(schema, view.id, { dateProp: e.target.value || null }))}>
          <option value="">Escolher…</option>
          {dates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
    );
  }
  return null;
}

export { COLOR_BADGE, propLabel };
