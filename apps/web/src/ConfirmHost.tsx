import { useEffect, useRef, useState } from "react";
import { setConfirmHost, type ConfirmRequest } from "./confirm";
import { Presence } from "./Presence";

/** O modal de confirmação de exclusões. Enter confirma, Esc ou clicar fora cancela. */
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setConfirmHost((next) => setReq((cur) => {
      cur?.resolve(false);
      return next;
    }));
    return () => setConfirmHost(null);
  }, []);

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  useEffect(() => {
    if (!req) return;
    requestAnimationFrame(() => confirmBtn.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  return (
    <Presence show={req !== null}>
      {req && (
        <div className="checkin-scrim" style={{ zIndex: 120 }} onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div className="checkin-box confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={req.body ? "confirm-body" : undefined}>
            <h2 id="confirm-title">{req.title}</h2>
            {req.body && <p id="confirm-body">{req.body}</p>}
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-fan" type="button" onClick={() => close(false)}>
                Cancelar <span className="kbd">esc</span>
              </button>
              <button ref={confirmBtn} className="btn btn-perigo" type="button" onClick={() => close(true)}>
                {req.confirmLabel ?? "Excluir"} <span className="kbd">enter</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </Presence>
  );
}
