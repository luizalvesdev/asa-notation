import { Icon } from "./icons";
import { DEMO } from "./demo-flag";
import { routeHash, type Route } from "./nav";

interface BottomNavProps {
  route: Route;
  onCapture: () => void;
  onMenu: () => void;
}

/** Navegação do celular (só aparece em telas estreitas, por CSS). */
export function BottomNav({ route, onCapture, onMenu }: BottomNavProps) {
  const id = route.kind === "tela" ? route.id : null;
  const link = (target: "hoje" | "inbox" | "estudo" | "agente", label: string, icon: "today" | "inbox" | "study" | "kanban") => (
    <a className={`bn${id === target ? " on" : ""}`} href={routeHash(target)} aria-current={id === target ? "page" : undefined}>
      <Icon name={icon} large />
      {label}
    </a>
  );
  return (
    <nav className="bnav" aria-label="Navegação inferior">
      {link("hoje", "Hoje", "today")}
      {link("inbox", "Inbox", "inbox")}
      {!DEMO && link("agente", "Trabalho", "kanban")}
      <button className="bn" type="button" onClick={onCapture} aria-label="Captura rápida">
        <span style={{ width: 52, height: 40, borderRadius: 14, background: "var(--accent)", color: "var(--on-accent)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--e1)" }}>
          <Icon name="plus" large />
        </span>
      </button>
      {link("estudo", "Estudo", "study")}
      <button className="bn" type="button" onClick={onMenu}>
        <Icon name="menu" large />
        Páginas
      </button>
    </nav>
  );
}
