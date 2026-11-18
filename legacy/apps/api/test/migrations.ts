import { readdirSync, readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";

const DIR = new URL("../migrations/", import.meta.url);

export async function applyMigrations(db: PGlite): Promise<void> {
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, DIR), "utf8"));
  }
}
