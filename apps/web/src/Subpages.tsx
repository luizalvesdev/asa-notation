import { Icon } from "./icons";
import { pageHash } from "./nav";
import { displayTitle } from "./pages-tree";
import type { TreeNode } from "./pages-types";

/** As páginas dentro desta, na ordem da árvore: a página funciona como pasta (ex.: Leituras). */
export function childPages(nodes: readonly TreeNode[], pageId: string): TreeNode[] {
  return nodes.filter((n) => n.parentId === pageId).sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

/**
 * `side`: coluna à direita do texto (telas largas), que acompanha a rolagem e para no topo da tela;
 * `top` é a altura do título dentro da página, onde a coluna começa. Sem `side`, embaixo do texto (telas estreitas).
 */
export function Subpages({ pageId, nodes, side = false, top = 0 }: { pageId: string; nodes: readonly TreeNode[]; side?: boolean; top?: number }) {
  const children = childPages(nodes, pageId);
  if (children.length === 0) return null;
  const list = (
    <section className={side ? "subpages-side" : "page-foot subpages-foot"} aria-label="Páginas dentro desta" style={side ? { marginTop: top } : undefined}>
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
  return side ? <div className="subpages-rail">{list}</div> : list;
}
