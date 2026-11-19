import { useCallback, useRef } from "react";
import { registerContextItems, type LocalItem } from "./context-menu";

/**
 * Liga ações ao botão direito de um elemento: `<div ref={useContextItems(() => [...])}>`.
 * A lista é montada na hora do clique, com o estado mais recente.
 */
export function useContextItems<T extends Element = HTMLDivElement>(get: () => LocalItem[]) {
  const latest = useRef(get);
  latest.current = get;
  return useCallback((el: T | null) => {
    if (el) registerContextItems(el, () => latest.current());
  }, []);
}
