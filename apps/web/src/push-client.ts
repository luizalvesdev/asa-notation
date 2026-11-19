import { pushApi } from "./api";

/** Web Push com o app fechado: precisa de service worker, PushManager e permissão de notificação. */

export type PushSupport = "ok" | "no-sw" | "unsupported" | "ios-install";

export function pushSupport(): PushSupport {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;
  // No iPhone o push só existe no app instalado na tela de início (iOS 16.4+).
  if (!("PushManager" in window)) return ios && !standalone ? "ios-install" : "unsupported";
  if (!import.meta.env.PROD && !navigator.serviceWorker.controller) return "no-sw";
  return "ok";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Nome curto do aparelho para a lista em Configurações. */
export function deviceLabel(ua = navigator.userAgent): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} no ${os}` : browser;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ok") return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

const FLAG = "asa-push-on";

/** Este navegador recebe push? Usado para não repetir o aviso da aba aberta. */
export function pushOnHere(): boolean {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

function setFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(FLAG, "1");
    else localStorage.removeItem(FLAG);
  } catch {
    // sem armazenamento: só perde a deduplicação do aviso da aba
  }
}

export type EnableResult = "ok" | "denied";

export async function enablePush(): Promise<EnableResult> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const { publicKey } = await pushApi.get();
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Inscrição feita com outra chave (servidor recriou as chaves): refaz.
  const key = sub?.options.applicationServerKey;
  if (sub && key && btoa(String.fromCharCode(...new Uint8Array(key))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== publicKey) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await pushApi.subscribe(sub.toJSON(), deviceLabel());
  setFlag(true);
  return "ok";
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (sub) {
    await pushApi.unsubscribe(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe();
  }
  setFlag(false);
}
