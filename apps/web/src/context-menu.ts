/** Onde o botão direito foi clicado, e o que o app oferece ali. */
export type ContextTarget =
  | { kind: "page"; id: string; favorite: boolean }
  | { kind: "link"; href: string; internal: boolean }
  | { kind: "none"; hasSelection: boolean };

export type MenuAction = "open" | "new-child" | "favorite" | "copy-link" | "delete" | "open-link" | "copy-href" | "copy-text" | "new-page" | "capture" | "search" | "chat" | "theme";

export interface MenuItem {
  id: MenuAction;
  label: string;
  shortcut?: string;
  danger?: boolean;
  /** Linha separadora antes deste item. */
  separator?: boolean;
}

export function menuFor(target: ContextTarget): MenuItem[] {
  if (target.kind === "page") {
    return [
      { id: "open", label: "Abrir" },
      { id: "new-child", label: "Nova subpágina" },
      { id: "favorite", label: target.favorite ? "Remover das favoritas" : "Adicionar às favoritas" },
      { id: "copy-link", label: "Copiar link da página" },
      { id: "delete", label: "Mover para a lixeira", danger: true, separator: true },
    ];
  }
  if (target.kind === "link") {
    return [
      { id: "open-link", label: target.internal ? "Abrir" : "Abrir em nova aba" },
      { id: "copy-href", label: "Copiar endereço do link" },
    ];
  }
  return [
    ...(target.hasSelection ? [{ id: "copy-text" as const, label: "Copiar", shortcut: "⌘C" }] : []),
    { id: "new-page", label: "Nova página", ...(target.hasSelection ? { separator: true } : {}) },
    { id: "capture", label: "Capturar", shortcut: "⌘⇧K" },
    { id: "search", label: "Buscar", shortcut: "⌘K" },
    { id: "chat", label: "Assistentes", shortcut: "⌘J" },
    { id: "theme", label: "Alternar tema", separator: true },
  ];
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
