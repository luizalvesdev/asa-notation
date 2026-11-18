import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, capturesApi } from "./api";
import { CapturePanel } from "./CapturePanel";
import { InboxView } from "./InboxView";
import { Icon, ThemeIcon } from "./icons";
import { pageHash, routeHash, routeTitle, type Route } from "./nav";
import { HojeView } from "./HojeView";
import { MetasView } from "./MetasView";
import { ReviewView } from "./ReviewView";
import { StatsView } from "./StatsView";
import { StudyView } from "./StudyView";
import { PageView } from "./PageView";
import { SearchPalette } from "./SearchPalette";
import { SemanaView } from "./SemanaView";
import { TrashView } from "./TrashView";
import { ancestorsOf, buildTree, displayTitle } from "./pages-tree";
import type { Page } from "./pages-types";
import { Sidebar } from "./Sidebar";
import { SettingsView } from "./SettingsView";
import type { Preference } from "./theme";
import type { Toast } from "./toast";
import { flushOutbox, removePending, submitCapture, usePending } from "./outbox";
import { usePages } from "./use-pages";

interface ShellProps {
  dark: boolean;
  route: Route;
  preference: Preference;
  onPreference: (preference: Preference) => void;
  onToggleTheme: () => void;
  onLogout: () => void;
}

