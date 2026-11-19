import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, capturesApi, pagesApi, studyApi } from "./api";
import { BottomNav } from "./BottomNav";
import { ContextMenu, type OpenMenu } from "./ContextMenu";
import { keepsNativeMenu, localItemsAt, type ContextTarget, type MenuAction } from "./context-menu";
import { OPEN_CHAT_EVENT, type Agent, type OpenChatRequest } from "./chat-types";
import { CapturePanel } from "./CapturePanel";
import { Icon, ThemeIcon } from "./icons";
import { goStep, pageHash, routeHash, routeTitle, type Route } from "./nav";

/** As rotas de dentro do app (o link público tem tela própria, fora do Shell). */
export type AppRoute = Exclude<Route, { kind: "publica" }>;
import { HojeView } from "./HojeView";
import { PageView } from "./PageView";
import { Resizer } from "./Resizer";
import { SearchPalette } from "./SearchPalette";
import { CHAT_LIMITS, SIDE_LIMITS, clampWidth } from "./panel-size";
import { useStoredWidth } from "./use-stored-width";
import { SemanaView } from "./SemanaView";
import { TrashView } from "./TrashView";
import { ancestorsOf, buildTree, displayTitle } from "./pages-tree";
import type { Page } from "./pages-types";
import { Sidebar } from "./Sidebar";
import type { Preference } from "./theme";
import type { Toast } from "./toast";
import { flushOutbox, removePending, submitCapture, usePending } from "./outbox";
import { useUnread } from "./use-notifications";
import { usePages, type CreateExtra } from "./use-pages";
import { AWAY_MS, hasCardsToday, isStartHash, loadReviewOnOpen } from "./review-on-open";
import { localDate, localDayStartIso, localTimeZone } from "./tasks-dates";
import { CheckinReport, todaySummary } from "./CheckinReport";
import type { Stats } from "./study-types";
import { Presence } from "./Presence";

const SIDE_KEY = "asa:side-width";
const CHAT_KEY = "asa:chat-width";

const ImportView = lazy(() => import("./ImportView").then((m) => ({ default: m.ImportView })));
const SettingsView = lazy(() => import("./SettingsView").then((m) => ({ default: m.SettingsView })));
const ChatPanel = lazy(() => import("./ChatPanel").then((m) => ({ default: m.ChatPanel })));
const StatsView = lazy(() => import("./StatsView").then((m) => ({ default: m.StatsView })));
const ReviewView = lazy(() => import("./ReviewView").then((m) => ({ default: m.ReviewView })));
const ProgressoView = lazy(() => import("./ProgressoView").then((m) => ({ default: m.ProgressoView })));
const RotinaView = lazy(() => import("./RotinaView").then((m) => ({ default: m.RotinaView })));
const MetasView = lazy(() => import("./MetasView").then((m) => ({ default: m.MetasView })));
const NotificationsView = lazy(() => import("./NotificationsView").then((m) => ({ default: m.NotificationsView })));
const StudyView = lazy(() => import("./StudyView").then((m) => ({ default: m.StudyView })));
const InboxView = lazy(() => import("./InboxView").then((m) => ({ default: m.InboxView })));

/** Aparece enquanto o código de uma tela carrega. */
function ScreenFallback() {
  return (
    <div className="page" style={{ paddingTop: 56 }} aria-busy="true" aria-label="Carregando a tela">
      <span className="sk" style={{ height: 36, width: "40%", display: "block" }} />
      <div className="col" style={{ gap: 10, marginTop: 24 }}>
        <span className="sk" style={{ height: 14, width: "85%" }} />
        <span className="sk" style={{ height: 14, width: "70%" }} />
      </div>
    </div>
  );
}

interface ShellProps {
  dark: boolean;
  route: AppRoute;
  preference: Preference;
  onPreference: (preference: Preference) => void;
  onToggleTheme: () => void;
  onLogout: () => void;
}

