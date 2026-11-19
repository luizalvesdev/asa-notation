import { useCallback, useEffect, useRef, useState } from "react";
import { notificationsApi } from "./api";
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
        last.current = count;
        setUnread(count);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { unread, refresh };
}
