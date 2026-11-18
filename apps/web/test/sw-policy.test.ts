import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// O sw.js é um arquivo simples do navegador (sem módulo): roda aqui num contexto isolado.
const sandbox = { module: { exports: {} as Record<string, unknown> }, URL };
runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), sandbox);
const { strategyFor, CACHEABLE_API } = sandbox.module.exports as {
  strategyFor: (method: string, url: URL, mode: string, origin: string) => string;
  CACHEABLE_API: RegExp;
};

const ORIGIN = "https://asa.example";
const strat = (path: string, method = "GET", mode = "cors", origin = ORIGIN) => strategyFor(method, new URL(path, origin), mode, ORIGIN);

describe("política do service worker", () => {
  it("só guarda leituras de páginas, tarefas, metas e capturas", () => {
    for (const path of ["/api/pages/tree", "/api/pages/123", "/api/tasks?from=a&to=b&today=c", "/api/goals", "/api/captures?kind=idea"]) expect(strat(path)).toBe("data");
  });

  it("nunca guarda login, senha, tokens, configurações, export nem estudo", () => {
    for (const path of ["/api/auth/me", "/api/auth/password/login", "/api/tokens", "/api/settings", "/api/export", "/api/study/queue", "/api/notifications", "/api/pagesx"]) expect(strat(path), path).toBe("bypass");
  });

  it("escritas passam direto", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) expect(strat("/api/pages", method)).toBe("bypass");
  });

  it("outras origens passam direto", () => {
    expect(strat("https://outro.example/api/pages", "GET", "cors")).toBe("bypass");
  });

  it("navegação, arquivos do app e demais recursos", () => {
    expect(strat("/", "GET", "navigate")).toBe("navigate");
    expect(strat("/#/hoje", "GET", "navigate")).toBe("navigate");
    expect(strat("/assets/index-abc.js")).toBe("shell-first");
    expect(strat("/manifest.webmanifest")).toBe("network-first");
  });

  it("a regex não casa prefixos parecidos", () => {
    expect(CACHEABLE_API.test("/api/pageshack")).toBe(false);
    expect(CACHEABLE_API.test("/api/pages")).toBe(true);
  });
});
