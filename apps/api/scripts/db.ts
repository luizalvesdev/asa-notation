import { execFileSync } from "node:child_process";

const REGION = process.env.AWS_REGION ?? "sa-east-1";
const PARAM = process.env.DATABASE_URL_PARAM ?? "/asa-notation/database-url";

/** URL do banco: DATABASE_URL, ou o parâmetro do SSM (usa o `aws` CLI já autenticado). */
export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return execFileSync(
    "aws",
    ["ssm", "get-parameter", "--region", REGION, "--name", PARAM, "--with-decryption", "--query", "Parameter.Value", "--output", "text"],
    { encoding: "utf8" },
  ).trim();
}

/** Conexão direta (sem pooler) para migrações e manutenção. */
export function directUrl(url: string): string {
  return url.replace("-pooler.", ".").replace("sslmode=require", "sslmode=verify-full");
}
