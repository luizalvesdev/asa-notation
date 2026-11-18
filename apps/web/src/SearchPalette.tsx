import { useEffect, useId, useMemo, useRef, useState } from "react";
import { pagesApi } from "./api";
import { Icon } from "./icons";
import { displayTitle } from "./pages-tree";
import type { SearchHit, TreeNode } from "./pages-types";
import { splitSnippet } from "./search-utils";

interface SearchPaletteProps {
  nodes: TreeNode[];
  onClose: () => void;
  onOpenPage: (id: string) => void;
  onCreatePage: (title: string) => void;
  onOpenTrash: () => void;
}

type Row =
  | { key: string; kind: "page"; id: string; title: string; icon: string | null }
  | { key: string; kind: "content"; id: string; title: string; icon: string | null; snippet: string }
  | { key: string; kind: "action"; label: string; run: () => void };

type Status = "ocioso" | "carregando" | "pronto" | "erro";

const DEBOUNCE_MS = 150;
const RECENT_LIMIT = 8;

export function SearchPalette({ nodes, onClose, onOpenPage, onCreatePage, onOpenTrash }: SearchPaletteProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<Status>("ocioso");
  const [selected, setSelected] = useState(0);
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const q = query.trim();

  useEffect(() => {
    if (q === "") {
      setHits([]);
      setStatus("ocioso");
      return;
    }
    let live = true;
    setStatus("carregando");
    const timer = setTimeout(() => {
      pagesApi
        .search(q)
        .then((result) => {
          if (!live) return;
          setHits(result);
          setStatus("pronto");
        })
        .catch(() => live && setStatus("erro"));
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  const { rows, groups } = useMemo(() => {
    const pages: Row[] = [];
    const contents: Row[] = [];
    if (q === "") {
      for (const node of nodes.slice(0, RECENT_LIMIT)) pages.push({ key: `p:${node.id}`, kind: "page", id: node.id, title: node.title, icon: node.icon });
    } else {
      for (const hit of hits) {
        if (hit.matchIn === "title") pages.push({ key: `p:${hit.id}`, kind: "page", id: hit.id, title: hit.title, icon: hit.icon });
        else contents.push({ key: `c:${hit.id}`, kind: "content", id: hit.id, title: hit.title, icon: hit.icon, snippet: hit.snippet });
      }
    }
    const actions: Row[] =
      q === ""
        ? [
            { key: "a:new", kind: "action", label: "Nova página", run: () => onCreatePage("") },
            { key: "a:trash", kind: "action", label: "Abrir a Lixeira", run: onOpenTrash },
          ]
        : [{ key: "a:new", kind: "action", label: `Criar página “${q}”`, run: () => onCreatePage(q) }];
    const groups = [
      { name: "Páginas", rows: pages },
      { name: "Conteúdo", rows: contents },
      { name: "Ações", rows: actions },
    ].filter((g) => g.rows.length > 0);
    return { rows: groups.flatMap((g) => g.rows), groups };
  }, [q, hits, nodes, onCreatePage, onOpenTrash]);

  useEffect(() => {
    setSelected(0);
  }, [q]);

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected, rows]);

  const run = (row: Row) => {
    if (row.kind === "action") row.run();
    else onOpenPage(row.id);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" && rows.length > 0) {
      event.preventDefault();
      setSelected((s) => (s + 1) % rows.length);
    } else if (event.key === "ArrowUp" && rows.length > 0) {
      event.preventDefault();
      setSelected((s) => (s - 1 + rows.length) % rows.length);
    } else if (event.key === "Enter") {
      const row = rows[selected];
      if (row) {
        event.preventDefault();
        run(row);
      }
    }
  };

  const noResults = q !== "" && status === "pronto" && hits.length === 0;
  const activeId = rows[selected] ? `${listId}-${selected}` : undefined;

  let index = -1;
  return (
    <div className="overlay busca-ov" style={{ paddingTop: "10vh" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Busca e comandos" style={{ width: 640 }} onKeyDown={onKeyDown}>
        <div className="pal-in">
          <Icon name="search" large />
          <label htmlFor={`${listId}-q`} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            Buscar
          </label>
          <input
            id={`${listId}-q`}
            className="plain grow1"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId}
            autoComplete="off"
            placeholder="Buscar páginas, conteúdo e ações…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ fontSize: 16, outline: "none", cursor: "text" }}
          />
          <span className="kbd">esc</span>
        </div>

        <div ref={list} id={listId} role="listbox" aria-label="Resultados" style={{ padding: 6, maxHeight: "52vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
          {status === "carregando" && hits.length === 0 && q !== "" && (
            <div className="col" style={{ gap: 8, padding: "8px 10px" }} aria-label="Buscando">
              <span className="sk" style={{ height: 14, width: "70%" }} />
              <span className="sk" style={{ height: 14, width: "50%" }} />
            </div>
          )}
          {status === "erro" && <div className="mrow dis" role="status">Não foi possível buscar agora.</div>}
          {noResults && (
            <div className="mrow dis" role="status">
              Nada encontrado para “{q}”
            </div>
          )}
          {groups.map((group) => (
            <div key={group.name} style={{ display: "contents" }}>
              <div className="mgroup">{group.name}</div>
              {group.rows.map((row) => {
                index += 1;
                const selectedRow = index === selected;
                const myIndex = index;
                return (
                  <button
                    key={row.key}
                    id={`${listId}-${myIndex}`}
                    type="button"
                    role="option"
                    aria-selected={selectedRow}
                    className={`plain pal-row${selectedRow ? " sel" : ""}`}
                    style={{ height: "auto", minHeight: 40, padding: "6px 10px", width: "100%" }}
                    onMouseEnter={() => setSelected(myIndex)}
                    onClick={() => run(row)}
                  >
                    {row.kind === "action" ? (
                      <Icon name="chevron" />
                    ) : row.icon ? (
                      <span className="page-emoji" aria-hidden="true">{row.icon}</span>
                    ) : (
                      <Icon name="doc" />
                    )}
                    <span className="col grow1" style={{ gap: 2, alignItems: "flex-start", minWidth: 0 }}>
                      <span className="trunc" style={{ maxWidth: "100%" }}>{row.kind === "action" ? row.label : displayTitle(row.title)}</span>
                      {row.kind === "content" && (
                        <span className="subtle trunc" style={{ fontSize: 12, maxWidth: "100%" }}>
                          …
                          {splitSnippet(row.snippet).map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
                          …
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="row" style={{ gap: 16, padding: "8px 14px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-3)" }}>
          <span className="row" style={{ gap: 4 }}>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> navegar
          </span>
          <span className="row" style={{ gap: 4 }}>
            <span className="kbd">↵</span> abrir
          </span>
        </div>
      </div>
    </div>
  );
}
