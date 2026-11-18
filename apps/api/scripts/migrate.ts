import pg from "pg";
import { readMigrations } from "../src/migrations.ts";
import { databaseUrl, directUrl } from "./db.ts";

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);

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
    let ran = 0;
    for (const migration of readMigrations(MIGRATIONS_DIR)) {
      if (applied.has(migration.name)) continue;
      await client.query("begin");
      try {
        await client.query(migration.sql);
        await client.query("insert into schema_migrations (name) values ($1)", [migration.name]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
      console.log(`applied ${migration.name}`);
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
