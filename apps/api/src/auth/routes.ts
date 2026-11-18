import { badRequest, json, unauthorized, isRecord, type Route } from "../routing.js";
import { DEFAULT_SESSION_TTL_SECONDS, SESSION_COOKIE, type AuthConfig } from "./config.js";
import { PASSWORD_MAX_LENGTH, hashPassword, validPassword, verifyPassword } from "./password.js";
import type { PasswordState, PgAuthStore } from "./store.js";
import { serializeCookie, signToken } from "./tokens.js";

export const MAX_FAILURES_BEFORE_LOCK = 5;
export const LOCK_SECONDS = 15 * 60;

interface Deps {
  auth: PgAuthStore;
  config: AuthConfig;
}

function isLocked(state: PasswordState, nowMs: number): boolean {
  return state.lockedUntil !== null && Date.parse(state.lockedUntil) > nowMs;
}

const lockedResponse = (until: string, nowMs: number) =>
  json(429, { error: "locked", retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(until) - nowMs) / 1000)) });

export function authRoutes({ auth, config }: Deps): Route[] {
  const ttl = config.sessionTtlSeconds || DEFAULT_SESSION_TTL_SECONDS;

  const sessionCookie = (nowMs: number) =>
    serializeCookie(
      SESSION_COOKIE,
      signToken({ typ: "session", exp: Math.floor(nowMs / 1000) + ttl }, config.sessionSecret),
      { maxAge: ttl, secure: config.secureCookies },
    );
  const clearCookie = () => serializeCookie(SESSION_COOKIE, "", { maxAge: 0, secure: config.secureCookies });

  /** Registra uma senha errada e devolve a resposta HTTP correspondente. */
  async function failure(nowMs: number, wrongStatus: 401 | 403) {
    const lockUntil = new Date(nowMs + LOCK_SECONDS * 1000).toISOString();
    const result = await auth.recordFailure(MAX_FAILURES_BEFORE_LOCK, lockUntil);
    if (result && result.failedCount % MAX_FAILURES_BEFORE_LOCK === 0) return lockedResponse(lockUntil, nowMs);
    const remaining = MAX_FAILURES_BEFORE_LOCK - ((result?.failedCount ?? 0) % MAX_FAILURES_BEFORE_LOCK);
    return wrongStatus === 401 ? unauthorized({ remaining }) : json(403, { error: "wrong_password", remaining });
  }

  return [
    {
      method: "GET",
      pattern: /^\/auth\/me$/,
      access: "public",
      handle: async ({ authenticated }) =>
        json(200, { authenticated, hasPassword: (await auth.getPassword()) !== null }),
    },
    {
      method: "POST",
      pattern: /^\/auth\/password\/login$/,
      access: "public",
      handle: async ({ req, now }) => {
        const password = isRecord(req.body) ? req.body.password : undefined;
        if (typeof password !== "string" || password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
          return badRequest("invalid_password");
        }
        const state = await auth.getPassword();
        if (!state) return unauthorized();
        if (isLocked(state, now)) return lockedResponse(state.lockedUntil!, now);
        if (!(await verifyPassword(password, state.hash))) return failure(now, 401);
        await auth.resetFailures();
        return json(200, { ok: true }, [sessionCookie(now)]);
      },
    },
    {
      method: "POST",
      pattern: /^\/auth\/password\/change$/,
      access: "session",
      handle: async ({ req, now }) => {
        const body = isRecord(req.body) ? req.body : {};
        const { currentPassword, newPassword } = body;
        if (typeof currentPassword !== "string" || currentPassword.length > PASSWORD_MAX_LENGTH) {
          return badRequest("invalid_password");
        }
        if (!validPassword(newPassword)) return badRequest("invalid_new_password");
        const state = await auth.getPassword();
        if (!state) return unauthorized();
        if (isLocked(state, now)) return lockedResponse(state.lockedUntil!, now);
        if (!(await verifyPassword(currentPassword, state.hash))) return failure(now, 403);
        await auth.setPassword(await hashPassword(newPassword), new Date(now).toISOString());
        return json(200, { ok: true });
      },
    },
    {
      method: "POST",
      pattern: /^\/auth\/logout$/,
      access: "public",
      handle: async () => json(200, { ok: true }, [clearCookie()]),
    },
  ];
}
