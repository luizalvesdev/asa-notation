import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

// As chaves da Mozilla ficam num arquivo seu, fora do repositório: ~/.config/asa-notation/mozilla.env (modo 600).
//   npm run release:setup -w @asa/extension   guarda as chaves (uma vez)
//   npm run release -w @asa/extension         assina e prepara o updates.json sem pedir nada
// Variáveis WEB_EXT_API_KEY/WEB_EXT_API_SECRET já definidas no ambiente têm prioridade.
const FILE = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "asa-notation", "mozilla.env");

function ask(question, hidden) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : "");
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    }),
  );
}

if (process.argv.includes("--setup")) {
  console.log("Chaves em https://addons.mozilla.org/developers/addon/api/key/ (JWT issuer e JWT secret).");
  const key = await ask("JWT issuer (user:12345:67): ", false);
  const secret = await ask("JWT secret (não aparece enquanto digita): ", true);
  if (!key || !secret) {
    console.error("Nada salvo: as duas chaves são obrigatórias.");
    process.exit(1);
  }
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, `WEB_EXT_API_KEY=${key}\nWEB_EXT_API_SECRET=${secret}\n`, { mode: 0o600 });
  chmodSync(FILE, 0o600);
  console.log(`Salvo em ${FILE}. Agora: npm run release -w @asa/extension`);
  process.exit(0);
}

const env = { ...process.env };
if (existsSync(FILE)) {
  for (const line of readFileSync(FILE, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !env[m[1]]) env[m[1]] = m[2];
  }
}
if (!env.WEB_EXT_API_KEY || !env.WEB_EXT_API_SECRET) {
  console.error(`Sem chaves da Mozilla. Rode uma vez: npm run release:setup -w @asa/extension (guarda em ${FILE}).`);
  process.exit(1);
}

for (const cmd of [["npm", "run", "sign"], ["node", "publish.mjs"]]) {
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
