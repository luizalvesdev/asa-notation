import { useEffect, useRef, useState, type ReactNode } from "react";

/** Duração da saída; casa com --rapido (140 ms) no CSS. */
export const EXIT_MS = 140;

/**
 * Mantém o conteúdo na tela durante a animação de saída, em vez de sumir de uma vez.
 * Enquanto sai, o conteúdo fica congelado como estava (as props do último render aberto)
 * e recebe `.presence.leaving` (o CSS anima e bloqueia cliques).
 * O mesmo elemento continua montado do aberto até o fim da saída: nada remonta (o que reiniciaria animações).
 */
export function Presence({ show, children }: { show: boolean; children: ReactNode }) {
  const last = useRef<ReactNode>(null);
  const [leaving, setLeaving] = useState(false);
  const [prev, setPrev] = useState(show);

  if (show) last.current = children;
  // Estado derivado no próprio render: no mesmo quadro em que `show` vira false, já está saindo.
  if (prev !== show) {
    setPrev(show);
    setLeaving(!show);
  }

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => {
      setLeaving(false);
      last.current = null;
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [leaving]);

  const out = !show && (leaving || prev !== show);
  if (!show && !out) return null;
  return <div className={`presence${show ? "" : " leaving"}`} style={{ display: "contents" }}>{show ? children : last.current}</div>;
}
