import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// `--mode demo`: a API roda no navegador (src/demo), sem servidor. Os módulos de Node viram versões de navegador.
export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    plugins: [react()],
    server: {
      port: demo ? 5174 : 5173,
      strictPort: true,
      ...(demo ? {} : { proxy: { "/api": "http://127.0.0.1:8787" } }),
    },
    ...(demo
      ? {
          resolve: {
            alias: {
              "node:crypto": here("./src/demo/node-crypto.ts"),
              "node:fs": here("./src/demo/empty.ts"),
              "@aws-sdk/client-bedrock-runtime": here("./src/demo/empty.ts"),
            },
          },
          define: { "import.meta.env.VITE_DEMO": JSON.stringify("1") },
          optimizeDeps: { exclude: ["@electric-sql/pglite"] },
          build: { outDir: "dist-demo", rollupOptions: { input: here("./demo.html") } },
        }
      : {}),
  };
});
