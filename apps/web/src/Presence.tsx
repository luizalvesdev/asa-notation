import { useEffect, useRef, useState, type ReactNode } from "react";

/** Duração da saída; casa com --rapido (140 ms) no CSS. */
export const EXIT_MS = 140;

/**
 * Mantém o conteúdo na tela durante a animação de saída, em vez de sumir de uma vez.
 * Enquanto sai, o conteúdo fica congelado como estava (as props do último render aberto)
 * e recebe `.presence.leaving` (o CSS anima e bloqueia cliques).
 */
export function Presence({ show, children }: { show: boolean; children: ReactNode }) {
  const last = useRef<ReactNode>(null);
  const [leaving, setLeaving] = useState(false);
  const wasShown = useRef(show);

  if (show) last.current = children;

  useEffect(() => {
    if (show) {
      wasShown.current = true;
      setLeaving(false);
      return;
    }
    if (!wasShown.current) return;
    wasShown.current = false;
    setLeaving(true);
    const t = window.setTimeout(() => {
      setLeaving(false);
      last.current = null;
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [show]);

  if (!show && !leaving) return null;
  return <div className={`presence${show ? "" : " leaving"}`} style={{ display: "contents" }}>{show ? children : last.current}</div>;
}
