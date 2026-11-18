export type PropertyType = "text" | "number" | "select" | "multiselect" | "date" | "checkbox" | "status" | "url" | "relation";
export type ViewType = "table" | "kanban" | "list" | "calendar";

export interface Option {
  id: string;
  name: string;
  color: string | null;
  group: "todo" | "doing" | "done" | null;
}

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  options: Option[];
  relationDb: string | null;
}

export type FilterOp = "contains" | "equals" | "not_equals" | "is_empty" | "not_empty" | "gt" | "lt" | "checked" | "unchecked" | "before" | "after";

export interface Filter {
  prop: string;
  op: FilterOp;
  value: string | number | null;
}

export interface Sort {
  prop: string;
  dir: "asc" | "desc";
}

export interface View {
  id: string;
  name: string;
  type: ViewType;
  filters: Filter[];
  sorts: Sort[];
  groupBy: string | null;
  dateProp: string | null;
  hidden: string[];
}

export interface Schema {
  properties: Property[];
  views: View[];
}

export type PropValue = string | number | boolean | string[] | null | undefined;

export interface Row {
  id: string;
  title: string;
  icon: string | null;
  props: Record<string, PropValue>;
  createdAt: string;
  updatedAt: string;
}

export const TYPE_LABEL: Record<PropertyType, string> = {
  text: "Texto",
  number: "Número",
  select: "Seleção",
  multiselect: "Multisseleção",
  date: "Data",
  checkbox: "Caixa de seleção",
  status: "Status",
  url: "URL",
  relation: "Relação",
};

export const VIEW_LABEL: Record<ViewType, string> = { table: "Tabela", kanban: "Kanban", list: "Lista", calendar: "Calendário" };

export const OP_LABEL: Record<FilterOp, string> = {
  contains: "contém",
  equals: "é",
  not_equals: "não é",
  is_empty: "está vazio",
  not_empty: "não está vazio",
  gt: "maior que",
  lt: "menor que",
  checked: "marcado",
  unchecked: "desmarcado",
  before: "antes de",
  after: "depois de",
};

/** Cores de opção e a classe de selo do design que cada uma usa. */
export const OPTION_COLORS = ["gray", "blue", "green", "yellow", "red", "purple", "pink"] as const;
export const COLOR_BADGE: Record<string, string> = { gray: "badge", blue: "badge ac", green: "badge ok", yellow: "badge warn", red: "badge bad", purple: "badge h", pink: "badge r" };
