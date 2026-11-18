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

export type Route = { kind: "tela"; id: RouteId } | { kind: "pagina"; pageId: string };

const ALL: NavItem[] = [...NAV_MAIN, ...NAV_HERMES, ...NAV_FOOTER];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRoute(hash: string): Route {
  const [head, second] = hash.replace(/^#\/?/, "").split("/");
  if (head === "p" && second && UUID.test(second)) return { kind: "pagina", pageId: second.toLowerCase() };
  const item = ALL.find((entry) => entry.id === head);
  return { kind: "tela", id: item ? item.id : DEFAULT_ROUTE };
}

export function routeTitle(id: RouteId): string {
  return ALL.find((item) => item.id === id)?.label ?? "";
}

export function routeHash(id: RouteId): string {
  return `#/${id}`;
}

export function pageHash(pageId: string): string {
  return `#/p/${pageId}`;
}
