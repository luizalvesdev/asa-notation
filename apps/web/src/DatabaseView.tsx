import type { DatabaseProps, DatabaseRow, Page, ViewDef } from "@asa/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type PageDraft } from "./api.js";
import { addProperty, addView, asDatabaseProps, keyAfterAll, removeView, setKanbanGroup } from "./db-model.js";
import { KanbanView } from "./KanbanView.js";
import { TableView } from "./TableView.js";

interface Props {
  page: Page;
  seq: number | null;
  remoteRev: number | undefined;
  onSaved: (page: Page) => void;
  onOpenRow: (id: string) => void;
}

const viewKey = (id: string) => `asa.view.${id}`;

function readView(id: string): string | null {
  try {
    return window.localStorage.getItem(viewKey(id));
  } catch {
    return null;
  }
}

function toRow(page: Page): DatabaseRow {
  const { id, title, props, sortKey, rev, createdAt, updatedAt } = page;
  return { id, title, props, sortKey, rev, createdAt, updatedAt };
}

export function DatabaseView({ page, seq, remoteRev, onSaved, onOpenRow }: Props) {
  const [database, setDatabase] = useState(page);
  const [title, setTitle] = useState(page.title);
  const [rows, setRows] = useState<DatabaseRow[] | null>(null);
  const [activeView, setActiveView] = useState<string | null>(() => readView(page.id));
  const [notice, setNotice] = useState<string | null>(null);

  const props = useMemo(() => asDatabaseProps(database.props), [database.props]);
  const view: ViewDef = props.views.find((v) => v.id === activeView) ?? props.views[0]!;

  const loadRows = useCallback(async () => {
    try {
      const loaded = (await api.rows(page.id)).rows;
      for (const row of loaded) rememberRev(row.id, row.rev);
      setRows(loaded);
    } catch {
      setNotice("Não foi possível carregar as linhas.");
    }
  }, [page.id]);

  useEffect(() => {
    void loadRows();
  }, [loadRows, seq]);

  useEffect(() => {
    if (remoteRev === undefined || remoteRev <= database.rev) return;
    api.getPage(page.id).then(
      (fresh) => {
        setDatabase(fresh);
        setTitle(fresh.title);
      },
      () => undefined,
    );
  }, [remoteRev, database.rev, page.id]);

  const selectView = (id: string) => {
    setActiveView(id);
    try {
      window.localStorage.setItem(viewKey(page.id), id);
    } catch {
      return;
    }
  };

  const saveDatabase = async (patch: PageDraft) => {
    try {
      const saved = await api.updatePage(database.id, database.rev, patch);
      setDatabase(saved);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const current = (err.body as { page?: Page } | null)?.page;
        if (current) {
          setDatabase(current);
          setTitle(current.title);
        }
        setNotice("O database mudou em outro lugar. Refaça a alteração.");
      } else {
        setNotice("Não foi possível salvar a alteração.");
      }
    }
  };

  const updateProps = (next: DatabaseProps) => void saveDatabase({ props: next as unknown as Record<string, unknown> });

  const latestRev = useRef(new Map<string, number>());
  const queues = useRef(new Map<string, { tail: Promise<void>; pending: number }>());

  const rememberRev = (id: string, rev: number) => {
    if (rev > (latestRev.current.get(id) ?? 0)) latestRev.current.set(id, rev);
  };

  const updateRow = (id: string, change: (row: DatabaseRow) => DatabaseRow) =>
    setRows((prev) => prev?.map((r) => (r.id === id ? change(r) : r)) ?? null);

  const patchRow = (row: DatabaseRow, patch: PageDraft, optimistic?: (row: DatabaseRow) => DatabaseRow) => {
    if (optimistic) updateRow(row.id, optimistic);
    const queue = queues.current.get(row.id) ?? { tail: Promise.resolve(), pending: 0 };
    queues.current.set(row.id, queue);
    queue.pending += 1;
    queue.tail = queue.tail.then(async () => {
      try {
        const saved = toRow(await api.updatePage(row.id, latestRev.current.get(row.id) ?? row.rev, patch));
        rememberRev(row.id, saved.rev);
        if (queue.pending === 1) updateRow(row.id, () => saved);
      } catch (err) {
        setNotice(
          err instanceof ApiError && err.status === 409
            ? "Esta linha mudou em outro lugar. Os dados foram recarregados."
            : "Não foi possível salvar a linha.",
        );
        await loadRows();
      } finally {
        queue.pending -= 1;
      }
    });
  };

  const addRow = async (initial: Record<string, unknown> = {}) => {
    try {
      const created = await api.createPage({ databaseId: page.id, sortKey: keyAfterAll(rows ?? []), props: initial });
      rememberRev(created.id, created.rev);
      setRows((prev) => [...(prev ?? []), toRow(created)]);
    } catch {
      setNotice("Não foi possível criar a linha.");
    }
  };

  const deleteRow = async (row: DatabaseRow) => {
    if (!window.confirm(`Apagar "${row.title || "Sem título"}"?`)) return;
    try {
      await api.deletePage(row.id);
      setRows((prev) => prev?.filter((r) => r.id !== row.id) ?? null);
    } catch {
      setNotice("Não foi possível apagar a linha.");
    }
  };

  return (
    <section className="database">
      {notice && (
        <div className="banner" role="alert">
          {notice} <button onClick={() => setNotice(null)}>Fechar</button>
        </div>
      )}
      <input
        className="page-title"
        aria-label="Título do database"
        placeholder="Sem título"
        value={title}
        maxLength={500}
        autoFocus={page.title === ""}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== database.title && void saveDatabase({ title })}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <nav className="view-tabs" aria-label="Views">
        {props.views.map((v) => (
          <span key={v.id} className={v.id === view.id ? "view-tab active" : "view-tab"}>
            <button type="button" onClick={() => selectView(v.id)}>
              {v.type === "table" ? "▦ " : "▤ "}
              {v.name}
            </button>
            {v.id === view.id && props.views.length > 1 && (
              <button
                type="button"
                className="icon"
                aria-label={`Apagar view ${v.name}`}
                onClick={() => window.confirm(`Apagar a view "${v.name}"?`) && updateProps(removeView(props, v.id))}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const { props: next, viewId } = addView(props, "table");
            updateProps(next);
            selectView(viewId);
          }}
        >
          + Tabela
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const { props: next, viewId } = addView(props, "kanban");
            updateProps(next);
            selectView(viewId);
          }}
        >
          + Quadro
        </button>
      </nav>
      {rows === null ? (
        <p className="placeholder">Carregando…</p>
      ) : view.type === "table" ? (
        <TableView
          props={props}
          view={view}
          rows={rows}
          onSchemaChange={updateProps}
          onAddProperty={() => updateProps(addProperty(props).props)}
          onCellChange={(row, key, value) =>
            patchRow(row, { props: { [key]: value } }, (r) => ({ ...r, props: { ...r.props, [key]: value } }))
          }
          onTitleChange={(row, newTitle) => patchRow(row, { title: newTitle }, (r) => ({ ...r, title: newTitle }))}
          onAddRow={() => void addRow()}
          onDeleteRow={(row) => void deleteRow(row)}
          onOpenRow={onOpenRow}
        />
      ) : (
        <KanbanView
          props={props}
          view={view}
          rows={rows}
          onGroupChange={(key) => updateProps(setKanbanGroup(props, view.id, key))}
          onMove={(row, group, sortKey) => {
            const key = view.groupBy!;
            patchRow(row, { props: { [key]: group }, sortKey }, (r) => ({
              ...r,
              sortKey,
              props: { ...r.props, [key]: group },
            }));
          }}
          onAddRow={(group) => void addRow(group === null ? {} : { [view.groupBy!]: group })}
          onOpenRow={onOpenRow}
        />
      )}
    </section>
  );
}
