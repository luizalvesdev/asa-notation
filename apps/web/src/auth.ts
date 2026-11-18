import type { LoginResult } from "./login-state";

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!res.ok) return false;
    const data: unknown = await res.json();
    return typeof data === "object" && data !== null && (data as { authenticated?: unknown }).authenticated === true;
  } catch {
    return false;
  }
}

export async function loginWithPassword(password: string): Promise<LoginResult> {
  let res: Response;
  try {
    res = await postJson("/api/auth/password/login", { password });
  } catch {
    return { kind: "offline" };
  }
  if (res.ok) return { kind: "ok" };
  if (res.status === 429) {
    const data = (await res.json().catch(() => null)) as { retryAfterSeconds?: unknown } | null;
    const seconds = typeof data?.retryAfterSeconds === "number" ? data.retryAfterSeconds : 60;
    return { kind: "locked", retryAfterSeconds: seconds };
  }
  const data = (await res.json().catch(() => null)) as { remaining?: unknown } | null;
  return typeof data?.remaining === "number" ? { kind: "invalid", remaining: data.remaining } : { kind: "invalid" };
}

export async function logout(): Promise<void> {
  try {
    await postJson("/api/auth/logout", {});
  } catch {
    // sem rede: o cookie expira sozinho
  }
}
