import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { createApp } from "./app.js";
import { aiConfigFromEnv } from "./ai/provider.js";
import { mockProvider } from "./dev-ai-mock.js";
import { DEFAULT_SESSION_TTL_SECONDS, type AuthConfig } from "./auth/config.js";
import { hashPassword } from "./auth/password.js";
import { PgAuthStore } from "./auth/store.js";
import type { ApiRequest } from "./http.js";
import { readMigrations } from "./migrations.js";
import type { SqlClient } from "./sql.js";

// Este arquivo é empacotado em .dev/dev-server.mjs (ver `npm run dev -w @asa/api`).
const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.DEV_DATA_DIR ?? fileURLToPath(new URL("./pgdata", import.meta.url));
const MIGRATIONS_DIR = new URL("../apps/api/migrations/", import.meta.url);
const MAX_BODY_BYTES = 1_000_000;

const config: AuthConfig = {
  origins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173").split(",").map((o) => o.trim()),
  sessionSecret: process.env.SESSION_SECRET ?? "dev-session-secret-not-for-production-use",
  secureCookies: false,
  sessionTtlSeconds: DEFAULT_SESSION_TTL_SECONDS,
};

async function openDatabase(): Promise<PGlite> {
  const db = new PGlite(DATA_DIR, { extensions: { unaccent } });
  await db.exec("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const applied = new Set((await db.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  for (const migration of readMigrations(MIGRATIONS_DIR)) {
    if (applied.has(migration.name)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.query("insert into schema_migrations (name) values ($1)", [migration.name]);
    });
    console.log(`applied ${migration.name}`);
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

// Primeiro uso do banco local: sem senha cadastrada, gera uma e mostra uma única vez.
const auth = new PgAuthStore(sql);
let generatedPassword: string | null = null;
if (!(await auth.getPassword())) {
  generatedPassword = process.env.DEV_PASSWORD ?? randomBytes(12).toString("base64url");
  await auth.setPassword(await hashPassword(generatedPassword), new Date().toISOString());
}

// ASA_AI_MOCK=1 troca o provedor de IA por uma versão de mentira (sem chave nem internet).
const handle = createApp({ sql, config, ai: aiConfigFromEnv(process.env), ...(process.env.ASA_AI_MOCK ? { fetchImpl: mockProvider } : {}) });

const server = createServer(async (incoming, outgoing) => {
  const send = (status: number, body: unknown, cookies?: string[]) => {
    outgoing.statusCode = status;
    outgoing.setHeader("content-type", "application/json");
    if (cookies && cookies.length > 0) outgoing.setHeader("set-cookie", cookies);
    outgoing.end(JSON.stringify(body));
  };

  try {
    const url = new URL(incoming.url ?? "/", "http://localhost");
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
  console.log(`allowed origins: ${config.origins.join(", ")}`);
  if (generatedPassword) console.log(`senha de desenvolvimento (só aparece agora): ${generatedPassword}`);
});
