import {
  defaultDatabaseProps,
  isValidCellValue,
  OPTION_COLORS,
  parseDatabaseProps,
  TITLE_KEY,
  type DatabaseProps,
  type DatabaseRow,
  type DatabaseSchema,
  type PropertyDef,
  type PropertyType,
  type SelectOption,
  type SortRule,
  type ViewDef,
} from "@asa/core";
import { generateKeyBetween } from "fractional-indexing";

export function newId(prefix: "p" | "o" | "v"): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

export function asDatabaseProps(props: unknown): DatabaseProps {
  return parseDatabaseProps(props) ?? defaultDatabaseProps();
}

export const PROPERTY_LABELS: Record<PropertyType, string> = {
  text: "Texto",
  number: "Número",
  select: "Seleção",
  multi_select: "Multisseleção",
  date: "Data",
  checkbox: "Caixa de seleção",
  url: "URL",
};

const hasOptions = (type: PropertyType) => type === "select" || type === "multi_select";

export function addProperty(props: DatabaseProps, type: PropertyType = "text"): { props: DatabaseProps; key: string } {
  const key = newId("p");
  const count = props.schema.properties.length + 1;
  const property: PropertyDef = { key, name: `Propriedade ${count}`, type };
  if (hasOptions(type)) property.options = [];
  return {
    key,
    props: {
      schema: { properties: [...props.schema.properties, property] },
      views: props.views.map((view) =>
        view.type === "table" ? { ...view, columns: [...view.columns, { key }] } : view,
      ),
    },
  };
}

function detachFromViews(views: ViewDef[], key: string, keepColumns: boolean): ViewDef[] {
  return views.map((view) => {
    const sort = view.sort.filter((rule) => rule.key !== key);
    if (view.type === "table") {
      return { ...view, sort, columns: keepColumns ? view.columns : view.columns.filter((c) => c.key !== key) };
    }
    return { ...view, sort, groupBy: view.groupBy === key ? null : view.groupBy };
  });
}

export function updateProperty(
  props: DatabaseProps,
  key: string,
  changes: { name?: string; type?: PropertyType; options?: SelectOption[] },
): DatabaseProps {
  let views = props.views;
  const properties = props.schema.properties.map((property) => {
    if (property.key !== key) return property;
    const next: PropertyDef = { ...property, ...(changes.name !== undefined ? { name: changes.name } : {}) };
    if (changes.type !== undefined && changes.type !== property.type) {
      next.type = changes.type;
      if (hasOptions(changes.type)) next.options = property.options ?? [];
      else delete next.options;
      if (property.type === "select") views = detachFromViews(views, key, true);
    }
    if (changes.options !== undefined && hasOptions(next.type)) next.options = changes.options;
    return next;
  });
  return { schema: { properties }, views };
}

export function removeProperty(props: DatabaseProps, key: string): DatabaseProps {
  return {
    schema: { properties: props.schema.properties.filter((p) => p.key !== key) },
    views: detachFromViews(props.views, key, false),
  };
}

export function newOption(existing: SelectOption[], name?: string): SelectOption {
  return {
    id: newId("o"),
    name: name ?? `Opção ${existing.length + 1}`,
    color: OPTION_COLORS[existing.length % OPTION_COLORS.length]!,
  };
}

export function setViewSort(props: DatabaseProps, viewId: string, sort: SortRule[]): DatabaseProps {
  return { ...props, views: props.views.map((view) => (view.id === viewId ? { ...view, sort } : view)) };
}

export function setKanbanGroup(props: DatabaseProps, viewId: string, groupBy: string | null): DatabaseProps {
  return {
    ...props,
    views: props.views.map((view) => (view.id === viewId && view.type === "kanban" ? { ...view, groupBy } : view)),
  };
}

export function addView(props: DatabaseProps, type: ViewDef["type"]): { props: DatabaseProps; viewId: string } {
  const id = newId("v");
  const firstSelect = props.schema.properties.find((p) => p.type === "select");
  const view: ViewDef =
    type === "table"
      ? {
          id,
          name: "Tabela",
          type: "table",
          columns: [{ key: TITLE_KEY }, ...props.schema.properties.map((p) => ({ key: p.key }))],
          sort: [],
        }
      : { id, name: "Quadro", type: "kanban", groupBy: firstSelect?.key ?? null, sort: [] };
  return { viewId: id, props: { ...props, views: [...props.views, view] } };
}

export function removeView(props: DatabaseProps, viewId: string): DatabaseProps {
  if (props.views.length <= 1) return props;
  return { ...props, views: props.views.filter((view) => view.id !== viewId) };
}

export function cellValue(property: PropertyDef, raw: unknown): unknown {
  if (raw === undefined || !isValidCellValue(property, raw)) return null;
  if (property.type === "select") {
    return property.options?.some((o) => o.id === raw) ? raw : null;
  }
  if (property.type === "multi_select") {
    const known = new Set(property.options?.map((o) => o.id));
    const values = (raw as string[]).filter((id) => known.has(id));
    return values.length > 0 ? values : null;
  }
  return raw;
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function sortValue(row: DatabaseRow, key: string, schema: DatabaseSchema): string | number | boolean | null {
  if (key === TITLE_KEY) return row.title === "" ? null : row.title;
  const property = schema.properties.find((p) => p.key === key);
  if (!property) return null;
  const value = cellValue(property, row.props[key]);
  if (value === null) return null;
  if (property.type === "select") return property.options!.findIndex((o) => o.id === value);
  if (property.type === "multi_select") return (value as string[]).length;
  return value as string | number | boolean;
}

function compareManual(a: DatabaseRow, b: DatabaseRow): number {
  if (a.sortKey !== b.sortKey) {
    if (a.sortKey === null) return 1;
    if (b.sortKey === null) return -1;
    return a.sortKey < b.sortKey ? -1 : 1;
  }
  return a.createdAt.localeCompare(b.createdAt);
}

export function sortRows(rows: DatabaseRow[], sort: SortRule[], schema: DatabaseSchema): DatabaseRow[] {
  return [...rows].sort((a, b) => {
    for (const rule of sort) {
      const left = sortValue(a, rule.key, schema);
      const right = sortValue(b, rule.key, schema);
      if (left === right) continue;
      if (left === null) return 1;
      if (right === null) return -1;
      const order =
        typeof left === "string" && typeof right === "string"
          ? collator.compare(left, right)
          : left < right
            ? -1
            : 1;
      if (order !== 0) return rule.direction === "asc" ? order : -order;
    }
    return compareManual(a, b);
  });
}

export function keyBetween(before: string | null, after: string | null): string {
  try {
    return generateKeyBetween(before, after);
  } catch {
    try {
      return generateKeyBetween(before, null);
    } catch {
      return generateKeyBetween(null, null);
    }
  }
}

export function keyAfterAll(rows: DatabaseRow[]): string {
  const keys = rows.map((r) => r.sortKey).filter((k): k is string => k !== null).sort();
  return keyBetween(keys[keys.length - 1] ?? null, null);
}

export const NO_GROUP = "__none__";

export function groupRows(rows: DatabaseRow[], property: PropertyDef): Map<string, DatabaseRow[]> {
  const groups = new Map<string, DatabaseRow[]>([[NO_GROUP, []]]);
  for (const option of property.options ?? []) groups.set(option.id, []);
  for (const row of rows) {
    const value = cellValue(property, row.props[property.key]);
    groups.get(typeof value === "string" ? value : NO_GROUP)!.push(row);
  }
  return groups;
}
