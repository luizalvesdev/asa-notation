import { defineConfig } from "vitest/config";

export default defineConfig({
  // Cada teste de API sobe um PGlite (WebAssembly): poucos workers para não sobrecarregar a máquina.
  test: { include: ["apps/*/test/**/*.test.{ts,tsx}"], maxWorkers: 4 },
});
