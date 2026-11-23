/** Uma ação de uma tela (tarefa, captura, card...), oferecida no botão direito antes das ações gerais. */
export interface LocalItem {
  label: string;
  run: () => void;
  danger?: boolean;
  shortcut?: string;
}

/** Onde o botão direito foi clicado, e o que o app oferece ali. */
export type ContextTarget =
  | { kind: "page"; id: string; favorite: boolean }
  | { kind: "link"; href: string; internal: boolean }
  | { kind: "local"; items: LocalItem[]; hasSelection: boolean }
  | { kind: "none"; hasSelection: boolean };

export type MenuAction =
  | "open"
  | "new-child"
  | "favorite"
  | "copy-link"
  | "delete"
  | "open-link"
  | "copy-href"
  | "copy-text"
  | "new-page"
  | "new-section"
  | "capture"
  | "search"
  | "chat"
  | "theme"
  | `local:${number}`;

export interface MenuItem {
  id: MenuAction;
  label: string;
  shortcut?: string;
  danger?: boolean;
  /** Linha separadora antes deste item. */
  separator?: boolean;
}

/** As ações gerais do app, que aparecem em todo lugar (depois das ações do que foi clicado, separadas). */
function general(hasSelection: boolean): MenuItem[] {
  return [
    ...(hasSelection ? [{ id: "copy-text" as const, label: "Copiar", shortcut: "⌘C" }] : []),
    { id: "new-page", label: "Nova página", ...(hasSelection ? { separator: true } : {}) },
    { id: "new-section", label: "Nova seção" },
    { id: "capture", label: "Capturar", shortcut: "⌘⇧K" },
    { id: "search", label: "Buscar", shortcut: "⌘K" },
    { id: "chat", label: "Assistentes", shortcut: "⌘J" },
    { id: "theme", label: "Alternar tema", separator: true },
  ];
}

/** Ações do que foi clicado e, depois de um divisor, as gerais. */
function withGeneral(own: MenuItem[], hasSelection = false): MenuItem[] {
  const rest = general(hasSelection);
  return own.length === 0 ? rest : [...own, { ...rest[0]!, separator: true }, ...rest.slice(1)];
}

export function menuFor(target: ContextTarget): MenuItem[] {
  if (target.kind === "page") {
    return withGeneral([
      { id: "open", label: "Abrir" },
      { id: "new-child", label: "Nova subpágina" },
      { id: "favorite", label: target.favorite ? "Remover das favoritas" : "Adicionar às favoritas" },
      { id: "copy-link", label: "Copiar link da página" },
      { id: "delete", label: "Mover para a lixeira", danger: true, separator: true },
    ]);
  }
  if (target.kind === "link") {
    return withGeneral([
      { id: "open-link", label: target.internal ? "Abrir" : "Abrir em nova aba" },
      { id: "copy-href", label: "Copiar endereço do link" },
    ]);
  }
  if (target.kind === "local") {
    // O item perigoso (apagar) vai por último, separado.
    const own: MenuItem[] = target.items.map((item, i) => ({
      id: `local:${i}` as const,
      label: item.label,
      ...(item.shortcut ? { shortcut: item.shortcut } : {}),
      ...(item.danger ? { danger: true, separator: i > 0 && !target.items[i - 1]!.danger } : {}),
    }));
    return withGeneral(own, target.hasSelection);
  }
  return general(target.hasSelection);
}

/** Quem oferece ações no botão direito: o elemento da tela (ex.: a linha da tarefa) e a função que monta a lista. */
const providers = new WeakMap<Element, () => LocalItem[]>();

export function registerContextItems(el: Element, get: () => LocalItem[]): void {
  providers.set(el, get);
}

/** As ações do elemento mais próximo do clique que oferece alguma, ou null. */
export function localItemsAt(el: Element | null): LocalItem[] | null {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const get = providers.get(node);
    if (get) {
      const items = get();
      if (items.length > 0) return items;
    }
  }
  return null;
}

/** Menu nativo continua onde ele é o certo: campos de texto e o editor (recortar, colar, ortografia). */
export function keepsNativeMenu(el: Element): boolean {
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

/** Posição do menu dentro da janela: abre para o lado oposto quando falta espaço. */
export function placeMenu(x: number, y: number, width: number, height: number, viewportW: number, viewportH: number, margin = 8): { left: number; top: number } {
  const left = x + width + margin > viewportW ? Math.max(margin, x - width) : x;
  const top = y + height + margin > viewportH ? Math.max(margin, viewportH - height - margin) : y;
  return { left, top };
}
