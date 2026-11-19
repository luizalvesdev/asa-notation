import { useEffect, useState } from "react";
import { readStoredWidth, type SizeLimits } from "./panel-size";

/** Largura de um painel que sobrevive ao recarregar a página (só neste navegador). */
export function useStoredWidth(key: string, limits: SizeLimits): [number, (width: number) => void] {
  const [width, setWidth] = useState(() => {
    try {
      return readStoredWidth(localStorage.getItem(key), limits);
    } catch {
      return limits.initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(width));
    } catch {
      // vale só nesta sessão
    }
  }, [key, width]);
  return [width, setWidth];
}
