import type { Filter, FilterOp, Option, Property, PropertyType, PropValue, Row, Schema, Sort, View, ViewType } from "./db-types";

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Identificador curto (letras minúsculas e números) para propriedades, opções e views. */
export function newId(random: () => number = Math.random): string {
  let out = "";
  while (out.length < 8) out += Math.floor(random() * 36).toString(36);
  return out;
}

export const OPS_BY_TYPE: Record<PropertyType | "title", FilterOp[]> = {
  title: ["contains", "equals", "not_equals", "is_empty", "not_empty"],
  text: ["contains", "equals", "not_equals", "is_empty", "not_empty"],
  url: ["contains", "is_empty", "not_empty"],
  number: ["equals", "gt", "lt", "is_empty", "not_empty"],
  select: ["equals", "not_equals", "is_empty", "not_empty"],
  status: ["equals", "not_equals", "is_empty", "not_empty"],
  multiselect: ["contains", "is_empty", "not_empty"],
  date: ["equals", "before", "after", "is_empty", "not_empty"],
  checkbox: ["checked", "unchecked"],
  relation: ["is_empty", "not_empty"],
};

/** Operações que não precisam de um valor para comparar. */
export const NO_VALUE_OPS: FilterOp[] = ["is_empty", "not_empty", "checked", "unchecked"];

const isEmpty = (v: PropValue): boolean => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

const propOf = (schema: Schema, id: string): Property | undefined => schema.properties.find((p) => p.id === id);

/** Valor de uma linha para uma propriedade (ou o título). */
function valueOf(row: Row, id: string): PropValue {
  return id === "title" ? row.title : row.props[id];
}

export function matchesFilter(row: Row, schema: Schema, filter: Filter): boolean {
  const type: PropertyType | "title" = filter.prop === "title" ? "title" : (propOf(schema, filter.prop)?.type ?? "text");
  const v = valueOf(row, filter.prop);
  const arg = filter.value;
  switch (filter.op) {
    case "is_empty":
      return isEmpty(v);
    case "not_empty":
      return !isEmpty(v);
    case "checked":
      return v === true;
    case "unchecked":
      return v !== true;
    case "contains":
      if (type === "multiselect") return Array.isArray(v) && typeof arg === "string" && v.includes(arg);
      return typeof v === "string" && arg !== null && normalize(v).includes(normalize(String(arg)));
    case "equals":
      if (type === "number") return typeof v === "number" && arg !== null && v === Number(arg);
      if (type === "title" || type === "text") return typeof v === "string" && arg !== null && normalize(v) === normalize(String(arg));
      return v === arg;
    case "not_equals":
      return !matchesFilter(row, schema, { ...filter, op: "equals" });
    case "gt":
      return typeof v === "number" && arg !== null && arg !== "" && v > Number(arg);
    case "lt":
      return typeof v === "number" && arg !== null && arg !== "" && v < Number(arg);
    case "before":
      return typeof v === "string" && typeof arg === "string" && arg !== "" && v < arg;
    case "after":
      return typeof v === "string" && typeof arg === "string" && arg !== "" && v > arg;
  }
}

export function applyFilters(rows: readonly Row[], schema: Schema, filters: readonly Filter[]): Row[] {
  // Filtro incompleto (sem valor, quando precisa) é ignorado: não esconde tudo enquanto se digita.
  const active = filters.filter((f) => NO_VALUE_OPS.includes(f.op) || (f.value !== null && f.value !== ""));
  return rows.filter((row) => active.every((f) => matchesFilter(row, schema, f)));
}

