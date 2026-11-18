import { isDate } from "../tasks/recurrence.js";
import { isUuid } from "../routing.js";

export const PROPERTY_TYPES = ["text", "number", "select", "multiselect", "date", "checkbox", "status", "url", "relation"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const VIEW_TYPES = ["table", "kanban", "list", "calendar"] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

export interface Option {
  id: string;
  name: string;
  color: string | null;
  /** Só em `status`: a que etapa pertence. */
  group: "todo" | "doing" | "done" | null;
}

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  options: Option[];
  /** Só em `relation`: a database cujas linhas podem ser ligadas. */
  relationDb: string | null;
}

export const FILTER_OPS = ["contains", "equals", "not_equals", "is_empty", "not_empty", "gt", "lt", "checked", "unchecked", "before", "after"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export interface Filter {
  /** Id de propriedade ou "title". */
  prop: string;
  op: FilterOp;
  value: string | number | null;
}

export interface Sort {
  /** Id de propriedade, "title" ou "created". */
  prop: string;
  dir: "asc" | "desc";
}

export interface View {
  id: string;
  name: string;
  type: ViewType;
  filters: Filter[];
  sorts: Sort[];
  /** Kanban e lista agrupada: propriedade select/status que separa as colunas. */
  groupBy: string | null;
  /** Calendário: propriedade de data que posiciona cada linha. */
  dateProp: string | null;
  hidden: string[];
}

export interface Schema {
  properties: Property[];
  views: View[];
}

const MAX_PROPERTIES = 50;
const MAX_OPTIONS = 100;
const MAX_VIEWS = 20;
const MAX_FILTERS = 20;
const MAX_NAME = 60;
const MAX_TEXT = 2000;
const MAX_RELATIONS = 50;
const ID = /^[a-z0-9]{1,24}$/;
const COLOR = /^[a-z]{3,12}$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const name = (v: unknown): v is string => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= MAX_NAME;

function parseOption(raw: unknown, type: PropertyType): Option | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !ID.test(raw.id) || !name(raw.name)) return null;
  const color = raw.color === undefined || raw.color === null ? null : typeof raw.color === "string" && COLOR.test(raw.color) ? raw.color : undefined;
  if (color === undefined) return null;
  let group: Option["group"] = null;
  if (type === "status") {
    if (raw.group !== "todo" && raw.group !== "doing" && raw.group !== "done") return null;
    group = raw.group;
  }
  return { id: raw.id, name: raw.name.trim(), color, group };
}

function parseProperty(raw: unknown): Property | string {
  if (!isRecord(raw) || typeof raw.id !== "string" || !ID.test(raw.id) || raw.id === "title") return "invalid_property_id";
  if (!name(raw.name)) return "invalid_property_name";
  if (!(PROPERTY_TYPES as readonly unknown[]).includes(raw.type)) return "invalid_property_type";
  const type = raw.type as PropertyType;
  const hasOptions = type === "select" || type === "multiselect" || type === "status";
  const rawOptions = raw.options ?? [];
  if (!Array.isArray(rawOptions) || rawOptions.length > MAX_OPTIONS || (!hasOptions && rawOptions.length > 0)) return "invalid_options";
  const options: Option[] = [];
  for (const o of rawOptions) {
    const parsed = parseOption(o, type);
    if (!parsed) return "invalid_options";
    options.push(parsed);
  }
  if (new Set(options.map((o) => o.id)).size !== options.length) return "duplicate_option";
  let relationDb: string | null = null;
  if (type === "relation") {
    if (!isUuid(raw.relationDb)) return "invalid_relation";
    relationDb = raw.relationDb;
  } else if (raw.relationDb !== undefined && raw.relationDb !== null) return "invalid_relation";
  return { id: raw.id, name: raw.name.trim(), type, options, relationDb };
}

