import { execFileSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import { PgPageStore } from "../apps/api/src/pg-store.js";

const REGION = process.env.AWS_REGION ?? "sa-east-1";
const PARAM = process.env.DATABASE_URL_PARAM ?? "/asa/prod/neon/database-url";

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return execFileSync(
    "aws",
    ["ssm", "get-parameter", "--region", REGION, "--name", PARAM, "--with-decryption", "--query", "Parameter.Value", "--output", "text"],
    { encoding: "utf8" },
  ).trim();
}

const sql = neon(databaseUrl());
const client = { query: async (text: string, params?: unknown[]) => (await sql.query(text, params)) as Record<string, unknown>[] };

const tables = await client.query(
  "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
);
console.log("tables:", tables.map((t) => t.table_name).join(", "));

const migrations = await client.query("select name from schema_migrations order by name");
console.log("migrations:", migrations.map((m) => m.name).join(", "));

const store = new PgPageStore(client);
console.log("head:", await store.head());
console.log("changes:", JSON.stringify(await store.changes(0, 5)));
