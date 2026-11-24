import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { useContextItems } from "./use-context-items";
import { KIND_COLOR, KIND_LABEL, KINDS, type Capture, type InboxView as View, type Kind, type KindFilter } from "./captures-types";
import { removePending, usePending } from "./outbox";
import { displayTitle } from "./pages-tree";
import type { Page, TreeNode } from "./pages-types";
import { formatAgo } from "./time-utils";
import type { Toast } from "./toast";
import { useDismiss } from "./use-dismiss";
import { useInbox } from "./use-inbox";
import { Presence } from "./Presence";
import { askConfirm } from "./confirm";

interface InboxViewProps {
  nodes: TreeNode[];
  onToast: (toast: Toast) => void;
  onMoved: (page: Page) => void;
}

const Dot = ({ kind }: { kind: Kind }) => <span style={{ width: 8, height: 8, borderRadius: "50%", background: KIND_COLOR[kind], display: "inline-block", flex: "none" }} />;

function Check({ on }: { on: boolean }) {
  return (
    <span className={`cb${on ? " on" : ""}`}>
      <svg className="ico tick" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7" pathLength="1" />
      </svg>
    </span>
  );
}

function KindMenu({ current, onPick, onClose }: { current: Kind | null; onPick: (kind: Kind | null) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, true, onClose);
  return (
    <div ref={ref} className="menu on" role="menu" style={{ position: "absolute", zIndex: 40, width: 200 }}>
      <div className="mgroup">Classificar como</div>
      {KINDS.map((kind) => (
        <button key={kind} className={`plain mrow${current === kind ? " sel" : ""}`} type="button" role="menuitem" onClick={() => onPick(kind)}>
          <Dot kind={kind} />
          {KIND_LABEL[kind]}
        </button>
      ))}
      {current && (
        <button className="plain mrow" type="button" role="menuitem" onClick={() => onPick(null)}>
          Sem tipo
        </button>
      )}
    </div>
  );
}

