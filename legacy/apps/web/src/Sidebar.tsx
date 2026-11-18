import type { SearchHit } from "@asa/core";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { buildTree, type TreeItem } from "./tree.js";
import type { TreeNode } from "@asa/core";

interface Props {
  nodes: TreeNode[];
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onCreate: (parentId: string | null) => void;
  onCreateDatabase: () => void;
  onDelete: (id: string) => void;
  onLogout: () => void;
  passwordLabel: string;
  onPassword: () => void;
}

export function Sidebar({ nodes, selectedId, expanded, onToggle, onSelect, onCreate, onCreateDatabase, onDelete, onLogout, passwordLabel, onPassword }: Props) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  useEffect(() => {
    const text = query.trim();
    if (text === "") {
      setHits(null);
      return;
    }
    const timer = window.setTimeout(() => {
      api.search(text).then(
        (res) => setHits(res.hits),
        () => setHits([]),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const row = (item: TreeItem, depth: number) => {
    const isOpen = expanded.has(item.id);
    const hasChildren = item.children.length > 0;
    return (
      <li key={item.id}>
        <div
          className={`row${item.id === selectedId ? " selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <button
            className="icon toggle"
            aria-label={isOpen ? "Recolher" : "Expandir"}
            style={{ visibility: hasChildren ? "visible" : "hidden" }}
            onClick={() => onToggle(item.id)}
          >
            {isOpen ? "▾" : "▸"}
          </button>
          <button className="title" onClick={() => onSelect(item.id)}>
            {item.kind === "database" && <span className="kind-icon" aria-label="Database">▦</span>}
            {item.title || "Sem título"}
          </button>
          <span className="actions">
            <button className="icon" aria-label="Nova subpágina" title="Nova subpágina" onClick={() => onCreate(item.id)}>
              +
            </button>
            <button className="icon" aria-label="Apagar" title="Apagar" onClick={() => onDelete(item.id)}>
              ×
            </button>
          </span>
        </div>
        {hasChildren && isOpen && <ul>{item.children.map((child) => row(child, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <input
          type="search"
          placeholder="Buscar"
          aria-label="Buscar"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <nav className="tree" aria-label="Páginas">
        {hits !== null ? (
          <ul>
            {hits.length === 0 && <li className="empty">Nada encontrado</li>}
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  className="hit"
                  onClick={() => {
                    onSelect(hit.id);
                    setQuery("");
                  }}
                >
                  <span className="hit-title">{hit.title || "Sem título"}</span>
                  {hit.snippet && <span className="hit-snippet">{hit.snippet}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul>{tree.map((item) => row(item, 0))}</ul>
        )}
      </nav>
      <div className="sidebar-foot">
        <button className="ghost" onClick={() => onCreate(null)}>
          + Nova página
        </button>
        <button className="ghost" onClick={onCreateDatabase}>
          + Novo database
        </button>
        <button className="ghost" onClick={onPassword}>
          {passwordLabel}
        </button>
        <button className="ghost" onClick={onLogout}>
          Sair
        </button>
      </div>
    </aside>
  );
}
