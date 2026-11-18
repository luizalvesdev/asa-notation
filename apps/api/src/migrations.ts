import { readdirSync, readFileSync } from "node:fs";

export interface Migration {
  name: string;
  sql: string;
}

/** Lê os arquivos .sql da pasta, em ordem alfabética (001_, 002_, ...). */
export function readMigrations(dir: URL): Migration[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(new URL(name, dir), "utf8") }));
}
