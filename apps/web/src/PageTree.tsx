import { Icon } from "./icons";
import { pageHash } from "./nav";
import { displayTitle, type TreeItem } from "./pages-tree";

interface PageTreeProps {
  items: TreeItem[];
  currentId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onNavigate?: () => void;
  depth?: number;
}

export function PageTree({ items, currentId, expanded, onToggle, onCreateChild, onNavigate, depth = 0 }: PageTreeProps) {
  return (
    <>
      {items.map((item) => {
        const open = expanded.has(item.id);
        const hasKids = item.children.length > 0;
        const selected = item.id === currentId;
        return (
          <div key={item.id} className="col">
            <div className={`tr page-row${selected ? " s" : ""}`} data-page-id={item.id} style={{ paddingLeft: 4 + depth * 14 }}>
              <button
                className="plain chev-btn"
                type="button"
                aria-label={open ? "Recolher" : "Expandir"}
                aria-expanded={hasKids ? open : undefined}
                onClick={() => onToggle(item.id)}
                style={{ visibility: hasKids ? "visible" : "hidden" }}
              >
                <svg className={`chev${open ? " on" : ""}`} viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
              <a className="page-link" href={pageHash(item.id)} aria-current={selected ? "page" : undefined} onClick={onNavigate}>
                {item.icon ? <span className="page-emoji" aria-hidden="true">{item.icon}</span> : <Icon name={item.kind === "database" ? "table" : item.kind === "canvas" ? "canvas" : "doc"} />}
                <span className="lab">{displayTitle(item.title)}</span>
              </a>
              <button className="btn btn-fan btn-ico btn-sm add" type="button" aria-label={`Nova subpágina em ${displayTitle(item.title)}`} onClick={() => onCreateChild(item.id)}>
                <Icon name="plus" />
              </button>
            </div>
            {hasKids && (
              <div className={`kids${open ? " on" : ""}`}>
                <div>
                  <PageTree
                    items={item.children}
                    currentId={currentId}
                    expanded={expanded}
                    onToggle={onToggle}
                    onCreateChild={onCreateChild}
                    onNavigate={onNavigate}
                    depth={depth + 1}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
