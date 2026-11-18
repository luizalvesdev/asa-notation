import { useEffect, useMemo, useState } from "react";
import { pagesApi } from "./api";
import { blockLines, diffLines } from "./doc-diff";
import { DocView } from "./DocView";
import { Icon } from "./icons";
import { formatAgo } from "./time-utils";

interface HistoryPanelProps {
  pageId: string;
  /** Conteúdo salvo agora, para comparar. */
  currentBody: unknown;
  onClose: () => void;
  /** Chamado depois de restaurar, para a página recarregar. */
  onRestored: () => void;
}

type Item = { id: number; title: string; createdAt: string; excerpt: string };
type Full = { id: number; title: string; body: unknown; createdAt: string };

export function HistoryPanel({ pageId, currentBody, onClose, onRestored }: HistoryPanelProps) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [version, setVersion] = useState<Full | null>(null);
  const [view, setView] = useState<"diff" | "full">("diff");
  const [busy, setBusy] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);

  useEffect(() => {
    let live = true;
    pagesApi
      .versions(pageId)
      .then((list) => live && setItems(list))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [pageId]);

  useEffect(() => {
    if (picked === null) return;
    let live = true;
    setVersion(null);
    pagesApi
      .version(pageId, picked)
      .then((v) => live && setVersion(v))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [pageId, picked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const diff = useMemo(() => (version ? diffLines(blockLines(version.body), blockLines(currentBody)) : []), [version, currentBody]);
  const changes = diff.filter((d) => d.type !== "same").length;

  const restore = async () => {
    if (picked === null || busy) return;
    setBusy(true);
    setRestoreFailed(false);
    try {
      await pagesApi.restoreVersion(pageId, picked);
      onRestored();
    } catch {
      setRestoreFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="side-panel" aria-label="Versões da página">
      <div className="row" style={{ padding: "14px 16px 8px" }}>
        <b style={{ fontWeight: 600, fontSize: 14 }}>Versões</b>
        <button className="btn btn-fan btn-ico btn-sm" type="button" aria-label="Fechar" onClick={onClose} style={{ marginLeft: "auto" }}>
          <Icon name="close" />
        </button>
      </div>

      <div style={{ padding: "0 8px", maxHeight: "38%", overflow: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
        {items === null && !failed && <span className="sk" style={{ height: 16, margin: "8px", display: "block" }} aria-label="Carregando as versões" />}
        {failed && <span role="alert" style={{ padding: 12, fontSize: 13, color: "var(--danger)" }}>Não foi possível carregar o histórico.</span>}
        {items?.length === 0 && <span style={{ padding: 12, fontSize: 13, color: "var(--text-2)" }}>Ainda não há versões. Elas são guardadas a cada 10 minutos de edição.</span>}
        {items?.map((v) => (
          <button key={v.id} className={`plain mrow${picked === v.id ? " sel" : ""}`} type="button" onClick={() => setPicked(v.id)} style={{ height: "auto", padding: "8px 10px", alignItems: "flex-start", flexDirection: "column", gap: 2, textAlign: "left" }}>
            <span style={{ fontWeight: 500 }}>{formatAgo(v.createdAt)}</span>
            <span className="trunc" style={{ fontSize: 12, color: "var(--text-3)", maxWidth: "100%" }}>{v.excerpt || v.title || "Sem conteúdo"}</span>
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, borderTop: "1px solid var(--border)", marginTop: 8, display: "flex", flexDirection: "column" }}>
        {picked === null && <p className="muted" style={{ padding: 16, fontSize: 13 }}>Escolha uma versão para comparar com a atual.</p>}
        {picked !== null && !version && !failed && <span className="sk" style={{ height: 80, margin: 16, display: "block" }} />}
        {version && (
          <>
            <div className="row" style={{ padding: "10px 16px", gap: 8 }}>
              <div className="seg" role="tablist" aria-label="Modo">
                <span className="seg-ind" style={{ width: "calc((100% - 4px) / 2)", transform: `translateX(${view === "diff" ? 0 : 100}%)` }} />
                <button className={`seg-b${view === "diff" ? " on" : ""}`} type="button" role="tab" aria-selected={view === "diff"} onClick={() => setView("diff")}>Diferenças</button>
                <button className={`seg-b${view === "full" ? " on" : ""}`} type="button" role="tab" aria-selected={view === "full"} onClick={() => setView("full")}>Versão</button>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>{view === "diff" ? (changes === 0 ? "igual à atual" : `${changes} ${changes === 1 ? "mudança" : "mudanças"}`) : ""}</span>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "0 16px 16px", fontSize: 14, lineHeight: "22px" }}>
              {view === "diff" ? (
                <div className="col" style={{ gap: 4 }}>
                  {diff.length === 0 && <span className="muted">Sem conteúdo para comparar.</span>}
                  {diff.map((d, i) => (
                    <div key={i} className={d.type === "add" ? "diff-add" : d.type === "del" ? "diff-del" : undefined} style={{ overflowWrap: "anywhere" }}>
                      {d.type === "add" && <span className="badge ok" style={{ height: 16, marginRight: 6, fontSize: 10 }}>atual</span>}
                      {d.type === "del" && <span className="badge bad" style={{ height: 16, marginRight: 6, fontSize: 10, textDecoration: "none" }}>nesta versão</span>}
                      {d.text}
                    </div>
                  ))}
                </div>
              ) : (
                <DocView doc={version.body} />
              )}
            </div>
            <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
              {restoreFailed && <span role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>Não foi possível restaurar.</span>}
              <button className="btn btn-pri" type="button" disabled={busy} onClick={() => void restore()}>Restaurar esta versão</button>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>O conteúdo de agora fica guardado como uma versão.</span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
