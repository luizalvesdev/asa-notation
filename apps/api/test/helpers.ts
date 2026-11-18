import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import type { FetchLike } from "../src/ai/anthropic.js";
import type { AiConfig, BedrockInvoke } from "../src/ai/bedrock.js";
import { createApp } from "../src/app.js";
import type { AuthConfig } from "../src/auth/config.js";
import { hashPassword } from "../src/auth/password.js";
import { PgAuthStore } from "../src/auth/store.js";
import type { ApiResponse } from "../src/http.js";
import { readMigrations } from "../src/migrations.js";
import type { SqlClient } from "../src/sql.js";

export const ORIGIN = "http://localhost:5173";
export const PASSWORD = "uma-senha-bem-longa-123";

export const CONFIG: AuthConfig = {
  origins: [ORIGIN],
  sessionSecret: "s".repeat(40),
  secureCookies: true,
  sessionTtlSeconds: 3600,
};

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);

export async function openDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { unaccent } });
  for (const migration of readMigrations(MIGRATIONS_DIR)) await db.exec(migration.sql);
  return db;
}

export interface CallInit {
  query?: Record<string, string>;
  headers?: Record<string, string>;
  cookies?: Record<string, string | undefined>;
  body?: unknown;
  /** `null` omite o cabeçalho Origin. */
  origin?: string | null;
}

export async function createTestApp(options: { withPassword?: boolean; fetchImpl?: FetchLike; ai?: AiConfig; bedrockInvoke?: BedrockInvoke } = {}) {
  const db = await openDb();
  const sql: SqlClient = { query: async (text, params) => (await db.query(text, params)).rows as Record<string, unknown>[] };
  const clock = { ms: Date.UTC(2026, 10, 18, 12, 0, 0) };
  const auth = new PgAuthStore(sql);
  if (options.withPassword !== false) await auth.setPassword(await hashPassword(PASSWORD), new Date(clock.ms).toISOString());
  const handle = createApp({ sql, config: CONFIG, now: () => clock.ms, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}), ...(options.ai ? { ai: options.ai } : {}), ...(options.bedrockInvoke ? { bedrockInvoke: options.bedrockInvoke } : {}) });

  async function call(method: string, path: string, init: CallInit = {}): Promise<ApiResponse> {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    const origin = init.origin === undefined ? ORIGIN : init.origin;
    if (method !== "GET" && origin !== null) headers.origin = origin;
    const cookies: Record<string, string> = {};
    for (const [key, value] of Object.entries(init.cookies ?? {})) if (value !== undefined) cookies[key] = value;
    return handle({ method, path, query: init.query ?? {}, headers, cookies, body: init.body });
  }

  async function login(password = PASSWORD): Promise<ApiResponse> {
    return call("POST", "/auth/password/login", { body: { password } });
  }

  /** Faz login e devolve os cookies da sessão. */
  async function owner(): Promise<Record<string, string>> {
    const res = await login();
    const session = cookieValue(res.cookies, "asa_session");
    if (!session) throw new Error("login did not issue a session");
    return { asa_session: session };
  }

  return { call, login, owner, clock, db, sql, auth };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export function cookieValue(setCookies: string[] | undefined, name: string): string | undefined {
  const entry = setCookies?.find((c) => c.startsWith(`${name}=`));
  if (!entry) return undefined;
  const value = entry.slice(name.length + 1).split(";")[0] ?? "";
  return value === "" ? undefined : value;
}

export function setCookie(setCookies: string[] | undefined, name: string): string | undefined {
  return setCookies?.find((c) => c.startsWith(`${name}=`));
}

export function doc(...paragraphs: string[]) {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
  };
}
