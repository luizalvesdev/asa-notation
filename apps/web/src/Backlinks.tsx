import { useEffect, useState } from "react";
import { pagesApi } from "./api";
import { pageHash } from "./nav";
import { displayTitle } from "./pages-tree";

/** Páginas que citam esta com [[Título]]. */
export function Backlinks({ pageId }: { pageId: string }) {
  const [pages, setPages] = useState<{ id: string; title: string; icon: string | null }[] | null>(null);

  useEffect(() => {
    let live = true;
    pagesApi
      .backlinks(pageId)
      .then((p) => live && setPages(p))
      .catch(() => live && setPages([]));
    return () => {
      live = false;
    };
  }, [pageId]);

  if (!pages || pages.length === 0) return null;
  return (
    <section className="page-foot" aria-label="Backlinks">
      <span className="eyebrow">Citada em {pages.length} {pages.length === 1 ? "página" : "páginas"}</span>
      {pages.map((p) => (
        <a key={p.id} className="mention" href={pageHash(p.id)} style={{ alignSelf: "flex-start" }}>
          <span>{p.icon ?? "·"}</span>
          {displayTitle(p.title)}
        </a>
      ))}
    </section>
  );
}
