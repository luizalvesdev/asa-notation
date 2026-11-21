import { useSyncExternalStore } from "react";

/**
 * Aviso de "os dados mudaram por fora da tela" (ex.: um assistente criou tarefa, meta ou card).
 * Cada tela que lê dados do servidor usa `useDataVersion()` como dependência do carregamento e se atualiza sozinha, sem F5.
 */
let version = 0;
const listeners = new Set<() => void>();

export function notifyDataChanged(): void {
  version += 1;
  for (const l of [...listeners]) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useDataVersion = (): number => useSyncExternalStore(subscribe, () => version);
