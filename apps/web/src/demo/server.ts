// A API do asa-notation rodando dentro do navegador, sobre um Postgres em WebAssembly (PGlite).
// Nada sai daqui: a IA, o push e qualquer chamada externa da API recebem um fetch que sempre falha.
import "./buffer-global";
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { createApp } from "../../../api/src/app";
import { DEFAULT_SESSION_TTL_SECONDS, SESSION_COOKIE, type AuthConfig } from "../../../api/src/auth/config";
import { signToken } from "../../../api/src/auth/tokens";
import { sseEvent, type ApiRequest, type ApiResponse } from "../../../api/src/http";
import type { SqlClient } from "../../../api/src/sql";
import { seedDemo } from "./seed";

const DB_NAME = "asa-demo-v1";
const SECRET = "asa-demo-runs-only-in-this-browser";

const MIGRATIONS = Object.entries(import.meta.glob<string>("../../../api/migrations/*.sql", { query: "?raw", import: "default", eager: true }))
  .map(([path, sql]) => ({ name: path.split("/").pop()!, sql }))
  .sort((a, b) => a.name.localeCompare(b.name));

const offline = async (): Promise<never> => {
  throw new Error("demo: no network");
};

let db: PGlite | null = null;

async function migrate(pg: PGlite): Promise<void> {
  await pg.exec("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const applied = new Set((await pg.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    await pg.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query("insert into schema_migrations (name) values ($1)", [m.name]);
    });
  }
}

/** O conteúdo inicial só conta como criado depois que termina: uma aba fechada no meio deixa o banco sem a marca. */
async function seeded(pg: PGlite): Promise<boolean> {
  await pg.exec("create table if not exists demo_seeded (at timestamptz not null default now())");
  return (await pg.query("select 1 from demo_seeded limit 1")).rows.length > 0;
}

function deleteDatabase(): Promise<void> {
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(`/pglite/${DB_NAME}`);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

const open = () => new PGlite(`idb://${DB_NAME}`, { extensions: { unaccent } });

/** Sobe o banco, aplica as migrações, cria o conteúdo inicial na primeira vez e passa a responder o `/api` no lugar da rede. */
export async function bootDemo(): Promise<void> {
  db = open();
  const fresh = !(await seeded(db));
  if (fresh) {
    // Começo do zero, mesmo que uma visita anterior tenha parado no meio.
    await db.close();
    await deleteDatabase();
    db = open();
  }
  await migrate(db);
  const pg = db;
  const sql: SqlClient = { query: async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[] };

  const config: AuthConfig = { origins: [location.origin], sessionSecret: SECRET, secureCookies: false, sessionTtlSeconds: DEFAULT_SESSION_TTL_SECONDS };
  const app = createApp({ sql, config, fetchImpl: offline, pushFetch: offline });
  // Sessão sempre aberta: a demo não tem senha nem sai da conta.
  const session = signToken({ typ: "session", exp: Math.floor(Date.now() / 1000) + 10 * 365 * 86_400 }, SECRET);
  const api = (req: ApiRequest) => app({ ...req, headers: { origin: location.origin, ...req.headers }, cookies: { ...req.cookies, [SESSION_COOKIE]: session } });

  if (fresh) {
    await seedDemo(api);
    await seeded(pg);
    await pg.query("insert into demo_seeded default values");
  }
  installFetch(api);
}

/** Apaga o banco da demo e recarrega a página com o conteúdo inicial. */
export async function resetDemo(): Promise<void> {
  await db?.close().catch(() => undefined);
  await deleteDatabase();
  location.reload();
}

function toResponse(res: ApiResponse): Response {
  if (res.stream) {
    const events = res.stream;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of events) controller.enqueue(encoder.encode(sseEvent(event)));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(body, { status: res.status, headers: { "content-type": "text/event-stream" } });
  }
  return new Response(JSON.stringify(res.body ?? null), { status: res.status, headers: { "content-type": "application/json" } });
}

function installFetch(api: (req: ApiRequest) => Promise<ApiResponse>): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, name) => (headers[name] = value));
    let body: unknown;
    if (typeof init?.body === "string" && init.body !== "") {
      try {
        body = JSON.parse(init.body);
      } catch {
        return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
      }
    }
    try {
      return toResponse(await api({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers, cookies: {}, body }));
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: "internal_error" }), { status: 500 });
    }
  };
}
