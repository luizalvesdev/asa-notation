import { DEMO } from "./demo-flag";

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
  | "configuracoes"
  | "revisao"
  | "estudo-stats"
  | "importar"
  | "agente";

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
  // O agente de trabalho roda na máquina do autor: fora da demo.
  ...(DEMO ? [] : [{ id: "agente" as const, label: "Trabalho", icon: "kanban" }]),
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

/** Atalhos "G e depois a letra" (como no Gmail e no GitHub) para ir às telas. */
export const GO_KEYS: Record<string, RouteId> = {
  h: "hoje",
  s: "semana",
  i: "inbox",
  e: "estudo",
  v: "revisao",
  m: "metas",
  t: "agente",
  r: "rotina",
  p: "progresso",
  n: "notificacoes",
  l: "lixeira",
  c: "configuracoes",
};

export function goKey(id: RouteId): string | null {
  return Object.entries(GO_KEYS).find(([, target]) => target === id)?.[0] ?? null;
}

/** Quanto tempo depois do G a segunda tecla ainda vale. */
export const GO_WINDOW_MS = 1500;

/**
 * Lê uma tecla na sequência do atalho. `armedAt` é quando o G foi apertado (ou null).
 * Devolve o novo estado e, se completou, a tela de destino.
 */
export function goStep(armedAt: number | null, key: string, now: number): { armedAt: number | null; target: RouteId | null } {
  const k = key.toLowerCase();
  if (armedAt !== null && now - armedAt <= GO_WINDOW_MS) {
    const target = GO_KEYS[k] ?? null;
    if (target) return { armedAt: null, target };
    return { armedAt: k === "g" ? now : null, target: null };
  }
  return { armedAt: k === "g" ? now : null, target: null };
}

export type Route = { kind: "tela"; id: RouteId; sub?: string } | { kind: "pagina"; pageId: string } | { kind: "publica"; slug: string };

/** Telas que não aparecem na barra lateral. Pertencem a uma tela principal (a que fica marcada). */
const HIDDEN: (NavItem & { parent: RouteId; slug: string })[] = [
  { id: "revisao", label: "Revisão", icon: "study", parent: "estudo", slug: "estudo/revisao" },
  { id: "estudo-stats", label: "Estatísticas de estudo", icon: "chart", parent: "estudo", slug: "estudo/estatisticas" },
  { id: "importar", label: "Importar", icon: "doc", parent: "configuracoes", slug: "configuracoes/importar" },
];

const ALL: NavItem[] = [...NAV_MAIN, ...NAV_HERMES, ...NAV_FOOTER, ...HIDDEN];
const PUBLIC_SLUG = /^[A-Za-z0-9_-]{8,32}$/;
const CARD_REF = /^[A-Za-z][A-Za-z0-9]{0,15}-\d{1,8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  const [head, second] = path.split("/");
  if (head === "s" && second && PUBLIC_SLUG.test(second)) return { kind: "publica", slug: second };
  const hidden = HIDDEN.find((entry) => entry.slug === `${head}/${second}`);
  if (hidden) return { kind: "tela", id: hidden.id };
  if (head === "rotina" && (second === "quinta" || second === "sabado")) return { kind: "tela", id: "rotina", sub: second };
  if (head === "p" && second && UUID.test(second)) return { kind: "pagina", pageId: second.toLowerCase() };
  if (head === "agente" && second && CARD_REF.test(second)) return { kind: "tela", id: "agente", sub: second.toUpperCase() };
  const item = ALL.find((entry) => entry.id === head);
  return { kind: "tela", id: item ? item.id : DEFAULT_ROUTE };
}

export function routeTitle(id: RouteId): string {
  return ALL.find((item) => item.id === id)?.label ?? "";
}

export function routeHash(id: RouteId): string {
  const hidden = HIDDEN.find((entry) => entry.id === id);
  return `#/${hidden ? hidden.slug : id}`;
}

/** A tela da barra lateral que fica marcada quando `id` está aberta. */
export function navParent(id: RouteId): RouteId {
  return HIDDEN.find((entry) => entry.id === id)?.parent ?? id;
}

export function cardHash(ref: string): string {
  return `#/agente/${ref}`;
}

export function pageHash(pageId: string): string {
  return `#/p/${pageId}`;
}

export function publicHash(slug: string): string {
  return `#/s/${slug}`;
}
