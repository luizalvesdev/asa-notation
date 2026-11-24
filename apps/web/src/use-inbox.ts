import { useCallback, useEffect, useState } from "react";
import { capturesApi } from "./api";
import { useDataVersion } from "./data-events";
import { EMPTY_COUNTS, type Capture, type Counts, type Kind, type InboxView, type KindFilter } from "./captures-types";
import type { Page } from "./pages-types";

export type InboxStatus = "carregando" | "pronto" | "erro";

export interface InboxState {
  status: InboxStatus;
  items: Capture[];
  counts: Counts;
  reload: () => void;
  classify: (ids: string[], kind: Kind | null) => Promise<boolean>;
  archive: (ids: string[]) => Promise<boolean>;
  restore: (ids: string[]) => Promise<boolean>;
  finish: (ids: string[]) => Promise<boolean>;
  reopen: (ids: string[]) => Promise<boolean>;
  move: (id: string, parentId: string | null) => Promise<Page | null>;
}

export function useInbox(filter: KindFilter, view: InboxView = "pending"): InboxState {
  const [items, setItems] = useState<Capture[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [status, setStatus] = useState<InboxStatus>("carregando");
  const [version, setVersion] = useState(0);
  const dataVersion = useDataVersion();

  useEffect(() => {
    let live = true;
    capturesApi
      .list(filter, view)
      .then((data) => {
        if (!live) return;
        setItems(data.items);
        setCounts(data.counts);
        setStatus("pronto");
      })
      .catch(() => live && setStatus((current) => (current === "pronto" ? current : "erro")));
    return () => {
      live = false;
    };
  }, [filter, view, version, dataVersion]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const reload = useCallback(() => {
    setStatus((current) => (current === "pronto" ? current : "carregando"));
    refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        refresh();
        return true;
      } catch {
        return false;
      }
    },
    [refresh],
  );

  const classify = useCallback(
    (ids: string[], kind: Kind | null) => {
      setItems((list) => list.map((c) => (ids.includes(c.id) ? { ...c, kind } : c)));
      return run(() => capturesApi.bulk(ids, { action: "kind", kind }));
    },
    [run],
  );
  const archive = useCallback(
    (ids: string[]) => {
      setItems((list) => list.filter((c) => !ids.includes(c.id)));
      return run(() => capturesApi.bulk(ids, { action: "archive" }));
    },
    [run],
  );
  const restore = useCallback((ids: string[]) => run(() => capturesApi.bulk(ids, { action: "restore" })), [run]);
  const finish = useCallback(
    (ids: string[]) => {
      setItems((list) => list.filter((c) => !ids.includes(c.id)));
      return run(() => capturesApi.bulk(ids, { action: "done" }));
    },
    [run],
  );
  const reopen = useCallback(
    (ids: string[]) => {
      setItems((list) => list.filter((c) => !ids.includes(c.id)));
      return run(() => capturesApi.bulk(ids, { action: "reopen" }));
    },
    [run],
  );
  const move = useCallback(
    async (id: string, parentId: string | null) => {
      try {
        const page = await capturesApi.move(id, parentId);
        setItems((list) => list.filter((c) => c.id !== id));
        refresh();
        return page;
      } catch {
        return null;
      }
    },
    [refresh],
  );

  return { status, items, counts, reload, classify, archive, restore, finish, reopen, move };
}
