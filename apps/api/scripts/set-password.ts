import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import pg from "pg";
import { hashPassword, validPassword, PASSWORD_MIN_LENGTH } from "../src/auth/password.ts";
import { databaseUrl, directUrl } from "./db.ts";

/** Lê uma linha sem ecoar no terminal. */
function askHidden(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const muted = new Writable({ write: (_chunk, _enc, done) => done() });
  const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
  return new Promise((resolve) => {
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const password = process.env.ASA_PASSWORD ?? (await askHidden("Nova senha: "));
  if (!validPassword(password)) throw new Error(`a senha precisa ter de ${PASSWORD_MIN_LENGTH} a 200 caracteres`);
  if (process.env.ASA_PASSWORD === undefined && (await askHidden("Repita a senha: ")) !== password) {
    throw new Error("as senhas não conferem");
  }

  const client = new pg.Client({ connectionString: directUrl(databaseUrl()) });
  await client.connect();
  try {
    await client.query(
      `insert into owner_password (id, hash, failed_count, locked_until, updated_at)
       values (1, $1, 0, null, now())
       on conflict (id) do update
         set hash = excluded.hash, failed_count = 0, locked_until = null, updated_at = now()`,
      [await hashPassword(password)],
    );
    console.log("senha gravada");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
