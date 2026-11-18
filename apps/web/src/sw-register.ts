/** Registra o service worker só no build de produção (em desenvolvimento ele atrapalha o hot reload). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

/** Apaga os dados em cache (páginas, tarefas...) deste navegador. Chamado no logout. */
export function clearOfflineData(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "clear-data-cache" });
  } catch {
    // sem service worker: nada a limpar
  }
}
