import { Icon, isIconName } from "./icons";
import { NAV_FOOTER, NAV_HERMES, NAV_MAIN, routeHash, type NavItem, type RouteId } from "./nav";

interface SidebarProps {
  current: RouteId;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
  inDrawer?: boolean;
}

function NavLink({ item, current, onNavigate }: { item: NavItem; current: RouteId; onNavigate?: () => void }) {
  const selected = item.id === current;
  return (
    <a
      className={`tr${selected ? " s" : ""}`}
      href={routeHash(item.id)}
      aria-current={selected ? "page" : undefined}
      onClick={onNavigate}
    >
      {isIconName(item.icon) && <Icon name={item.icon} />}
      <span className="lab">{item.label}</span>
      {item.shortcut && <span className="k">{item.shortcut}</span>}
    </a>
  );
}

export function Sidebar({ current, collapsed, onToggleCollapsed, onNavigate, inDrawer }: SidebarProps) {
  return (
    <nav className={`side${collapsed && !inDrawer ? " min" : ""}`} aria-label="Navegação principal">
      <div className="row" style={{ height: 48, padding: "0 8px 0 12px", flex: "none", borderBottom: "1px solid var(--border)" }}>
        <span className="av u" style={{ width: 24, height: 24 }}>
          a
        </span>
        <span className="lab" style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>
          asa-notation
        </span>
        {!inDrawer && (
          <button
            className="btn btn-fan btn-ico btn-sm"
            type="button"
            aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            onClick={onToggleCollapsed}
          >
            <Icon name="panel" />
          </button>
        )}
      </div>
      <div className="side-in">
        {NAV_MAIN.map((item) => (
          <NavLink key={item.id} item={item} current={current} onNavigate={onNavigate} />
        ))}
        <div className="sgroup">
          <span>Hermes</span>
        </div>
        {NAV_HERMES.map((item) => (
          <NavLink key={item.id} item={item} current={current} onNavigate={onNavigate} />
        ))}
      </div>
      <div style={{ flex: "none", padding: 8, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 1 }}>
        {NAV_FOOTER.map((item) => (
          <NavLink key={item.id} item={item} current={current} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}