export function Shell({ dark, route, preference, onPreference, onToggleTheme, onLogout }: ShellProps) {
  const pages = usePages();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureTick, setCaptureTick] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const pending = usePending();

  const tree = useMemo(() => buildTree(pages.nodes), [pages.nodes]);
  const pageId = route.kind === "pagina" ? route.pageId : null;

  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        setCollapsed((v) => !v);
      } else if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCaptureOpen(true);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Abre os ancestrais da página atual para ela aparecer na árvore.
  useEffect(() => {
    if (!pageId) return;
    const ids = ancestorsOf(pages.nodes, pageId).map((n) => n.id);
    if (ids.length === 0) return;
    setExpanded((current) => (ids.every((id) => current.has(id)) ? current : new Set([...current, ...ids])));
  }, [pageId, pages.nodes]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Sobe a fila de capturas ao abrir o app e sempre que a conexão voltar.
  useEffect(() => {
    const flush = () => void flushOutbox().then((sent) => sent > 0 && setCaptureTick((t) => t + 1));
    const goOnline = () => {
      setOnline(true);
      flush();
    };
    const goOffline = () => setOnline(false);
    flush();
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const saveCapture = useCallback(async (text: string) => {
    try {
      const result = await submitCapture(text);
      setCaptureTick((t) => t + 1);
      setToast({
        text: result.kind === "sent" ? "Salvo na Inbox" : "Na fila · enviaremos ao reconectar",
        action: {
          label: "Desfazer",
          run: () => {
            setToast(null);
            if (result.kind === "queued") removePending(result.id);
            else void capturesApi.bulk([result.id], { action: "archive" }).then(() => setCaptureTick((t) => t + 1));
          },
        },
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const createPage = useCallback(
    async (parentId: string | null, title?: string) => {
      try {
        const page = await pages.create(parentId, title);
        if (parentId) setExpanded((current) => new Set([...current, parentId]));
        setDrawer(false);
        location.hash = pageHash(page.id);
      } catch (err) {
        setToast({ text: err instanceof ApiError && err.status === 404 ? "A página pai não existe mais." : "Não foi possível criar a página." });
      }
    },
    [pages],
  );

  const deletePage = useCallback(
    async (page: Page) => {
      try {
        const count = await pages.remove(page.id);
        location.hash = routeHash("hoje");
        setToast({
          text: count > 1 ? `${count} páginas movidas para a lixeira` : "Página movida para a lixeira",
          action: {
            label: "Desfazer",
            run: () => {
              setToast(null);
              void pages.restore(page.id).then(() => {
                location.hash = pageHash(page.id);
              });
            },
          },
        });
      } catch {
        setToast({ text: "Não foi possível excluir a página." });
      }
    },
    [pages],
  );

  const crumbs = useMemo(() => {
    if (route.kind !== "pagina") return null;
    const current = pages.nodes.find((n) => n.id === route.pageId);
    return { parents: ancestorsOf(pages.nodes, route.pageId), current: current ? displayTitle(current.title) : "Página" };
  }, [route, pages.nodes]);

  const sidebarProps = {
    route,
    tree,
    treeStatus: pages.status,
    expanded,
    onToggleExpanded: toggleExpanded,
    onCreatePage: (parentId: string | null) => void createPage(parentId),
    onRetryTree: pages.reload,
    onOpenSearch: () => setSearchOpen(true),
  };

  const onRestored = useCallback(
    (page: Page) => {
      pages.reload();
      setToast({ text: "Página restaurada", action: { label: "Abrir", run: () => { setToast(null); location.hash = pageHash(page.id); } } });
    },
    [pages],
  );

  return (
    <div className={`ds app${dark ? " escuro" : ""}`}>
      <Sidebar {...sidebarProps} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />
      <div className="main">
        <header className="tb">
          <button className="btn btn-fan btn-ico mob" type="button" aria-label="Abrir navegação" onClick={() => setDrawer(true)}>
            <Icon name="menu" />
          </button>
          <nav className="crumbs" aria-label="Caminho">
            {crumbs ? (
              <>
                {crumbs.parents.map((parent) => (
                  <span key={parent.id} style={{ display: "contents" }}>
                    <a href={pageHash(parent.id)}>{displayTitle(parent.title)}</a>
                    <span className="sep">/</span>
                  </span>
                ))}
                <span className="cur">{crumbs.current}</span>
              </>
            ) : (
              <span className="cur">{route.kind === "tela" ? routeTitle(route.id) : ""}</span>
            )}
          </nav>
          <div className="tb-r">
            <button className="btn btn-fan btn-sm" type="button" onClick={() => setCaptureOpen(true)}>
              <Icon name="plus" />
              Capturar
              <span className="kbd">⌘⇧K</span>
            </button>
            <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Alternar tema" onClick={onToggleTheme}>
              <ThemeIcon />
            </button>
            <button className="btn btn-fan btn-sm" type="button" onClick={onLogout}>
              Sair
            </button>
          </div>
        </header>
        <main className="scroll">
          {route.kind === "pagina" ? (
            <PageView key={route.pageId} pageId={route.pageId} onSaved={pages.applySaved} onDelete={(page) => void deletePage(page)} />
          ) : route.id === "hoje" ? (
            <HojeView onToast={setToast} />
          ) : route.id === "inbox" ? (
            <InboxView
              key={captureTick}
              nodes={pages.nodes}
              onToast={setToast}
              onMoved={(page) => {
                pages.reload();
                setToast({ text: "Movida para uma página", action: { label: "Abrir", run: () => { setToast(null); location.hash = pageHash(page.id); } } });
              }}
            />
          ) : route.id === "configuracoes" ? (
            <SettingsView preference={preference} onPreference={onPreference} onLogout={onLogout} onToast={setToast} />
          ) : route.id === "estudo" ? (
            <StudyView nodes={pages.nodes} onToast={setToast} />
          ) : route.id === "revisao" ? (
            <ReviewView />
          ) : route.id === "estudo-stats" ? (
            <StatsView />
          ) : route.id === "metas" ? (
            <MetasView onToast={setToast} />
          ) : route.id === "semana" ? (
            <SemanaView onToast={setToast} />
          ) : route.id === "lixeira" ? (
            <TrashView onRestored={onRestored} />
          ) : (
            <div style={{ padding: "40px 40px 120px", maxWidth: 1180 }}>
              <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 40, lineHeight: "44px", letterSpacing: "-.02em" }}>{routeTitle(route.id)}</h1>
              <p className="muted" style={{ marginTop: 12, fontSize: 15 }}>
                Tela em construção.
              </p>
            </div>
          )}
        </main>
      </div>
      <div className={`drawer${drawer ? " on" : ""}`} aria-hidden={!drawer}>
        <div className="scr" onClick={() => setDrawer(false)} />
        <div className="pane">
          <Sidebar {...sidebarProps} collapsed={false} inDrawer onToggleCollapsed={() => undefined} onNavigate={() => setDrawer(false)} />
        </div>
      </div>
      {searchOpen && (
        <SearchPalette
          nodes={pages.nodes}
          onClose={() => setSearchOpen(false)}
          onOpenPage={(id) => {
            setSearchOpen(false);
            location.hash = pageHash(id);
          }}
          onCreatePage={(title) => {
            setSearchOpen(false);
            void createPage(null, title);
          }}
          onOpenTrash={() => {
            setSearchOpen(false);
            location.hash = routeHash("lixeira");
          }}
        />
      )}
      {captureOpen && <CapturePanel dark={dark} offline={!online} queued={pending.length} onClose={() => setCaptureOpen(false)} onSave={saveCapture} />}
      <div className="toasts">
        <div className={`toast${toast ? " on" : ""}`} role="status">
          {toast?.text}
          {toast?.action && (
            <button className="btn" type="button" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
