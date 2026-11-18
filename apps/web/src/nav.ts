export type RouteId =
  | "busca"
  | "hoje"
  | "semana"
  | "inbox"
  | "estudo"
  | "metas"
  | "rotina"
  | "progresso"
  | "notificacoes"
  | "lixeira"
  | "configuracoes";

export interface NavItem {
  id: RouteId;
  label: string;
  icon: string;
  shortcut?: string;
}

export const NAV_MAIN: NavItem[] = [
  { id: "busca", label: "Buscar", icon: "search", shortcut: "⌘K" },
  { id: "hoje", label: "Hoje", icon: "today" },
  { id: "semana", label: "Semana", icon: "week" },
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "estudo", label: "Estudo", icon: "study" },
  { id: "metas", label: "Metas", icon: "target" },
];

export const NAV_HERMES: NavItem[] = [
  { id: "rotina", label: "Rotina e check-ins", icon: "clock" },
  { id: "progresso", label: "Progresso", icon: "chart" },
];

export const NAV_FOOTER: NavItem[] = [
  { id: "notificacoes", label: "Notificações", icon: "bell" },
  { id: "lixeira", label: "Lixeira", icon: "trash" },
  { id: "configuracoes", label: "Configurações", icon: "settings" },
];

export const DEFAULT_ROUTE: RouteId = "hoje";

const ALL: NavItem[] = [...NAV_MAIN, ...NAV_HERMES, ...NAV_FOOTER];

export function parseRoute(hash: string): RouteId {
  const id = hash.replace(/^#\/?/, "").split("/")[0];
  return ALL.some((item) => item.id === id) ? (id as RouteId) : DEFAULT_ROUTE;
}

export function routeTitle(id: RouteId): string {
  return ALL.find((item) => item.id === id)?.label ?? "";
}

export function routeHash(id: RouteId): string {
  return `#/${id}`;
}
