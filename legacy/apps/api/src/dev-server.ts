import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { DEFAULT_SESSION_TTL_SECONDS, SESSION_COOKIE, type AuthConfig } from "./auth/config.js";
import { PgAuthStore } from "./auth/pg-store.js";
import { serializeCookie, signToken } from "./auth/tokens.js";
import { simpleWebAuthn } from "./auth/webauthn.js";
import type { ApiRequest } from "./http.js";
import { PgPageStore } from "./pg-store.js";
import { createRouter } from "./router.js";
import type { SqlClient } from "./sql.js";

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.DEV_DATA_DIR ?? ".dev/pgdata";
const MIGRATIONS_DIR = join(process.cwd(), "apps/api/migrations");
const MAX_BODY_BYTES = 1_000_000;

const config: AuthConfig = {
  rpId: process.env.RP_ID ?? "localhost",
  rpName: "asa-notation (dev)",
  origins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173").split(",").map((o) => o.trim()),
  sessionSecret: process.env.SESSION_SECRET ?? "dev-session-secret-not-for-production-use",
  bootstrapToken: process.env.BOOTSTRAP_TOKEN ?? "dev-bootstrap-token-0000000000",
  secureCookies: false,
  sessionTtlSeconds: DEFAULT_SESSION_TTL_SECONDS,
};

async function openDatabase(): Promise<PGlite> {
  const db = new PGlite(DATA_DIR);
  await db.exec("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const applied = new Set((await db.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      await tx.query("insert into schema_migrations (name) values ($1)", [file]);
    });
    console.log(`applied ${file}`);
  }
  return db;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
}

async function readBody(stream: AsyncIterable<Buffer>): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const db = await openDatabase();
const sql: SqlClient = {
  query: async (text, params) => (await db.query(text, params)).rows as Record<string, unknown>[],
};
const handle = createRouter({
  store: new PgPageStore(sql),
  auth: new PgAuthStore(sql),
  webauthn: simpleWebAuthn,
  config,
});

const server = createServer(async (incoming, outgoing) => {
  const send = (status: number, body: unknown, cookies?: string[]) => {
    outgoing.statusCode = status;
    outgoing.setHeader("content-type", "application/json");
    if (cookies && cookies.length > 0) outgoing.setHeader("set-cookie", cookies);
    outgoing.end(JSON.stringify(body));
  };

  try {
    const url = new URL(incoming.url ?? "/", "http://localhost");

    if (process.env.DEV_LOGIN === "1" && url.pathname === "/dev/login") {
      const exp = Math.floor(Date.now() / 1000) + config.sessionTtlSeconds;
      const cookie = serializeCookie(SESSION_COOKIE, signToken({ typ: "session", exp }, config.sessionSecret), {
        maxAge: config.sessionTtlSeconds,
        secure: false,
      });
      outgoing.statusCode = 302;
      outgoing.setHeader("set-cookie", cookie);
      outgoing.setHeader("location", config.origins[0] ?? "/");
      return outgoing.end();
    }

    const raw = await readBody(incoming);
    if (raw === null) return send(413, { error: "payload_too_large" });

    let body: unknown;
    if (raw !== "") {
      try {
        body = JSON.parse(raw);
      } catch {
        return send(400, { error: "invalid_json" });
      }
    }

    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of Object.entries(incoming.headers)) {
      headers[name] = Array.isArray(value) ? value.join(", ") : value;
    }
    const req: ApiRequest = {
      method: incoming.method ?? "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers,
      cookies: parseCookies(incoming.headers.cookie),
      body,
    };
    const res = await handle(req);
    send(res.status, res.body, res.cookies);
  } catch (err) {
    console.error(err);
    send(500, { error: "internal_error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`api (dev) listening on http://localhost:${PORT}`);
  console.log(`bootstrap token: ${config.bootstrapToken}`);
  console.log(`allowed origins: ${config.origins.join(", ")}`);
});