function MoveMenu({ nodes, onPick, onClose }: { nodes: TreeNode[]; onPick: (parentId: string | null) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  useDismiss(ref, true, onClose);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return nodes.filter((n) => displayTitle(n.title).toLowerCase().includes(needle)).slice(0, 8);
  }, [nodes, q]);
  return (
    <div ref={ref} className="menu on" role="menu" style={{ position: "absolute", bottom: 38, right: 0, width: 260, color: "var(--text)", zIndex: 40 }}>
      <div className="mgroup">Mover para</div>
      <input className="add-task-input" autoFocus value={q} placeholder="Buscar página…" aria-label="Buscar página" onChange={(e) => setQ(e.target.value)} style={{ margin: "0 8px 6px", width: "calc(100% - 16px)", height: 30, fontSize: "calc(13px * var(--fs, 1))" }} />
      {q.trim() === "" && (
        <button className="plain mrow" type="button" role="menuitem" onClick={() => onPick(null)}>
          Nova página na raiz
        </button>
      )}
      {shown.map((n) => (
        <button key={n.id} className="plain mrow" type="button" role="menuitem" onClick={() => onPick(n.id)}>
          <span className="page-emoji">{n.icon ?? "·"}</span>
          <span className="trunc">{displayTitle(n.title)}</span>
        </button>
      ))}
      {shown.length === 0 && q.trim() !== "" && <div style={{ padding: "6px 12px", fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)" }}>Nenhuma página.</div>}
    </div>
  );
}

export function InboxView({ nodes, onToast, onMoved }: InboxViewProps) {
  const [filter, setFilter] = useState<KindFilter>("all");
  const [view, setView] = useState<View>("pending");
  const inbox = useInbox(filter, view);
  const finished = view === "done";
  const pending = usePending();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [kindMenu, setKindMenu] = useState<string | null>(null);
  const [bulkMenu, setBulkMenu] = useState<"kind" | "move" | null>(null);

  // Some da seleção o que saiu da lista (arquivado, movido, filtrado).
  useEffect(() => {
    setSelected((cur) => {
      const alive = new Set(inbox.items.map((c) => c.id));
      const next = new Set([...cur].filter((id) => alive.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [inbox.items]);

  const ids = inbox.items.map((c) => c.id);
  const toggle = useCallback(
    (id: string, range: boolean) => {
      setSelected((cur) => {
        const next = new Set(cur);
        if (range && anchor && ids.includes(anchor)) {
          const [a, b] = [ids.indexOf(anchor), ids.indexOf(id)].sort((x, y) => x - y) as [number, number];
          for (const rid of ids.slice(a, b + 1)) next.add(rid);
        } else if (!next.delete(id)) next.add(id);
        return next;
      });
      setAnchor(id);
    },
    [anchor, ids],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA"].includes(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !typing) {
        e.preventDefault();
        setSelected(new Set(ids));
      } else if (e.key === "Escape" && !typing) setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ids]);

  const chosen = [...selected];
  const fail = (text: string) => onToast({ text });

  const archive = (list: string[]) =>
    void inbox.archive(list).then((ok) => {
      if (!ok) return fail("Não foi possível arquivar.");
      setSelected(new Set());
      onToast({ text: list.length > 1 ? `${list.length} capturas arquivadas` : "Captura arquivada", action: { label: "Desfazer", run: () => void inbox.restore(list) } });
    });
  const finish = (list: string[]) =>
    void inbox.finish(list).then((ok) => {
      if (!ok) return fail("Não foi possível finalizar.");
      setSelected(new Set());
      onToast({ text: list.length > 1 ? `${list.length} capturas finalizadas` : "Captura finalizada", action: { label: "Desfazer", run: () => void inbox.reopen(list) } });
    });
  const reopen = (list: string[]) =>
    void inbox.reopen(list).then((ok) => {
      if (!ok) return fail("Não foi possível reabrir.");
      setSelected(new Set());
      onToast({ text: list.length > 1 ? `${list.length} capturas reabertas` : "Captura reaberta" });
    });
  const classify = (list: string[], kind: Kind | null) => {
    setKindMenu(null);
    setBulkMenu(null);
    void inbox.classify(list, kind).then((ok) => !ok && fail("Não foi possível classificar."));
  };
  const move = (parentId: string | null) => {
    setBulkMenu(null);
    void (async () => {
      let last: Page | null = null;
      let failed = 0;
      for (const id of chosen) {
        const page = await inbox.move(id, parentId);
        if (page) last = page;
        else failed += 1;
      }
      setSelected(new Set());
      if (last) onMoved(last);
      if (failed > 0) fail(failed === chosen.length ? "Não foi possível mover." : `${failed} não puderam ser movidas.`);
    })();
  };

  const filters: { id: KindFilter; label: string; n: number }[] = [
    { id: "all", label: "Todas", n: inbox.counts.total },
    ...KINDS.map((k) => ({ id: k as KindFilter, label: KIND_LABEL[k], n: inbox.counts[k] })),
    { id: "none", label: "Sem tipo", n: inbox.counts.none },
  ];
  const ready = inbox.status === "pronto";

  return (
    <div className="screen" style={{ paddingBottom: 140, display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="screen-head" style={{ marginBottom: 10 }}>
        <h1 className="screen-title">Inbox</h1>
        <span className="muted screen-sub">
          {inbox.counts.total + pending.length} {inbox.counts.total + pending.length === 1 ? "item" : "itens"}
          {inbox.counts.none > 0 ? ` · ${inbox.counts.none} sem tipo` : ""}
        </span>
      </div>

      <div className="row" style={{ gap: 6 }} role="group" aria-label="Pendentes ou finalizadas">
        {([["pending", "Pendentes", inbox.counts.total], ["done", "Finalizadas", inbox.counts.done]] as const).map(([id, label, n]) => (
          <button key={id} className={`btn btn-sm ${view === id ? "btn-sec" : "btn-fan"}`} type="button" aria-pressed={view === id} onClick={() => { setView(id); setSelected(new Set()); }}>
            {label}
            <span style={{ color: "var(--text-3)", marginLeft: 4 }}>{n}</span>
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 6, flexWrap: "wrap" }} role="group" aria-label="Filtrar por tipo">
        {filters.map((f) => (
          <button key={f.id} className={`btn btn-sm ${filter === f.id ? "btn-sec" : "btn-fan"}`} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.id !== "all" && f.id !== "none" && <Dot kind={f.id} />}
            {f.label}
            <span style={{ color: "var(--text-3)", marginLeft: 4 }}>{f.n}</span>
          </button>
        ))}
      </div>

      {!finished && filter === "all" && pending.length > 0 && (
        <div className="col" style={{ gap: 6 }}>
          {pending.map((p) => (
      <div key={p.id} className="card" style={{ display: "flex", gap: 12, padding: "12px 14px" }}>
        <div className="col grow1" style={{ gap: 8, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="grow1" style={{ fontWeight: 500, fontSize: "calc(14px * var(--fs, 1))", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {p.text}
            </span>
            <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)", whiteSpace: "nowrap" }}>{formatAgo(p.createdAt)}</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="badge warn">Na fila · envia ao reconectar</span>
            <button className="btn btn-fan btn-sm" type="button" style={{ height: 24, padding: "0 8px" }} onClick={() => void askConfirm({ title: "Descartar esta captura?", body: "Ela ainda não foi enviada: some daqui e não vai para a Inbox.", confirmLabel: "Descartar" }).then((ok) => { if (ok) void removePending(p.id); })}>
              Descartar
            </button>
          </div>
        </div>
      </div>
    ))}
        </div>
      )}

      {inbox.status === "carregando" && (
        <div className="col" style={{ gap: 6 }} aria-busy="true" aria-label="Carregando a Inbox">
          {[0, 1, 2].map((i) => (
            <span key={i} className="sk" style={{ height: 68, borderRadius: 10 }} />
          ))}
        </div>
      )}
      {inbox.status === "erro" && (
        <div className="card" role="alert" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "calc(14px * var(--fs, 1))" }}>Não foi possível carregar a Inbox.</span>
          <button className="btn btn-sec btn-sm" type="button" onClick={inbox.reload} style={{ marginLeft: "auto" }}>
            Tentar de novo
          </button>
        </div>
      )}

      {ready && (
        <div className="col" style={{ gap: 6 }}>
          {inbox.items.map((item) => (
            <CaptureCard
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              menuOpen={kindMenu === item.id}
              onToggle={(range) => toggle(item.id, range)}
              onOpenMenu={() => setKindMenu(kindMenu === item.id ? null : item.id)}
              onCloseMenu={() => setKindMenu(null)}
              onKind={(kind) => classify([item.id], kind)}
              onArchive={() => archive([item.id])}
              finished={finished}
              onFinish={() => (finished ? reopen([item.id]) : finish([item.id]))}
            />
          ))}
          {inbox.items.length === 0 && (finished || pending.length === 0) && (
            <p className="muted enter" style={{ fontSize: "calc(14px * var(--fs, 1))", padding: "12px 4px" }}>
              {finished ? "Nenhuma captura finalizada ainda." : filter === "all" ? "Inbox vazia. Capture algo com ⌘K, de qualquer tela." : "Nada neste filtro."}
            </p>
          )}
        </div>
      )}

      <div className={`bulk${chosen.length > 0 ? " on" : ""}`} role="toolbar" aria-label="Ações em lote" aria-hidden={chosen.length === 0} style={{ position: "fixed", left: "50%", bottom: 32, transform: "translateX(-50%)", width: "min(600px, calc(100% - 24px))", zIndex: 30, display: chosen.length > 0 ? "block" : "none" }}>
        <div className="row" style={{ gap: 6, padding: "6px 6px 6px 14px", borderRadius: 12, background: "var(--text)", color: "var(--bg)", boxShadow: "var(--e3)", fontSize: "calc(13px * var(--fs, 1))" }}>
          <b style={{ fontWeight: 600 }}>{chosen.length} {chosen.length === 1 ? "selecionada" : "selecionadas"}</b>
          <span style={{ position: "relative", marginLeft: "auto" }}>
            <button className="btn btn-sm" type="button" style={{ color: "inherit" }} aria-expanded={bulkMenu === "kind"} onClick={() => setBulkMenu(bulkMenu === "kind" ? null : "kind")}>
              Classificar…
            </button>
            <Presence show={bulkMenu === "kind"}><div style={{ position: "absolute", bottom: 38, right: 0, color: "var(--text)" }}>
                <KindMenu current={null} onPick={(kind) => classify(chosen, kind)} onClose={() => setBulkMenu(null)} />
              </div></Presence>
          </span>
          <span style={{ position: "relative" }}>
            <button className="btn btn-sm" type="button" style={{ color: "inherit" }} aria-expanded={bulkMenu === "move"} onClick={() => setBulkMenu(bulkMenu === "move" ? null : "move")}>
              Mover para…
            </button>
            <Presence show={bulkMenu === "move"}><MoveMenu nodes={nodes} onPick={move} onClose={() => setBulkMenu(null)} /></Presence>
          </span>
          <button className="btn btn-sm" type="button" style={{ color: "inherit" }} onClick={() => (finished ? reopen(chosen) : finish(chosen))}>
            {finished ? "Reabrir" : "Finalizar"}
          </button>
          <button className="btn btn-sm" type="button" style={{ color: "inherit" }} onClick={() => archive(chosen)}>
            Arquivar
          </button>
          <button className="btn btn-sm btn-ico" type="button" aria-label="Limpar seleção" style={{ color: "inherit" }} onClick={() => setSelected(new Set())}>
            <Icon name="close" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  item: Capture;
  selected: boolean;
  menuOpen: boolean;
  onToggle: (range: boolean) => void;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onKind: (kind: Kind | null) => void;
  onArchive: () => void;
  finished: boolean;
  onFinish: () => void;
}

function CaptureCard({ item, selected, menuOpen, onToggle, onOpenMenu, onCloseMenu, onKind, onArchive, finished, onFinish }: CardProps) {
  const menuRef = useContextItems(() => [
    { label: selected ? "Desmarcar" : "Selecionar", run: () => onToggle(false) },
    { label: item.kind ? "Mudar classificação" : "Classificar", run: onOpenMenu },
    { label: "Copiar texto", run: () => void navigator.clipboard.writeText(item.text).catch(() => undefined) },
    { label: finished ? "Reabrir" : "Finalizar", run: onFinish },
    { label: "Arquivar", run: onArchive },
  ]);
  return (
    <div ref={menuRef} className="card enter inbox-card" style={{ display: "flex", gap: 12, padding: "12px 14px", boxShadow: selected ? "inset 0 0 0 2px var(--accent)" : undefined, ...(menuOpen ? { position: "relative", zIndex: 20 } : {}) }}>
      <button className="plain" type="button" role="checkbox" aria-checked={selected} aria-label="Selecionar" onClick={(e) => onToggle(e.shiftKey)} style={{ paddingTop: 1 }}>
        <Check on={selected} />
      </button>
      <div className="col grow1" style={{ gap: 8, minWidth: 0 }}>
        <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <span className="grow1" style={{ fontWeight: 500, fontSize: "calc(14px * var(--fs, 1))", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {item.text}
          </span>
          <span style={{ fontSize: "calc(12px * var(--fs, 1))", color: "var(--text-3)", whiteSpace: "nowrap" }}>{formatAgo(item.createdAt)}</span>
          <button className="btn btn-fan btn-ico btn-sm row-action" type="button" aria-label={finished ? "Reabrir" : "Finalizar"} title={finished ? "Reabrir" : "Finalizar"} onClick={onFinish}>
            <Icon name="check" />
          </button>
          <button className="btn btn-fan btn-ico btn-sm row-action" type="button" aria-label="Arquivar" onClick={onArchive}>
            <Icon name="close" />
          </button>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", position: "relative" }}>
          <button className={`plain badge${item.kind ? "" : " r dash"}`} type="button" aria-haspopup="menu" aria-expanded={menuOpen} onClick={onOpenMenu}>
            {item.kind ? (
              <>
                <Dot kind={item.kind} />
                {KIND_LABEL[item.kind]}
              </>
            ) : (
              "Classificar"
            )}
          </button>
          {item.tags.map((tag) => (
            <span key={tag} className="badge out">
              #{tag}
            </span>
          ))}
          <Presence show={menuOpen}><div style={{ position: "absolute", top: 28, left: 0 }}>
              <KindMenu current={item.kind} onPick={onKind} onClose={onCloseMenu} />
            </div></Presence>
        </div>
      </div>
    </div>
  );
}
