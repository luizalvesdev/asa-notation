import { Icon, isIconName } from "./icons";
import { NAV_FOOTER, NAV_HERMES, NAV_MAIN, goKey, navParent, routeHash, type NavItem, type Route, type RouteId } from "./nav";
import { NewMenu } from "./NewMenu";
import { PageTree } from "./PageTree";
import { displayTitle, type CustomSection, type TreeItem } from "./pages-tree";
import type { LocalItem } from "./context-menu";
import { useContextItems } from "./use-context-items";
import type { ReactNode } from "react";
import type { TreeNode } from "./pages-types";
import { pageHash } from "./nav";

interface SidebarProps {
  route: Route;
  tree: TreeItem[];
  /** Raízes da seção Minha Carreira (os filhos da página-contêiner). */
  careerTree: TreeItem[];
  onCreateCareerPage: () => void;
  /** Seções criadas pelo usuário, abaixo de Minha Carreira. */
  customSections: CustomSection[];
  onRenameSection: (id: string) => void;
  onDeleteSection: (id: string) => void;
  /** Seções recolhidas ("pages", "career" ou o id da seção do usuário). */
  closedSections: ReadonlySet<string>;
  onToggleSection: (id: string) => void;
  treeStatus: "carregando" | "pronto" | "erro";
  expanded: ReadonlySet<string>;
  onToggleExpanded: (id: string) => void;
  onCreatePage: (parentId: string | null) => void;
  /** Cria uma página na raiz já com título, modelo ou como database. */
  onCreateFrom: (extra: { title?: string; body?: unknown; icon?: string; kind?: "page" | "database" | "canvas" }) => void;
  onRetryTree: () => void;
  onOpenSearch: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
  inDrawer?: boolean;
  /** Páginas favoritas, em atalhos no topo da árvore. */
  favorites: TreeNode[];
  /** Contadores ao lado de itens da barra (ex.: notificações não lidas). */
  badges?: Partial<Record<RouteId, number>>;
}