function compareValues(a: PropValue, b: PropValue, prop: Property | undefined): number {
  // Vazios sempre no fim, qualquer que seja a direção (tratado fora, em sortRows).
  if (prop && (prop.type === "select" || prop.type === "status")) {
    const idx = (v: PropValue) => prop.options.findIndex((o) => o.id === v);
    return idx(a) - idx(b);
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length - b.length;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
}

export function sortRows(rows: readonly Row[], schema: Schema, sorts: readonly Sort[]): Row[] {
  if (sorts.length === 0) return [...rows];
  return [...rows].sort((x, y) => {
    for (const s of sorts) {
      const a = s.prop === "created" ? x.createdAt : valueOf(x, s.prop);
      const b = s.prop === "created" ? y.createdAt : valueOf(y, s.prop);
      const ea = isEmpty(a);
      const eb = isEmpty(b);
      if (ea || eb) {
        if (ea && eb) continue;
        return ea ? 1 : -1;
      }
      const c = compareValues(a, b, propOf(schema, s.prop));
      if (c !== 0) return s.dir === "asc" ? c : -c;
    }
    return 0;
  });
}

/** Linhas da view: filtradas e ordenadas. */
export function viewRows(rows: readonly Row[], schema: Schema, view: View): Row[] {
  return sortRows(applyFilters(rows, schema, view.filters), schema, view.sorts);
}

export interface Group {
  /** Id da opção, ou "" para linhas sem valor. */
  key: string;
  label: string;
  color: string | null;
  rows: Row[];
}

/** Separa as linhas por opção da propriedade (na ordem das opções); o que não tem valor vai para "Sem valor". */
export function groupRows(rows: readonly Row[], prop: Property, withEmpty = true): Group[] {
  const groups: Group[] = prop.options.map((o: Option) => ({ key: o.id, label: o.name, color: o.color, rows: [] }));
  const none: Group = { key: "", label: "Sem valor", color: null, rows: [] };
  for (const row of rows) {
    const v = row.props[prop.id];
    const group = typeof v === "string" ? groups.find((g) => g.key === v) : undefined;
    (group ?? none).rows.push(row);
  }
  return withEmpty && none.rows.length > 0 ? [none, ...groups] : groups;
}

// ---- calendário --------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Semanas do mês (como listas de 7 datas AAAA-MM-DD) para a grade do calendário. `month` vai de 0 a 11. */
export function calendarWeeks(year: number, month: number, weekStart: 0 | 1 = 1): string[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() - weekStart + 7) % 7;
  const start = Date.UTC(year, month, 1 - offset);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weeks = Math.ceil((offset + lastDay) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start + (w * 7 + d) * 86_400_000);
      return isoDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    }),
  );
}

/** Linhas por dia, pela propriedade de data. */
export function rowsByDate(rows: readonly Row[], propId: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const v = row.props[propId];
    if (typeof v !== "string") continue;
    map.set(v, [...(map.get(v) ?? []), row]);
  }
  return map;
}

// ---- esquema -----------------------------------------------------------------

export function newView(type: ViewType, schema: Schema, id: string, name: string): View {
  const group = schema.properties.find((p) => p.type === "status") ?? schema.properties.find((p) => p.type === "select");
  const date = schema.properties.find((p) => p.type === "date");
  return { id, name, type, filters: [], sorts: [], groupBy: type === "kanban" || type === "list" ? (group?.id ?? null) : null, dateProp: type === "calendar" ? (date?.id ?? null) : null, hidden: [] };
}

export function newProperty(type: PropertyType, name: string, id: string, relationDb: string | null = null): Property {
  const options: Option[] =
    type === "status"
      ? [
          { id: newId(), name: "A fazer", color: "gray", group: "todo" },
          { id: newId(), name: "Em andamento", color: "blue", group: "doing" },
          { id: newId(), name: "Concluído", color: "green", group: "done" },
        ]
      : [];
  return { id, name, type, options, relationDb: type === "relation" ? relationDb : null };
}

/** Tira do esquema o que aponta para a propriedade removida (filtros, ordenações, agrupamento, data, ocultas). */
export function removeProperty(schema: Schema, propId: string): Schema {
  return {
    properties: schema.properties.filter((p) => p.id !== propId),
    views: schema.views.map((v) => ({
      ...v,
      filters: v.filters.filter((f) => f.prop !== propId),
      sorts: v.sorts.filter((s) => s.prop !== propId),
      groupBy: v.groupBy === propId ? null : v.groupBy,
      dateProp: v.dateProp === propId ? null : v.dateProp,
      hidden: v.hidden.filter((h) => h !== propId),
    })),
  };
}

/** Texto curto de um valor (para lista, cartão e título de calendário). */
export function valueText(prop: Property, value: PropValue): string {
  if (isEmpty(value)) return "";
  switch (prop.type) {
    case "select":
    case "status":
      return prop.options.find((o) => o.id === value)?.name ?? "";
    case "multiselect":
      return (Array.isArray(value) ? value : []).map((id) => prop.options.find((o) => o.id === id)?.name).filter(Boolean).join(", ");
    case "checkbox":
      return value === true ? "Sim" : "";
    case "date":
      return typeof value === "string" ? value.split("-").reverse().join("/") : "";
    case "relation":
      return Array.isArray(value) ? `${value.length}` : "";
    default:
      return String(value);
  }
}
