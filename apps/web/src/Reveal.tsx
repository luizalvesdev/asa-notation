import { useEffect, useRef, useState, type ReactNode } from "react";

/** Casa com --medio (220 ms) no CSS. */
export const REVEAL_MS = 220;

type Phase = "closed" | "start" | "growing" | "open" | "closing";

/**
 * Bloco que aparece no meio da página (formulário de nova trilha, nova meta, aviso...):
 * abre crescendo e fecha encolhendo, empurrando o resto aos poucos em vez de dar um salto.
 * Enquanto fecha, o conteúdo fica congelado como estava.
 */
export function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(show ? "open" : "closed");
  const last = useRef<ReactNode>(null);
  if (show) last.current = children;

  useEffect(() => {
    let frame = 0;
    let timer = 0;
    if (show) {
      setPhase((p) => (p === "open" ? p : "start"));
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setPhase((p) => (p === "open" ? p : "growing")));
      });
      timer = window.setTimeout(() => setPhase("open"), REVEAL_MS + 40);
    } else {
      setPhase((p) => (p === "closed" ? p : "closing"));
      timer = window.setTimeout(() => {
        setPhase("closed");
        last.current = null;
      }, REVEAL_MS);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [show]);

  if (phase === "closed" && !show) return null;
  const cls = phase === "growing" ? " on" : phase === "open" ? " on done" : "";
  return (
    <div className={`reveal${cls}`} aria-hidden={!show || undefined}>
      <div className="reveal-in">{show ? children : last.current}</div>
    </div>
  );
}
