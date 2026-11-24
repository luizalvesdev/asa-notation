import { useCallback, useEffect, useRef, useState } from "react";
import { notificationsApi } from "./api";
import { armChime, playChime } from "./chime";
import { pushOnHere } from "./push-client";

const POLL_MS = 60_000;

/**
 * Quantas notificações estão por ler. Atualiza a cada minuto e ao voltar para a aba.
 * Se o navegador deu permissão e a aba está em segundo plano, avisa pelo sistema quando chega algo novo
 * (a não ser que este navegador já receba por Web Push, que avisa sozinho).
 */
export function useUnread(): { unread: number; refresh: () => void } {
  const [unread, setUnread] = useState(0);
  const last = useRef<number | null>(null);

  const refresh = useCallback(() => {
    notificationsApi
      .count()
      .then((count) => {
        if (last.current !== null && count > last.current && document.hidden && !pushOnHere() && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification("asa-notation", { body: `${count} ${count === 1 ? "notificação não lida" : "notificações não lidas"}` });
          } catch {
            // alguns navegadores móveis só permitem pelo service worker
          }
        }
        // Algo novo, com a aba à vista ou não: toca o aviso. Com Web Push neste navegador, quem toca é a mensagem do service worker.
        if (last.current !== null && count > last.current && !pushOnHere()) playChime();
        last.current = count;
        setUnread(count);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => !document.hidden && refresh();
    // O service worker avisa quando um push chega: toca e atualiza a contagem na hora.
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "push-received") {
        playChime();
        refresh();
      }
    };
    const disarm = armChime();
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      clearInterval(timer);
      disarm();
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [refresh]);

  return { unread, refresh };
}
