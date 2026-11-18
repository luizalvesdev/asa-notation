import { useEffect, useRef, useState } from "react";
import { pagesApi } from "./api";
import { publicHash } from "./nav";
import { useDismiss } from "./use-dismiss";

interface SharePopoverProps {
  pageId: string;
  onClose: () => void;
}

export function SharePopover({ pageId, onClose }: SharePopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, true, onClose);
  const [share, setShare] = useState<{ slug: string; views: number } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    pagesApi
      .share(pageId)
      .then((s) => live && setShare(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [pageId]);

  const toggle = async () => {
    setBusy(true);
    setFailed(false);
    try {
      setShare(share ? (await pagesApi.disableShare(pageId), null) : await pagesApi.enableShare(pageId));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const link = share ? `${location.origin}/${publicHash(share.slug)}` : "";

  return (
    <div ref={ref} className="menu on" role="dialog" aria-label="Compartilhar" style={{ position: "absolute", top: 34, right: 0, width: 360, padding: 16, display: "flex", flexDirection: "column", gap: 12, zIndex: 40 }}>
      <b style={{ fontWeight: 600 }}>Compartilhar por link público</b>
      <button className="tog" type="button" role="switch" aria-checked={!!share} disabled={busy || share === undefined} onClick={() => void toggle()} style={{ padding: 0, color: "var(--text)", justifyContent: "space-between", width: "100%", height: "auto", minHeight: 36 }}>
        <span className="col" style={{ textAlign: "left" }}>
          <span style={{ fontSize: 13 }}>Publicar na web</span>
          <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 400 }}>Qualquer pessoa com o link pode ler</span>
        </span>
        <span className={`sw${share ? " on" : ""}`}><span className="knob" /></span>
      </button>
      {share && (
        <div className="col enter" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <input className="inp mono" readOnly value={link} aria-label="Link público" onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 12 }} />
            <button className="btn btn-sec btn-sm" type="button" onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setFailed(true))}>{copied ? "Copiado" : "Copiar"}</button>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-2)" }}>Somente leitura · subpáginas não incluídas · {share.views} {share.views === 1 ? "visita" : "visitas"}</span>
        </div>
      )}
      {failed && <span role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>Não foi possível concluir. Tente de novo.</span>}
    </div>
  );
}
