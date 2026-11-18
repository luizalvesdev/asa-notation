import { useCallback, useEffect, useRef, useState } from "react";
import { pagesApi } from "./api";
import type { PropValue, Row, Schema } from "./db-types";
import type { Page } from "./pages-types";

export type DbStatus = "carregando" | "pronto" | "erro";

export interface DatabaseState {
  status: DbStatus;
  title: string;
  schema: Schema;
  rows: Row[];
  reload: () => void;
  setTitle: (title: string) => void;
  /** Troca o esquema na hora e salva logo depois (junta várias mudanças seguidas). */
  saveSchema: (next: Schema) => void;
  addRow: (title: string, props?: Record<string, PropValue>) => Promise<Row | null>;
  updateProps: (rowId: string, patch: Record<string, PropValue>) => void;
  renameRow: (rowId: string, title: string) => void;
  removeRow: (rowId: string) => Promise<boolean>;
  restoreRow: (rowId: string) => Promise<boolean>;
  /** Reflete na lista uma linha salva em outro lugar (a página dela aberta ao lado). */
  applySaved: (page: Page) => void;
}

const EMPTY: Schema = { properties: [], views: [] };

export function normalizeSchema(raw: unknown): Schema {
  const s = (raw ?? {}) as Partial<Schema>;
  return {
    properties: (s.properties ?? []).map((p) => ({ ...p, options: p.options ?? [], relationDb: p.relationDb ?? null })),
    views: (s.views ?? []).map((v) => ({ ...v, filters: v.filters ?? [], sorts: v.sorts ?? [], hidden: v.hidden ?? [], groupBy: v.groupBy ?? null, dateProp: v.dateProp ?? null })),
  };
}

export function useDatabase(page: Page, onSaved: (page: Page) => void): DatabaseState {
  const [status, setStatus] = useState<DbStatus>("carregando");
  const [title, setTitleState] = useState(page.title);
  const [schema, setSchema] = useState<Schema>(() => normalizeSchema(page.schema) ?? EMPTY);
  const [rows, setRows] = useState<Row[]>([]);
  const [version, setVersion] = useState(0);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const timers = useRef<{ schema?: ReturnType<typeof setTimeout>; title?: ReturnType<typeof setTimeout> }>({});
  const pending = useRef<{ schema?: Schema; title?: string }>({});

  useEffect(() => {
    let live = true;
    pagesApi
      .rows(page.id)
      .then((list) => {
        if (!live) return;
        setRows(list);
        setStatus("pronto");
      })
      .catch(() => live && setStatus((s) => (s === "pronto" ? s : "erro")));
    return () => {
      live = false;
    };
  }, [page.id, version]);

  const flush = useCallback(() => {
    const { schema: s, title: t } = pending.current;
    pending.current = {};
    clearTimeout(timers.current.schema);
    clearTimeout(timers.current.title);
    if (s === undefined && t === undefined) return;
    void pagesApi
      .update(page.id, { ...(s !== undefined ? { schema: s } : {}), ...(t !== undefined ? { title: t } : {}) })
      .then((saved) => onSavedRef.current(saved))
      .catch(() => undefined);
  }, [page.id]);

  // Ao sair da database, envia o que ainda estiver esperando.
  useEffect(() => flush, [flush]);

  const saveSchema = useCallback(
    (next: Schema) => {
      setSchema(next);
      pending.current.schema = next;
      clearTimeout(timers.current.schema);
      timers.current.schema = setTimeout(flush, 500);
    },
    [flush],
  );

  const setTitle = useCallback(
    (next: string) => {
      setTitleState(next);
      pending.current.title = next;
      clearTimeout(timers.current.title);
      timers.current.title = setTimeout(flush, 500);
    },
    [flush],
  );

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const addRow = useCallback(
    async (rowTitle: string, props: Record<string, PropValue> = {}) => {
      try {
        const created = await pagesApi.create({ kind: "row", parentId: page.id, title: rowTitle, props });
        const row: Row = { id: created.id, title: created.title, icon: created.icon, props: (created.props ?? {}) as Row["props"], createdAt: created.createdAt, updatedAt: created.updatedAt };
        setRows((list) => [...list, row]);
        return row;
      } catch {
        return null;
      }
    },
    [page.id],
  );

  const updateProps = useCallback(
    (rowId: string, patch: Record<string, PropValue>) => {
      setRows((list) =>
        list.map((r) => {
          if (r.id !== rowId) return r;
          const props = { ...r.props };
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined) delete props[k];
            else props[k] = v;
          }
          return { ...r, props };
        }),
      );
      // `undefined` não vai no JSON: o que foi apagado precisa seguir como null.
      const body = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? null : v]));
      pagesApi.update(rowId, { props: body }).catch(() => setVersion((v) => v + 1));
    },
    [],
  );

  const renameRow = useCallback((rowId: string, rowTitle: string) => {
    setRows((list) => list.map((r) => (r.id === rowId ? { ...r, title: rowTitle } : r)));
    pagesApi.update(rowId, { title: rowTitle }).catch(() => setVersion((v) => v + 1));
  }, []);

  const removeRow = useCallback(async (rowId: string) => {
    try {
      await pagesApi.remove(rowId);
      setRows((list) => list.filter((r) => r.id !== rowId));
      return true;
    } catch {
      return false;
    }
  }, []);

  const restoreRow = useCallback(async (rowId: string) => {
    try {
      await pagesApi.restore(rowId);
      setVersion((v) => v + 1);
      return true;
    } catch {
      return false;
    }
  }, []);

  const applySaved = useCallback((saved: Page) => {
    if (saved.kind !== "row") return;
    setRows((list) => list.map((r) => (r.id === saved.id ? { ...r, title: saved.title, props: (saved.props ?? {}) as Row["props"], updatedAt: saved.updatedAt } : r)));
  }, []);

  return { status, title, schema, rows, reload, setTitle, saveSchema, addRow, updateProps, renameRow, removeRow, restoreRow, applySaved };
}
