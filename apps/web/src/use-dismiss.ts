import { useEffect, type RefObject } from "react";

/** Fecha um menu ao clicar fora ou apertar Esc. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!ref.current || ref.current.contains(target)) return;
      // O próprio botão que abriu (aria-expanded="true") cuida de fechar no clique; fechar aqui faria ele reabrir.
      if (target?.closest?.('[aria-expanded="true"]')) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, onClose]);
}