function parseView(raw: unknown, props: Map<string, Property>): View | string {
  if (!isRecord(raw) || typeof raw.id !== "string" || !ID.test(raw.id)) return "invalid_view_id";
  if (!name(raw.name)) return "invalid_view_name";
  if (!(VIEW_TYPES as readonly unknown[]).includes(raw.type)) return "invalid_view_type";
  const filters: Filter[] = [];
  const rawFilters = raw.filters ?? [];
  if (!Array.isArray(rawFilters) || rawFilters.length > MAX_FILTERS) return "invalid_filters";
  for (const f of rawFilters) {
    if (!isRecord(f) || typeof f.prop !== "string" || (f.prop !== "title" && !props.has(f.prop))) return "invalid_filters";
    if (!(FILTER_OPS as readonly unknown[]).includes(f.op)) return "invalid_filters";
    const value = f.value ?? null;
    if (value !== null && typeof value !== "string" && typeof value !== "number") return "invalid_filters";
    if (typeof value === "string" && value.length > MAX_TEXT) return "invalid_filters";
    filters.push({ prop: f.prop, op: f.op as FilterOp, value });
  }
  const sorts: Sort[] = [];
  const rawSorts = raw.sorts ?? [];
  if (!Array.isArray(rawSorts) || rawSorts.length > 5) return "invalid_sorts";
  for (const s of rawSorts) {
    if (!isRecord(s) || typeof s.prop !== "string" || (s.prop !== "title" && s.prop !== "created" && !props.has(s.prop))) return "invalid_sorts";
    if (s.dir !== "asc" && s.dir !== "desc") return "invalid_sorts";
    sorts.push({ prop: s.prop, dir: s.dir });
  }
  const pick = (v: unknown, allowed: PropertyType[]): string | null | undefined => {
    if (v === undefined || v === null) return null;
    return typeof v === "string" && allowed.includes(props.get(v)?.type as PropertyType) ? v : undefined;
  };
  const groupBy = pick(raw.groupBy, ["select", "status"]);
  const dateProp = pick(raw.dateProp, ["date"]);
  if (groupBy === undefined) return "invalid_group_by";
  if (dateProp === undefined) return "invalid_date_prop";
  const rawHidden = raw.hidden ?? [];
  if (!Array.isArray(rawHidden) || !rawHidden.every((h) => typeof h === "string" && props.has(h))) return "invalid_hidden";
  return { id: raw.id, name: raw.name.trim(), type: raw.type as ViewType, filters, sorts, groupBy, dateProp, hidden: rawHidden as string[] };
}

/** Confere o esquema inteiro. Devolve o esquema limpo ou o código do primeiro erro. */
export function parseSchema(raw: unknown): Schema | string {
  if (!isRecord(raw)) return "invalid_schema";
  const rawProps = raw.properties ?? [];
  const rawViews = raw.views ?? [];
  if (!Array.isArray(rawProps) || rawProps.length > MAX_PROPERTIES || !Array.isArray(rawViews) || rawViews.length < 1 || rawViews.length > MAX_VIEWS) return "invalid_schema";
  const properties: Property[] = [];
  for (const p of rawProps) {
    const parsed = parseProperty(p);
    if (typeof parsed === "string") return parsed;
    properties.push(parsed);
  }
  if (new Set(properties.map((p) => p.id)).size !== properties.length) return "duplicate_property";
  const map = new Map(properties.map((p) => [p.id, p]));
  const views: View[] = [];
  for (const v of rawViews) {
    const parsed = parseView(v, map);
    if (typeof parsed === "string") return parsed;
    views.push(parsed);
  }
  if (new Set(views.map((v) => v.id)).size !== views.length) return "duplicate_view";
  return { properties, views };
}

export type PropValue = string | number | boolean | string[] | null;

/**
 * Confere os valores de uma linha contra o esquema. `null` apaga o valor.
 * Devolve só o que veio, já validado, ou o código do erro.
 */
export function parseProps(schema: Schema, raw: unknown): Record<string, PropValue> | string {
  if (!isRecord(raw)) return "invalid_props";
  const out: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    const prop = schema.properties.find((p) => p.id === key);
    if (!prop) return "unknown_property";
    if (value === null) {
      out[key] = null;
      continue;
    }
    const optionIds = new Set(prop.options.map((o) => o.id));
    switch (prop.type) {
      case "text":
        if (typeof value !== "string" || value.length > MAX_TEXT) return "invalid_value";
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) return "invalid_value";
        break;
      case "checkbox":
        if (typeof value !== "boolean") return "invalid_value";
        break;
      case "date":
        if (!isDate(value)) return "invalid_value";
        break;
      case "url":
        if (typeof value !== "string" || value.length > MAX_TEXT || !/^https?:\/\//i.test(value)) return "invalid_value";
        break;
      case "select":
      case "status":
        if (typeof value !== "string" || !optionIds.has(value)) return "invalid_value";
        break;
      case "multiselect":
        if (!Array.isArray(value) || value.length > MAX_OPTIONS || !value.every((v) => typeof v === "string" && optionIds.has(v)) || new Set(value).size !== value.length) return "invalid_value";
        break;
      case "relation":
        if (!Array.isArray(value) || value.length > MAX_RELATIONS || !value.every(isUuid) || new Set(value).size !== value.length) return "invalid_value";
        break;
    }
    out[key] = value as PropValue;
  }
  return out;
}

const opt = (id: string, name: string, color: string, group?: Option["group"]): Option => ({ id, name, color, group: group ?? null });

/** Esquema de uma database nova: Status e Data, com as views Tabela e Kanban. */
export function defaultSchema(): Schema {
  return {
    properties: [
      { id: "status", name: "Status", type: "status", relationDb: null, options: [opt("todo", "A fazer", "gray", "todo"), opt("doing", "Em andamento", "blue", "doing"), opt("done", "Concluído", "green", "done")] },
      { id: "data", name: "Data", type: "date", options: [], relationDb: null },
    ],
    views: [
      { id: "tabela", name: "Tabela", type: "table", filters: [], sorts: [], groupBy: null, dateProp: null, hidden: [] },
      { id: "kanban", name: "Kanban", type: "kanban", filters: [], sorts: [], groupBy: "status", dateProp: null, hidden: [] },
    ],
  };
}
