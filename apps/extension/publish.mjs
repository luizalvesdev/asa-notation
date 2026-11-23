import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Depois de `npm run sign`: copia o .xpi assinado para o site e escreve o updates.json que o
// Firefox/Zen consulta (update_url do manifest). Publicar = deploy normal da web.
const SITE = "https://asa.luizalves.dev";
const manifest = JSON.parse(readFileSync("static/manifest.json", "utf8"));
const id = manifest.browser_specific_settings.gecko.id;
const version = manifest.version;
const signedDir = "../../.dev/extension";
const outDir = "../web/public/extension";

// O assinado é "<hash>-<versão>.xpi"; o .zip do `package` não serve (não tem assinatura).
const signed = readdirSync(signedDir)
  .filter((f) => f.endsWith(`-${version}.xpi`))
  .map((f) => ({ f, t: statSync(`${signedDir}/${f}`).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];
if (!signed) {
  console.error(`Não achei o .xpi assinado da versão ${version} em .dev/extension. Rode o sign antes.`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith(".xpi")) rmSync(`${outDir}/${f}`);
const name = `salvar-no-asa-${version}.xpi`;
copyFileSync(`${signedDir}/${signed.f}`, `${outDir}/${name}`);
const hash = createHash("sha256").update(readFileSync(`${outDir}/${name}`)).digest("hex");
const updates = { addons: { [id]: { updates: [{ version, update_link: `${SITE}/extension/${name}`, update_hash: `sha256:${hash}` }] } } };
writeFileSync(`${outDir}/updates.json`, `${JSON.stringify(updates, null, 2)}\n`);
console.log(`Pronto: ${name} e updates.json em apps/web/public/extension. Agora o deploy da web.`);
