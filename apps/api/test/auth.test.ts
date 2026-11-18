import { beforeEach, describe, expect, it } from "vitest";
import { LOCK_SECONDS, MAX_FAILURES_BEFORE_LOCK } from "../src/auth/routes.js";
import { CONFIG, PASSWORD, cookieValue, createTestApp, setCookie, type TestApp } from "./helpers.js";

let app: TestApp;

beforeEach(async () => {
  app = await createTestApp();
});

describe("GET /auth/me", () => {
  it("diz que não há sessão e se existe senha", async () => {
    const res = await app.call("GET", "/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: false, hasPassword: true });
  });

  it("reconhece a sessão depois do login", async () => {
    const cookies = await app.owner();
    const res = await app.call("GET", "/auth/me", { cookies });
    expect(res.body).toEqual({ authenticated: true, hasPassword: true });
  });

  it("informa quando a senha ainda não foi cadastrada", async () => {
    const empty = await createTestApp({ withPassword: false });
    expect((await empty.call("GET", "/auth/me")).body).toEqual({ authenticated: false, hasPassword: false });
  });

  it("aceita o prefixo /api", async () => {
    const res = await app.call("GET", "/api/auth/me");
    expect(res.status).toBe(200);
  });
});

describe("POST /auth/password/login", () => {
  it("entra com a senha certa e emite cookie seguro", async () => {
    const res = await app.login();
    expect(res.status).toBe(200);
    const cookie = setCookie(res.cookies, "asa_session")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain(`Max-Age=${CONFIG.sessionTtlSeconds}`);
  });

  it("recusa senha errada e informa as tentativas restantes", async () => {
    const res = await app.login("senha-errada-123456");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized", remaining: MAX_FAILURES_BEFORE_LOCK - 1 });
    expect(res.cookies).toBeUndefined();
  });

  it("bloqueia depois de 5 falhas, mesmo com a senha certa, e libera depois do prazo", async () => {
    for (let i = 1; i < MAX_FAILURES_BEFORE_LOCK; i++) expect((await app.login("errada-errada-1")).status).toBe(401);
    const locked = await app.login("errada-errada-1");
    expect(locked.status).toBe(429);
    expect(locked.body).toEqual({ error: "locked", retryAfterSeconds: LOCK_SECONDS });

    app.clock.ms += 60_000;
    const still = await app.login();
    expect(still.status).toBe(429);
    expect((still.body as { retryAfterSeconds: number }).retryAfterSeconds).toBe(LOCK_SECONDS - 60);

    app.clock.ms += LOCK_SECONDS * 1000;
    expect((await app.login()).status).toBe(200);
  });

  it("zera as falhas depois de um login certo", async () => {
    await app.login("errada-errada-1");
    await app.login("errada-errada-1");
    await app.login();
    const res = await app.login("errada-errada-1");
    expect((res.body as { remaining: number }).remaining).toBe(MAX_FAILURES_BEFORE_LOCK - 1);
  });

  it("valida o corpo", async () => {
    expect((await app.call("POST", "/auth/password/login", { body: {} })).status).toBe(400);
    expect((await app.call("POST", "/auth/password/login", { body: { password: "" } })).status).toBe(400);
    expect((await app.call("POST", "/auth/password/login", { body: { password: "x".repeat(201) } })).status).toBe(400);
  });

  it("não entra quando nenhuma senha foi cadastrada", async () => {
    const empty = await createTestApp({ withPassword: false });
    expect((await empty.login()).status).toBe(401);
  });

  it("recusa origem desconhecida ou ausente (CSRF)", async () => {
    const other = await app.call("POST", "/auth/password/login", { body: { password: PASSWORD }, origin: "https://evil.example" });
    expect(other.status).toBe(403);
    const none = await app.call("POST", "/auth/password/login", { body: { password: PASSWORD }, origin: null });
    expect(none.status).toBe(403);
  });
});

describe("sessão", () => {
  it("rejeita cookie adulterado", async () => {
    const cookies = await app.owner();
    const tampered = { asa_session: `${cookies.asa_session}x` };
    expect((await app.call("GET", "/pages/tree", { cookies: tampered })).status).toBe(401);
  });

  it("expira depois do prazo", async () => {
    const cookies = await app.owner();
    app.clock.ms += (CONFIG.sessionTtlSeconds + 1) * 1000;
    expect((await app.call("GET", "/pages/tree", { cookies })).status).toBe(401);
  });

  it("logout limpa o cookie", async () => {
    const res = await app.call("POST", "/auth/logout");
    expect(res.status).toBe(200);
    expect(setCookie(res.cookies, "asa_session")).toContain("Max-Age=0");
    expect(cookieValue(res.cookies, "asa_session")).toBeUndefined();
  });

  it("exige sessão nas rotas de páginas", async () => {
    expect((await app.call("GET", "/pages/tree")).status).toBe(401);
    expect((await app.call("POST", "/pages", { body: {} })).status).toBe(401);
  });
});

describe("POST /auth/password/change", () => {
  const NEW_PASSWORD = "outra-senha-bem-longa-456";

  it("troca a senha e a antiga deixa de valer", async () => {
    const cookies = await app.owner();
    const res = await app.call("POST", "/auth/password/change", {
      cookies,
      body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(res.status).toBe(200);
    expect((await app.login()).status).toBe(401);
    expect((await app.login(NEW_PASSWORD)).status).toBe(200);
  });

  it("exige a senha atual e conta a falha", async () => {
    const cookies = await app.owner();
    const res = await app.call("POST", "/auth/password/change", {
      cookies,
      body: { currentPassword: "errada-errada-1", newPassword: NEW_PASSWORD },
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "wrong_password", remaining: MAX_FAILURES_BEFORE_LOCK - 1 });
  });

  it("recusa senha nova curta", async () => {
    const cookies = await app.owner();
    const res = await app.call("POST", "/auth/password/change", {
      cookies,
      body: { currentPassword: PASSWORD, newPassword: "curta" },
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_new_password" });
  });

  it("exige sessão", async () => {
    const res = await app.call("POST", "/auth/password/change", { body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } });
    expect(res.status).toBe(401);
  });
});

describe("roteamento", () => {
  it("404 para rota desconhecida e 405 para método errado", async () => {
    expect((await app.call("GET", "/nada")).status).toBe(404);
    expect((await app.call("GET", "/auth/logout")).status).toBe(405);
  });
});
