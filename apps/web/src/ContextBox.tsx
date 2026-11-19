import type { HTMLAttributes } from "react";
import type { LocalItem } from "./context-menu";
import { useContextItems } from "./use-context-items";

/** Um `div` com ações próprias no botão direito, para linhas de listas montadas dentro de um map. */
export function ContextBox({ items, ...rest }: { items: () => LocalItem[] } & HTMLAttributes<HTMLDivElement>) {
  const ref = useContextItems(items);
  return <div ref={ref} {...rest} />;
}