export function Shell({ dark, route, preference, onPreference, onToggleTheme, onLogout }: ShellProps) {
  const pages = usePages();
  const [collapsed, setCollapsed] = useState(false);
  const [sideW, setSideW] = useStoredWidth(SIDE_KEY, SIDE_LIMITS);
  const [chatW, setChatW] = useStoredWidth(CHAT_KEY, CHAT_LIMITS);
  const [resizing, setResizing] = useState(false);
  // Janela estreita: nem a barra lateral nem o chat podem passar de metade dela.
  const [winW, setWinW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [drawer, setDrawer] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<OpenMenu | null>(null);
  // Depois da primeira vez o painel fica montado (só escondido): abre na hora e não perde a conversa.
  const [chatMounted, setChatMounted] = useState(false);
  const [chatRequest, setChatRequest] = useState<{ agent: Agent; prompt?: string; id: number } | null>(null);
  const [captureTick, setCaptureTick] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const pending = usePending();
  const { unread, refresh: refreshUnread } = useUnread();

  const tree = useMemo(() => buildTree(pages.nodes), [pages.nodes]);
  const favorites = useMemo(() => pages.nodes.filter((n) => n.favorite), [pages.nodes]);
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
      } else if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setChatOpen((v) => !v);
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

  // Check-in de estudo: ao entrar (ou voltar depois de um tempo longe) pela tela inicial, abre Hoje
  // com a revisão por cima, num modal, se há cards para hoje.
  const [checkin, setCheckin] = useState(false);
  const [report, setReport] = useState<Stats | null>(null);
  useEffect(() => {
    let hiddenAt: number | null = null;
    const offer = () => {
      if (!loadReviewOnOpen() || !isStartHash(location.hash)) return;
      studyApi
        .overview(localDayStartIso())
        .then(async (o) => {
          if (!isStartHash(location.hash)) return;
          if (hasCardsToday(o)) {
            if (location.hash !== routeHash("hoje")) location.hash = routeHash("hoje");
            setCheckin(true);
            return;
          }
          // Já respondeu tudo hoje: o check-in vira o resumo do dia (só se estudou hoje).
          const stats = await studyApi.stats(localTimeZone(), 2);
          if (todaySummary(stats, localDate()).reviews > 0 && isStartHash(location.hash)) {
            if (location.hash !== routeHash("hoje")) location.hash = routeHash("hoje");
            setReport(stats);
          }
        })
        .catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt !== null && Date.now() - hiddenAt >= AWAY_MS) {
        hiddenAt = null;
        offer();
      }
    };
    offer();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // "G e depois a letra" leva às telas. Não vale digitando num campo, com Ctrl/Alt/⌘ nem com uma janela aberta.
  useEffect(() => {
    let armedAt: number | null = null;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const el = event.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector("[role=dialog]")) return;
      const step = goStep(armedAt, event.key, Date.now());
      armedAt = step.armedAt;
      if (step.target) {
        event.preventDefault();
        location.hash = routeHash(step.target);
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

  useEffect(() => {
    if (chatOpen) setChatMounted(true);
  }, [chatOpen]);

  // Baixa o código do chat em segundo plano, para o primeiro clique não travar a tela.
  useEffect(() => {
    const timer = setTimeout(() => void import("./ChatPanel"), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Outras telas pedem o chat (ex.: "Sessão guiada com tutor" em Estudo).
  useEffect(() => {
    const onRequest = (event: Event) => {
      setChatRequest({ ...(event as CustomEvent<OpenChatRequest>).detail, id: Date.now() });
      setChatOpen(true);
    };
    window.addEventListener(OPEN_CHAT_EVENT, onRequest);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onRequest);
  }, []);

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
    async (parentId: string | null, title?: string, extra?: CreateExtra) => {
      try {
        const page = await pages.create(parentId, title, extra);
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
    async (page: Pick<Page, "id">) => {
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

  // Botão direito: menu do app no lugar do menu do navegador (exceto em campos de texto e no editor).
  const nodesRef = useRef(pages.nodes);
  nodesRef.current = pages.nodes;
  useEffect(() => {
    const onContext = (event: MouseEvent) => {
      const el = event.target instanceof Element ? event.target : null;
      if (!el || keepsNativeMenu(el)) return;
      event.preventDefault();
      const pageEl = el.closest("[data-page-id]");
      const link = el.closest("a[href]");
      const local = localItemsAt(el);
      const hasSelection = (window.getSelection()?.toString() ?? "") !== "";
      let target: ContextTarget;
      if (local) {
        target = { kind: "local", items: local, hasSelection };
      } else if (pageEl) {
        const id = pageEl.getAttribute("data-page-id")!;
        target = { kind: "page", id, favorite: !!nodesRef.current.find((n) => n.id === id)?.favorite };
      } else if (link) {
        const href = link.getAttribute("href") ?? "";
        target = { kind: "link", href, internal: href.startsWith("#/") };
      } else {
        target = { kind: "none", hasSelection };
      }
      setCtxMenu({ x: event.clientX, y: event.clientY, target });
    };
    document.addEventListener("contextmenu", onContext);
    return () => document.removeEventListener("contextmenu", onContext);
  }, []);

  const runMenuAction = useCallback(
    (action: MenuAction, target: ContextTarget) => {
      setCtxMenu(null);
      if (action.startsWith("local:")) {
        if (target.kind === "local") target.items[Number(action.slice(6))]?.run();
        return;
      }
      const copy = (text: string, done: string) =>
        void navigator.clipboard.writeText(text).then(() => setToast({ text: done })).catch(() => setToast({ text: "Não foi possível copiar." }));
      if (target.kind === "page") {
        const node = pages.nodes.find((n) => n.id === target.id);
        if (action === "open") location.hash = pageHash(target.id);
        else if (action === "new-child") void createPage(target.id);
        else if (action === "copy-link") copy(`${location.origin}/${pageHash(target.id)}`, "Link copiado");
        else if (action === "delete") void deletePage({ id: target.id });
        else if (action === "favorite" && node) {
          void pagesApi.update(target.id, { favorite: !node.favorite }).then(pages.applySaved).catch(() => setToast({ text: "Não foi possível atualizar a favorita." }));
        }
      } else if (target.kind === "link") {
        if (action === "open-link") {
          if (target.internal) location.hash = target.href;
          else window.open(target.href, "_blank", "noopener,noreferrer");
        } else if (action === "copy-href") copy(target.internal ? `${location.origin}/${target.href}` : target.href, "Endereço copiado");
      }
      // Ações gerais: valem em qualquer menu (vêm depois do divisor).
      if (action === "copy-text") copy(window.getSelection()?.toString() ?? "", "Copiado");
      else if (action === "new-page") void createPage(null);
      else if (action === "capture") setCaptureOpen(true);
      else if (action === "search") setSearchOpen(true);
      else if (action === "chat") setChatOpen(true);
      else if (action === "theme") onToggleTheme();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages.nodes, pages.applySaved, createPage, deletePage, onToggleTheme],
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
    onCreateFrom: (extra: CreateExtra & { title?: string }) => void createPage(null, extra.title, extra),
    onRetryTree: pages.reload,
    onOpenSearch: () => setSearchOpen(true),
    badges: { notificacoes: unread },
    favorites,
  };

  const onRestored = useCallback(
    (page: Page) => {
      pages.reload();
      setToast({ text: "Página restaurada", action: { label: "Abrir", run: () => { setToast(null); location.hash = pageHash(page.id); } } });
    },
    [pages],
  );

  return (
    <div className={`ds app${dark ? " escuro" : ""}${resizing ? " resizing" : ""}`} style={{ "--side-w": `${clampWidth(sideW, SIDE_LIMITS, winW * 0.5)}px`, "--chat-w": `${clampWidth(chatW, CHAT_LIMITS, winW * 0.6)}px` } as React.CSSProperties}>
      <Sidebar {...sidebarProps} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />
      {!collapsed && <Resizer edge="left" width={sideW} limits={SIDE_LIMITS} ceiling={winW * 0.5} label="Largura da barra lateral" onChange={setSideW} onDragging={setResizing} />}
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
            <button className={`btn btn-fan btn-sm${chatOpen ? " on" : ""}`} type="button" aria-pressed={chatOpen} onClick={() => setChatOpen((v) => !v)}>
              <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
              <span className="desk">Assistentes</span>
              <span className="kbd desk">⌘J</span>
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
          <Suspense fallback={<ScreenFallback />}>
          {route.kind === "pagina" ? (
            <PageView key={route.pageId} pageId={route.pageId} nodes={pages.nodes} onToast={setToast} onSaved={pages.applySaved} onDelete={(page) => void deletePage(page)} />
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
          ) : route.id === "notificacoes" ? (
            <NotificationsView onChanged={refreshUnread} onToast={setToast} />
          ) : route.id === "rotina" ? (
            <RotinaView sub={route.sub} onToast={setToast} />
          ) : route.id === "progresso" ? (
            <ProgressoView />
          ) : route.id === "importar" ? (
            <ImportView onImported={pages.reload} />
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
              <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: "calc(40px * var(--fs, 1))", lineHeight: "calc(44px * var(--fs, 1))", letterSpacing: "-.02em" }}>{routeTitle(route.id)}</h1>
              <p className="muted" style={{ marginTop: 12, fontSize: "calc(15px * var(--fs, 1))" }}>
                Tela em construção.
              </p>
            </div>
          )}
          </Suspense>
        </main>
        <BottomNav route={route} onCapture={() => setCaptureOpen(true)} onMenu={() => setDrawer(true)} />
      </div>
      {chatOpen && <Resizer edge="right" width={chatW} limits={CHAT_LIMITS} ceiling={winW * 0.6} label="Largura do painel de assistentes" onChange={setChatW} onDragging={setResizing} />}
      <div className={`chat-wrap${chatOpen ? " open" : ""}`} inert={!chatOpen} aria-hidden={!chatOpen}>
        {chatMounted && (
          <Suspense fallback={null}>
            <ChatPanel active={chatOpen} request={chatRequest} onClose={() => setChatOpen(false)} onToast={setToast} onDataChanged={pages.reload} />
          </Suspense>
        )}
      </div>
      <div className={`drawer${drawer ? " on" : ""}`} aria-hidden={!drawer}>
        <div className="scr" onClick={() => setDrawer(false)} />
        <div className="pane">
          <Sidebar {...sidebarProps} collapsed={false} inDrawer onToggleCollapsed={() => undefined} onNavigate={() => setDrawer(false)} />
        </div>
      </div>
      <Presence show={checkin}>
        <div className="checkin-scrim" role="dialog" aria-modal="true" aria-label="Revisão do dia">
          <div className="checkin-box">
            <Suspense fallback={<ScreenFallback />}>
              <ReviewView checkin onExit={() => setCheckin(false)} />
            </Suspense>
          </div>
        </div>
      </Presence>
      <Presence show={report !== null}>
        {report && (
          <div className="checkin-scrim" role="dialog" aria-modal="true" aria-label="Resumo do estudo de hoje">
            <div className="checkin-box">
              <CheckinReport stats={report} onClose={() => setReport(null)} />
            </div>
          </div>
        )}
      </Presence>
      <Presence show={searchOpen}>
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
      </Presence>
      <Presence show={captureOpen}>
        <CapturePanel dark={dark} offline={!online} queued={pending.length} onClose={() => setCaptureOpen(false)} onSave={saveCapture} />
      </Presence>
      <Presence show={ctxMenu !== null}>{ctxMenu && <ContextMenu menu={ctxMenu} dark={dark} onAction={runMenuAction} onClose={() => setCtxMenu(null)} />}</Presence>
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