function NavLink({ item, route, onNavigate, onOpenSearch, badge }: { item: NavItem; route: Route; onNavigate?: () => void; onOpenSearch: () => void; badge?: number }) {
  const selected = route.kind === "tela" && item.id === navParent(route.id);
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
      title={goKey(item.id) ? `${item.label} (G e depois ${goKey(item.id)!.toUpperCase()})` : undefined}
      aria-current={selected ? "page" : undefined}
      onClick={onNavigate}
    >
      {isIconName(item.icon) && <Icon name={item.icon} />}
      <span className="lab">{item.label}</span>
      {item.shortcut && <span className="k">{item.shortcut}</span>}
      {goKey(item.id) && <span className="k go-k" aria-hidden="true">G {goKey(item.id)!.toUpperCase()}</span>}
      {badge !== undefined && badge > 0 && (
        <span className="badge ac lab" style={{ height: 18, padding: "0 6px", fontSize: "calc(11px * var(--fs, 1))" }} aria-label={`${badge} não lidas`}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </a>
  );
}

function ShortcutLink({ node, current, onNavigate }: { node: TreeNode; current: string | null; onNavigate?: () => void }) {
  const selected = node.id === current;
  return (
    <a className={`tr${selected ? " s" : ""}`} href={pageHash(node.id)} data-page-id={node.id} aria-current={selected ? "page" : undefined} onClick={onNavigate}>
      {node.icon ? <span className="page-emoji" aria-hidden="true">{node.icon}</span> : <Icon name={node.kind === "database" ? "table" : node.kind === "canvas" ? "canvas" : "doc"} />}
      <span className="lab">{displayTitle(node.title)}</span>
    </a>
  );
}

/**
 * Uma seção da barra lateral: clicar no nome recolhe ou mostra as páginas dela (com animação).
 * `menu` são as ações próprias do botão direito no cabeçalho.
 */
function SidebarSection({ id, title, closed, onToggle, actions, menu, children, alwaysOpen }: {
  id: string;
  /** Barra recolhida (só ícones): os nomes das seções somem, então as páginas ficam sempre à mostra. */
  alwaysOpen?: boolean;
  title: string;
  closed: ReadonlySet<string>;
  onToggle: (id: string) => void;
  actions?: ReactNode;
  menu?: () => LocalItem[];
  children: ReactNode;
}) {
  const open = alwaysOpen || !closed.has(id);
  const menuRef = useContextItems(() => menu?.() ?? []);
  return (
    <>
      <div className="sgroup" ref={menuRef}>
        <button className="plain sgroup-btn" type="button" aria-expanded={open} title={open ? `Recolher ${title}` : `Mostrar ${title}`} onClick={() => onToggle(id)}>
          <span>{title}</span>
          <svg className={`chev${open ? " on" : ""}`} viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        {actions && <span className="row" style={{ gap: 0, flex: "none" }}>{actions}</span>}
      </div>
      <div className={`sec-body${open ? " on" : ""}`} inert={!open} aria-hidden={!open || undefined}>
        <div>{children}</div>
      </div>
    </>
  );
}

export function Sidebar({ route, tree, careerTree, onCreateCareerPage, customSections, onRenameSection, onDeleteSection, closedSections, onToggleSection, treeStatus, expanded, onToggleExpanded, onCreatePage, onCreateFrom, onRetryTree, onOpenSearch, collapsed, onToggleCollapsed, onNavigate, inDrawer, badges, favorites }: SidebarProps) {
  const currentPageId = route.kind === "pagina" ? route.pageId : null;
  const mini = collapsed && !inDrawer;
  return (
    <nav className={`side${collapsed && !inDrawer ? " min" : ""}`} aria-label="Navegação principal">
      <div className="row" style={{ height: 48, padding: "0 8px 0 12px", flex: "none", borderBottom: "1px solid var(--border)" }}>
        <span className="av u" style={{ width: 24, height: 24 }}>
          a
        </span>
        <span className="lab" style={{ fontWeight: 600, fontSize: "calc(13px * var(--fs, 1))", flex: 1 }}>
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
        {favorites.length > 0 && (
          <>
            <div className="sgroup"><span>Favoritas</span></div>
            {favorites.map((n) => <ShortcutLink key={n.id} node={n} current={currentPageId} onNavigate={onNavigate} />)}
          </>
        )}
        <SidebarSection alwaysOpen={mini} id="pages" title="Páginas" closed={closedSections} onToggle={onToggleSection} actions={
          <>
            <NewMenu onCreate={(extra) => { onNavigate?.(); onCreateFrom(extra); }} />
            <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Nova página" onClick={() => onCreatePage(null)} style={{ width: 22, height: 22 }}>
              <Icon name="plus" />
            </button>
          </>
        }>
          {treeStatus === "carregando" && tree.length === 0 && (
            <div className="col" style={{ gap: 6, padding: "4px 8px" }} aria-label="Carregando páginas">
              <span className="sk" style={{ height: 14, width: "70%" }} />
              <span className="sk" style={{ height: 14, width: "55%" }} />
              <span className="sk" style={{ height: 14, width: "62%" }} />
            </div>
          )}
          {treeStatus === "erro" && (
            <div className="col" style={{ gap: 6, padding: "4px 8px", fontSize: "calc(12px * var(--fs, 1))" }}>
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
        </SidebarSection>
        <SidebarSection alwaysOpen={mini} id="career" title="Minha Carreira" closed={closedSections} onToggle={onToggleSection} actions={
          <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Nova página em Minha Carreira" onClick={() => { onNavigate?.(); onCreateCareerPage(); }} style={{ width: 22, height: 22 }}>
            <Icon name="plus" />
          </button>
        }>
          {treeStatus === "pronto" && careerTree.length === 0 && (
            <button className="plain tr" type="button" onClick={() => { onNavigate?.(); onCreateCareerPage(); }}>
              <Icon name="plus" />
              <span className="lab">Cursos, documentos e artigos</span>
            </button>
          )}
          <PageTree items={careerTree} currentId={currentPageId} expanded={expanded} onToggle={onToggleExpanded} onCreateChild={onCreatePage} onNavigate={onNavigate} />
        </SidebarSection>
        {customSections.map((section) => (
          <SidebarSection
            key={section.id}
            alwaysOpen={mini}
            id={section.id}
            title={displayTitle(section.title)}
            closed={closedSections}
            onToggle={onToggleSection}
            menu={() => [
              { label: "Nova página na seção", run: () => { onNavigate?.(); onCreatePage(section.id); } },
              { label: "Renomear seção", run: () => onRenameSection(section.id) },
              { label: "Excluir seção", danger: true, run: () => onDeleteSection(section.id) },
            ]}
            actions={
              <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label={`Nova página em ${displayTitle(section.title)}`} onClick={() => { onNavigate?.(); onCreatePage(section.id); }} style={{ width: 22, height: 22 }}>
                <Icon name="plus" />
              </button>
            }
          >
            {section.items.length === 0 && (
              <button className="plain tr" type="button" onClick={() => { onNavigate?.(); onCreatePage(section.id); }}>
                <Icon name="plus" />
                <span className="lab">Nova página</span>
              </button>
            )}
            <PageTree items={section.items} currentId={currentPageId} expanded={expanded} onToggle={onToggleExpanded} onCreateChild={onCreatePage} onNavigate={onNavigate} />
          </SidebarSection>
        ))}
      </div>
      <div style={{ flex: "none", padding: 8, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 1 }}>
        {NAV_FOOTER.map((item) => (
          <NavLink key={item.id} item={item} route={route} onNavigate={onNavigate} onOpenSearch={onOpenSearch} badge={badges?.[item.id]} />
        ))}
      </div>
    </nav>
  );
}
