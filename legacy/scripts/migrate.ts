import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

const REGION = process.env.AWS_REGION ?? "sa-east-1";
const PARAM = process.env.DATABASE_URL_PARAM ?? "/asa/prod/neon/database-url";
const MIGRATIONS_DIR = new URL("../apps/api/migrations/", import.meta.url);

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return execFileSync(
    "aws",
    ["ssm", "get-parameter", "--region", REGION, "--name", PARAM, "--with-decryption", "--query", "Parameter.Value", "--output", "text"],
    { encoding: "utf8" },
  ).trim();
}

function directUrl(url: string): string {
  return url.replace("-pooler.", ".").replace("sslmode=require", "sslmode=verify-full");
}

async function main() {
  const client = new pg.Client({ connectionString: directUrl(databaseUrl()) });
  await client.connect();
  try {
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const applied = new Set(
      (await client.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name),
    );
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const text = readFileSync(new URL(file, MIGRATIONS_DIR), "utf8");
      await client.query("begin");
      try {
        await client.query(text);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
      console.log(`applied ${file}`);
      ran++;
    }
    if (ran === 0) console.log("nothing to apply");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
