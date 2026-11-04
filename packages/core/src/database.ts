export type PropertyType = "text" | "number" | "select" | "multi_select" | "date" | "checkbox" | "url";

export const PROPERTY_TYPES: readonly PropertyType[] = [
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "checkbox",
  "url",
];

export const OPTION_COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
export type OptionColor = (typeof OPTION_COLORS)[number];

export interface SelectOption {
  id: string;
  name: string;
  color: OptionColor;
}

export interface PropertyDef {
  key: string;
  name: string;
  type: PropertyType;
  options?: SelectOption[];
}

export interface DatabaseSchema {
  properties: PropertyDef[];
}

export interface SortRule {
  key: string;
  direction: "asc" | "desc";
}

export interface TableColumn {
  key: string;
  width?: number;
}

export interface TableView {
  id: string;
  name: string;
  type: "table";
  columns: TableColumn[];
  sort: SortRule[];
}

export interface KanbanView {
  id: string;
  name: string;
  type: "kanban";
  groupBy: string | null;
  sort: SortRule[];
}

export type ViewDef = TableView | KanbanView;

export interface DatabaseProps {
  schema: DatabaseSchema;
  views: ViewDef[];
}

export interface DatabaseRow {
  id: string;
  title: string;
  props: Record<string, unknown>;
  sortKey: string | null;
  rev: number;
  createdAt: string;
  updatedAt: string;
}

export const TITLE_KEY = "title";
export const MAX_PROPERTIES = 100;
export const MAX_OPTIONS = 200;
export const MAX_VIEWS = 20;
export const MAX_SORT_RULES = 5;
export const MAX_TEXT_VALUE = 2000;
export const MAX_URL_VALUE = 2000;
export const SORT_KEY_PATTERN = /^[0-9A-Za-z]{1,64}$/;

const ID_PATTERN = /^[a-z0-9_]{1,40}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validName = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length >= 1 && value.length <= 100;

export function defaultDatabaseProps(viewId = "v_table"): DatabaseProps {
  return {
    schema: { properties: [] },
    views: [{ id: viewId, name: "Tabela", type: "table", columns: [{ key: TITLE_KEY }], sort: [] }],
  };
}

function parseOptions(value: unknown): SelectOption[] | null {
  if (!Array.isArray(value) || value.length > MAX_OPTIONS) return null;
  const seen = new Set<string>();
  const out: SelectOption[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const { id, name, color } = raw;
    if (typeof id !== "string" || !ID_PATTERN.test(id) || seen.has(id)) return null;
    if (!validName(name)) return null;
    if (typeof color !== "string" || !(OPTION_COLORS as readonly string[]).includes(color)) return null;
    seen.add(id);
    out.push({ id, name, color: color as OptionColor });
  }
  return out;
}

function parseProperty(raw: unknown): PropertyDef | null {
  if (!isRecord(raw)) return null;
  const { key, name, type, options } = raw;
  if (typeof key !== "string" || !ID_PATTERN.test(key) || key === TITLE_KEY) return null;
  if (!validName(name)) return null;
  if (typeof type !== "string" || !(PROPERTY_TYPES as readonly string[]).includes(type)) return null;
  const property: PropertyDef = { key, name, type: type as PropertyType };
  if (type === "select" || type === "multi_select") {
    const parsed = parseOptions(options ?? []);
    if (!parsed) return null;
    property.options = parsed;
  } else if (options !== undefined) {
    return null;
  }
  return property;
}

function parseSort(value: unknown, keys: Set<string>): SortRule[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SORT_RULES) return null;
  const out: SortRule[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const { key, direction } = raw;
    if (typeof key !== "string" || !keys.has(key)) return null;
    if (direction !== "asc" && direction !== "desc") return null;
    out.push({ key, direction });
  }
  return out;
}

function parseView(raw: unknown, properties: PropertyDef[]): ViewDef | null {
  if (!isRecord(raw)) return null;
  const { id, name, type } = raw;
  if (typeof id !== "string" || !ID_PATTERN.test(id) || !validName(name)) return null;
  const keys = new Set([TITLE_KEY, ...properties.map((p) => p.key)]);
  const sort = parseSort(raw.sort, keys);
  if (!sort) return null;

  if (type === "table") {
    if (!Array.isArray(raw.columns)) return null;
    const seen = new Set<string>();
    const columns: TableColumn[] = [];
    for (const column of raw.columns) {
      if (!isRecord(column) || typeof column.key !== "string" || !keys.has(column.key) || seen.has(column.key)) {
        return null;
      }
      const width = column.width;
      if (width !== undefined && (typeof width !== "number" || !Number.isInteger(width) || width < 60 || width > 800)) {
        return null;
      }
      seen.add(column.key);
      columns.push(width === undefined ? { key: column.key } : { key: column.key, width });
    }
    return { id, name, type, columns, sort };
  }

  if (type === "kanban") {
    const groupBy = raw.groupBy ?? null;
    if (groupBy !== null) {
      const target = properties.find((p) => p.key === groupBy);
      if (!target || target.type !== "select") return null;
    }
    return { id, name, type, groupBy: groupBy as string | null, sort };
  }

  return null;
}

export function parseDatabaseProps(value: unknown): DatabaseProps | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => key !== "schema" && key !== "views")) return null;
  const { schema, views } = value;
  if (!isRecord(schema) || !Array.isArray(schema.properties) || schema.properties.length > MAX_PROPERTIES) return null;

  const properties: PropertyDef[] = [];
  const seen = new Set<string>();
  for (const raw of schema.properties) {
    const property = parseProperty(raw);
    if (!property || seen.has(property.key)) return null;
    seen.add(property.key);
    properties.push(property);
  }

  if (!Array.isArray(views) || views.length < 1 || views.length > MAX_VIEWS) return null;
  const parsedViews: ViewDef[] = [];
  const viewIds = new Set<string>();
  for (const raw of views) {
    const view = parseView(raw, properties);
    if (!view || viewIds.has(view.id)) return null;
    viewIds.add(view.id);
    parsedViews.push(view);
  }

  return { schema: { properties }, views: parsedViews };
}

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
}

export function isValidCellValue(property: PropertyDef, value: unknown): boolean {
  if (value === null) return true;
  switch (property.type) {
    case "text":
      return typeof value === "string" && value.length <= MAX_TEXT_VALUE;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "checkbox":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && isRealDate(value);
    case "url":
      return typeof value === "string" && value.length <= MAX_URL_VALUE && /^https?:\/\/\S+$/i.test(value);
    case "select":
      return typeof value === "string" && ID_PATTERN.test(value);
    case "multi_select":
      return (
        Array.isArray(value) &&
        value.length <= MAX_OPTIONS &&
        value.every((v) => typeof v === "string" && ID_PATTERN.test(v)) &&
        new Set(value).size === value.length
      );
  }
}

export type RowPropsResult = { ok: true; props: Record<string, unknown> } | { ok: false; key: string };

export function applyRowProps(
  schema: DatabaseSchema,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): RowPropsResult {
  const byKey = new Map(schema.properties.map((p) => [p.key, p]));
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(current)) {
    if (byKey.has(key) && value !== null) next[key] = value;
  }
  for (const [key, value] of Object.entries(patch)) {
    const property = byKey.get(key);
    if (!property || !isValidCellValue(property, value)) return { ok: false, key };
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return { ok: true, props: next };
}
