import type { Page, TreeNode } from "@asa/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api.js";
import { DatabaseView } from "./DatabaseView.js";
import { asDatabaseProps } from "./db-model.js";
import { PageEditor } from "./PageEditor.js";
import { PasswordDialog } from "./PasswordDialog.js";
import { Sidebar } from "./Sidebar.js";
import { ancestorsOf } from "./tree.js";

const POLL_INTERVAL_MS = 10_000;
const EXPANDED_KEY = "asa.expanded";

function readHash(): string | null {
  const match = /^#\/([0-9a-fA-F-]{36})$/.exec(window.location.hash);
  return match ? match[1]! : null;
}

function loadExpanded(): Set<string> {
  try {
    const raw = window.localStorage.getItem(EXPANDED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveExpanded(set: Set<string>) {
  try {
    window.localStorage.setItem(EXPANDED_KEY, JSON.stringify([...set]));
  } catch {
    return;
  }
}

type PageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; page: Page }
  | { status: "missing" };

function RowPage({ page, seq, onSaved, onOpen }: { page: Page; seq: number | null; onSaved: (page: Page) => void; onOpen: (id: string) => void }) {
  const [database, setDatabase] = useState<Page | null>(null);
  const [remoteRev, setRemoteRev] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api.getPage(page.databaseId!).then(
      (db) => !cancelled && setDatabase(db),
      () => !cancelled && setDatabase(null),
    );
    if (seq !== null) {
      api.getPage(page.id).then(
        (fresh) => !cancelled && setRemoteRev(fresh.rev),
        () => undefined,
      );
    }
    return () => {
      cancelled = true;
    };
  }, [page.id, page.databaseId, seq]);

  if (!database) return <p className="placeholder">Carregando…</p>;
  return (
    <PageEditor
      page={page}
      remoteRev={remoteRev}
      onSaved={onSaved}
      schema={asDatabaseProps(database.props).schema}
      breadcrumb={{ title: database.title, onClick: () => onOpen(database.id) }}
    />
  );
}

interface WorkspaceProps {
  hasPassword: boolean;
  onLogout: () => void;
  onAccountChanged: () => void;
}

export function Workspace({ hasPassword, onLogout, onAccountChanged }: WorkspaceProps) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(readHash);
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const [pageState, setPageState] = useState<PageState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [seq, setSeq] = useState<number | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const refreshTree = useCallback(async () => {
    try {
      const { pages } = await api.tree();
      setNodes(pages);
      setLoaded(true);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setError("Não foi possível carregar as páginas.");
    }
  }, []);

  useEffect(() => {
    void refreshTree();
  }, [refreshTree]);

  useEffect(() => {
    let lastSeq: number | null = null;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { seq: current } = await api.head();
        if (lastSeq !== null && current !== lastSeq) {
          await refreshTree();
          setSeq(current);
        }
        lastSeq = current;
      } catch {
        return;
      }
    };
    void tick();
    const interval = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refreshTree]);

  useEffect(() => {
    const onHash = () => setSelectedId(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      setPageState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setPageState({ status: "loading" });
    api.getPage(selectedId).then(
      (page) => !cancelled && setPageState({ status: "ready", page }),
      (err) => {
        if (cancelled) return;
        setPageState(err instanceof ApiError && err.status === 404 ? { status: "missing" } : { status: "idle" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const select = useCallback((id: string | null) => {
    window.location.hash = id === null ? "" : `/${id}`;
    setSelectedId(id);
  }, []);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveExpanded(next);
      return next;
    });
  }, []);

  const create = useCallback(
    async (parentId: string | null, kind: "page" | "database" = "page") => {
      try {
        const page = await api.createPage({ parentId, kind });
        setNodes((prev) => [
          ...prev,
          { id: page.id, parentId: page.parentId, kind: page.kind, title: page.title, rev: page.rev, updatedAt: page.updatedAt },
        ]);
        if (parentId !== null) {
          setExpanded((prev) => {
            const next = new Set(prev).add(parentId);
            saveExpanded(next);
            return next;
          });
        }
        select(page.id);
      } catch {
        setError("Não foi possível criar a página.");
      }
    },
    [select],
  );

  const remove = useCallback(
    async (id: string) => {
      const title = nodes.find((n) => n.id === id)?.title || "Sem título";
      if (!window.confirm(`Apagar "${title}" e as subpáginas?`)) return;
      try {
        await api.deletePage(id);
        if (selectedId !== null && (selectedId === id || ancestorsOf(nodes, selectedId).includes(id))) select(null);
        await refreshTree();
      } catch {
        setError("Não foi possível apagar a página.");
      }
    },
    [nodes, selectedId, select, refreshTree],
  );

  const onSaved = useCallback((page: Page) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === page.id ? { ...n, title: page.title, rev: page.rev, updatedAt: page.updatedAt } : n)),
    );
  }, []);

  const visibleExpanded = useMemo(() => {
    if (selectedId === null) return expanded;
    return new Set([...expanded, ...ancestorsOf(nodes, selectedId)]);
  }, [expanded, nodes, selectedId]);

  const remoteRev = selectedId === null ? undefined : nodes.find((n) => n.id === selectedId)?.rev;

  return (
    <div className="workspace">
      <Sidebar
        nodes={nodes}
        selectedId={selectedId}
        expanded={visibleExpanded}
        onToggle={toggle}
        onSelect={select}
        onCreate={(parentId) => void create(parentId)}
        onCreateDatabase={() => void create(null, "database")}
        onDelete={(id) => void remove(id)}
        onLogout={onLogout}
        passwordLabel={hasPassword ? "Trocar senha" : "Definir senha"}
        onPassword={() => setPasswordOpen(true)}
      />
      {passwordOpen && (
        <PasswordDialog hasPassword={hasPassword} onClose={() => setPasswordOpen(false)} onSaved={onAccountChanged} />
      )}
      <main className="content">
        {error && (
          <div className="banner" role="alert">
            {error} <button onClick={() => setError(null)}>Fechar</button>
          </div>
        )}
        {pageState.status === "ready" ? (
          pageState.page.kind === "database" ? (
            <DatabaseView
              key={pageState.page.id}
              page={pageState.page}
              seq={seq}
              remoteRev={remoteRev}
              onSaved={onSaved}
              onOpenRow={select}
            />
          ) : pageState.page.databaseId !== null ? (
            <RowPage key={pageState.page.id} page={pageState.page} seq={seq} onSaved={onSaved} onOpen={select} />
          ) : (
            <PageEditor key={pageState.page.id} page={pageState.page} remoteRev={remoteRev} onSaved={onSaved} />
          )
        ) : pageState.status === "loading" ? (
          <p className="placeholder">Carregando…</p>
        ) : pageState.status === "missing" ? (
          <p className="placeholder">Esta página não existe mais.</p>
        ) : (
          <div className="placeholder">
            {loaded && nodes.length === 0 ? (
              <>
                <p>Nenhuma página ainda.</p>
                <button className="primary" onClick={() => void create(null)}>
                  Criar a primeira página
                </button>
              </>
            ) : (
              <p>Selecione uma página.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
