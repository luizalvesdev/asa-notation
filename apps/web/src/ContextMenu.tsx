import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { menuFor, placeMenu, type ContextTarget, type MenuAction } from "./context-menu";

export interface OpenMenu {
  x: number;
  y: number;
  target: ContextTarget;
}

interface ContextMenuProps {
  menu: OpenMenu;
  dark: boolean;
  onAction: (action: MenuAction, target: ContextTarget) => void;
  onClose: () => void;
}

/** Menu do botão direito, só com ações do app. Teclado: setas, Enter, Esc. */
export function ContextMenu({ menu, dark, onAction, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(0);
  const items = menuFor(menu.target);

  useLayoutEffect(() => {
    const box = ref.current;
    if (box) setPos(placeMenu(menu.x, menu.y, box.offsetWidth, box.offsetHeight, window.innerWidth, window.innerHeight));
  }, [menu]);

  useEffect(() => {
    ref.current?.focus();
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const close = () => onClose();
    const key = (e: KeyboardEvent) => {
      // Fechando (animação de saída): não responde mais ao teclado.
      if (ref.current?.closest(".leaving")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[active];
        if (item) onAction(item.id, menu.target);
      }
    };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, active, menu]);

  return (
    <div className={`ds${dark ? " escuro" : ""}`} style={{ position: "fixed", inset: 0, zIndex: 95, background: "transparent", pointerEvents: "none" }}>
      <div
        ref={ref}
        className="menu on"
        role="menu"
        tabIndex={-1}
        aria-label="Ações"
        onContextMenu={(e) => e.preventDefault()}
        style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, minWidth: 220, pointerEvents: "auto", visibility: pos ? "visible" : "hidden", outline: "none", boxShadow: "var(--e2)" }}
      >
        {items.map((item, i) => (
          <div key={item.id} style={{ display: "contents" }}>
            {item.separator && <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} role="separator" />}
            <button
              className={`plain mrow${i === active ? " sel" : ""}`}
              type="button"
              role="menuitem"
              onMouseEnter={() => setActive(i)}
              onClick={() => onAction(item.id, menu.target)}
              style={item.danger ? { color: "var(--danger)" } : undefined}
            >
              <span className="grow1" style={{ textAlign: "left" }}>{item.label}</span>
              {item.shortcut && <span className="k">{item.shortcut}</span>}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
