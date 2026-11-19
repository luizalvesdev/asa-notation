import { Icon } from "./icons";
import { pageHash } from "./nav";
import { displayTitle } from "./pages-tree";
import type { TreeNode } from "./pages-types";

/** As páginas dentro desta, na ordem da árvore: a página funciona como pasta (ex.: Leituras). */
export function childPages(nodes: readonly TreeNode[], pageId: string): TreeNode[] {
  return nodes.filter((n) => n.parentId === pageId).sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

export function Subpages({ pageId, nodes }: { pageId: string; nodes: readonly TreeNode[] }) {
  const children = childPages(nodes, pageId);
  if (children.length === 0) return null;
  return (
    <section className="page-foot" aria-label="Páginas dentro desta">
      <span className="eyebrow">
        {children.length} {children.length === 1 ? "página" : "páginas"} dentro
      </span>
      {children.map((p) => (
        <a key={p.id} className="tr subpage" href={pageHash(p.id)}>
          {p.icon ? <span className="page-emoji" aria-hidden="true">{p.icon}</span> : <Icon name={p.kind === "database" ? "table" : p.kind === "canvas" ? "canvas" : "doc"} />}
          <span className="lab">{displayTitle(p.title)}</span>
        </a>
      ))}
    </section>
  );
}
