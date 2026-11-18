import { Icon, isIconName } from "./icons";
import { NAV_FOOTER, NAV_HERMES, NAV_MAIN, routeHash, type NavItem, type Route } from "./nav";
import { PageTree } from "./PageTree";
import type { TreeItem } from "./pages-tree";

interface SidebarProps {
  route: Route;
  tree: TreeItem[];
  treeStatus: "carregando" | "pronto" | "erro";
  expanded: ReadonlySet<string>;
  onToggleExpanded: (id: string) => void;
  onCreatePage: (parentId: string | null) => void;
  onRetryTree: () => void;
  onOpenSearch: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
  inDrawer?: boolean;
}

function NavLink({ item, route, onNavigate, onOpenSearch }: { item: NavItem; route: Route; onNavigate?: () => void; onOpenSearch: () => void }) {
  const selected = route.kind === "tela" && item.id === route.id;
  if (item.id === "busca") {
    return (
      <button
        className="plain tr"
        type="button"
        onClick={() => {
          onNavigate?.();
          onOpenSearch();
        }}
      >
        {isIconName(item.icon) && <Icon name={item.icon} />}
        <span className="lab">{item.label}</span>
        {item.shortcut && <span className="k">{item.shortcut}</span>}
      </button>
    );
  }
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

export function Sidebar({ route, tree, treeStatus, expanded, onToggleExpanded, onCreatePage, onRetryTree, onOpenSearch, collapsed, onToggleCollapsed, onNavigate, inDrawer }: SidebarProps) {
  const currentPageId = route.kind === "pagina" ? route.pageId : null;
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
          <NavLink key={item.id} item={item} route={route} onNavigate={onNavigate} onOpenSearch={onOpenSearch} />
        ))}
        <div className="sgroup">
          <span>Hermes</span>
        </div>
        {NAV_HERMES.map((item) => (
          <NavLink key={item.id} item={item} route={route} onNavigate={onNavigate} onOpenSearch={onOpenSearch} />
        ))}
        <div className="sgroup">
          <span>Páginas</span>
          <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Nova página" onClick={() => onCreatePage(null)} style={{ width: 22, height: 22 }}>
            <Icon name="plus" />
          </button>
        </div>
        {treeStatus === "carregando" && tree.length === 0 && (
          <div className="col" style={{ gap: 6, padding: "4px 8px" }} aria-label="Carregando páginas">
            <span className="sk" style={{ height: 14, width: "70%" }} />
            <span className="sk" style={{ height: 14, width: "55%" }} />
            <span className="sk" style={{ height: 14, width: "62%" }} />
          </div>
        )}
        {treeStatus === "erro" && (
          <div className="col" style={{ gap: 6, padding: "4px 8px", fontSize: 12 }}>
            <span className="muted">Não foi possível carregar as páginas.</span>
            <button className="btn btn-sec btn-sm" type="button" onClick={onRetryTree} style={{ alignSelf: "flex-start" }}>
              Tentar de novo
            </button>
          </div>
        )}
        {treeStatus === "pronto" && tree.length === 0 && (
          <button className="plain tr" type="button" onClick={() => onCreatePage(null)}>
            <Icon name="plus" />
            <span className="lab">Criar a primeira página</span>
          </button>
        )}
        <PageTree items={tree} currentId={currentPageId} expanded={expanded} onToggle={onToggleExpanded} onCreateChild={onCreatePage} onNavigate={onNavigate} />
      </div>
      <div style={{ flex: "none", padding: 8, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 1 }}>
        {NAV_FOOTER.map((item) => (
          <NavLink key={item.id} item={item} route={route} onNavigate={onNavigate} onOpenSearch={onOpenSearch} />
        ))}
      </div>
    </nav>
  );
}
