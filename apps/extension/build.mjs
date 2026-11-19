import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

// Monta a extensão em dist/: os scripts empacotados e os arquivos estáticos.
const out = "dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/icons`, { recursive: true });
cpSync("static", out, { recursive: true });

// Ícones a partir do ícone do app.
const src = "../web/public/icons/icon-192.png";
for (const size of [48, 96]) {
  try {
    execFileSync("magick", [src, "-resize", `${size}x${size}`, `${out}/icons/icon-${size}.png`]);
  } catch {
    cpSync(src, `${out}/icons/icon-${size}.png`);
  }
}

await build({
  entryPoints: { popup: "src/popup.ts", options: "src/options.ts", content: "src/content.ts" },
  outdir: out,
  bundle: true,
  format: "iife",
  target: "firefox142",
  minify: false,
  legalComments: "inline",
  logLevel: "warning",
});
console.log("Extensão montada em apps/extension/dist");
