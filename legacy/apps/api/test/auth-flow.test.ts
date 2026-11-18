import { beforeEach, describe, expect, it } from "vitest";
import { CONFIG, cookieValue, createApp, setCookie } from "./helpers.js";

describe("auth flow", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  describe("anonymous access", () => {
    it("reports no session and no passkeys", async () => {
      const res = await app.call("GET", "/auth/me");
      expect(res).toEqual({ status: 200, body: { authenticated: false, hasPasskeys: false, hasPassword: false } });
    });

    it.each(["/sync/head", "/changes", "/devices"])("%s requires authentication", async (path) => {
      expect((await app.call("GET", path)).status).toBe(401);
    });
  });

  describe("bootstrap registration", () => {
    it("rejects a missing or wrong bootstrap token", async () => {
      expect((await app.call("POST", "/auth/passkey/register/options")).status).toBe(401);
      const wrong = await app.call("POST", "/auth/passkey/register/options", {
        headers: { "x-bootstrap-token": "x".repeat(30) },
      });
      expect(wrong.status).toBe(401);
    });

    it("issues a challenge cookie that is HttpOnly, Secure and SameSite=Strict", async () => {
      const res = await app.call("POST", "/auth/passkey/register/options", {
        headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
      });
      expect(res.status).toBe(200);
      const cookie = setCookie(res.cookies, "asa_challenge")!;
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Max-Age=300");
    });

    it("registers the first passkey and starts a session", async () => {
      const { verify, session } = await app.bootstrap();
      expect(verify.status).toBe(200);
      expect(session).toBeDefined();
      const me = await app.call("GET", "/auth/me", { cookies: { asa_session: session } });
      expect(me.body).toEqual({ authenticated: true, hasPasskeys: true, hasPassword: false });
      expect((await app.auth.listPasskeys()).map((p) => p.name)).toEqual(["laptop"]);
    });

    it("session cookie is HttpOnly, Secure, SameSite=Strict and lasts the configured TTL", async () => {
      const { verify } = await app.bootstrap();
      const cookie = setCookie(verify.cookies, "asa_session")!;
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain(`Max-Age=${CONFIG.sessionTtlSeconds}`);
    });

    it("closes the bootstrap once a passkey exists", async () => {
      await app.bootstrap();
      const again = await app.call("POST", "/auth/passkey/register/options", {
        headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
      });
      expect(again.status).toBe(403);
      expect(again.body).toEqual({ error: "bootstrap_closed" });
    });

    it("closes the bootstrap even when the challenge was issued before the first registration", async () => {
      const options = await app.call("POST", "/auth/passkey/register/options", {
        headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
      });
      const challenge = (options.body as { challenge: string }).challenge;
      const cookie = cookieValue(options.cookies, "asa_challenge");
      await app.bootstrap("first", "cred-1");
      const late = await app.call("POST", "/auth/passkey/register/verify", {
        cookies: { asa_challenge: cookie },
        body: { response: { id: "cred-2", challenge } },
      });
      expect(late.status).toBe(403);
      expect(await app.auth.listPasskeys()).toHaveLength(1);
    });

    it("lets a signed-in owner add another passkey without the bootstrap token", async () => {
      const cookies = await app.ownerCookies();
      const options = await app.call("POST", "/auth/passkey/register/options", { cookies });
      expect(options.status).toBe(200);
      const verify = await app.call("POST", "/auth/passkey/register/verify", {
        cookies: { ...cookies, asa_challenge: cookieValue(options.cookies, "asa_challenge") },
        body: { name: "phone", response: { id: "cred-2", challenge: (options.body as { challenge: string }).challenge } },
      });
      expect(verify.status).toBe(200);
      expect((await app.auth.listPasskeys()).map((p) => p.name)).toEqual(["laptop", "phone"]);
    });

    it("rejects verification without a challenge cookie", async () => {
      const res = await app.call("POST", "/auth/passkey/register/verify", {
        body: { response: { id: "cred-1", challenge: "reg-1" } },
      });
      expect(res.status).toBe(400);
    });

    it("rejects a tampered challenge cookie", async () => {
      const options = await app.call("POST", "/auth/passkey/register/options", {
        headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
      });
      const cookie = cookieValue(options.cookies, "asa_challenge")!;
      const res = await app.call("POST", "/auth/passkey/register/verify", {
        cookies: { asa_challenge: `${cookie}x` },
        body: { response: { id: "cred-1", challenge: "reg-1" } },
      });
      expect(res.status).toBe(400);
    });

    it("rejects an expired challenge", async () => {
      const options = await app.call("POST", "/auth/passkey/register/options", {
        headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
      });
      app.clock.ms += 301_000;
      const res = await app.call("POST", "/auth/passkey/register/verify", {
        cookies: { asa_challenge: cookieValue(options.cookies, "asa_challenge") },
        body: { response: { id: "cred-1", challenge: (options.body as { challenge: string }).challenge } },
      });
      expect(res.status).toBe(400);
    });

    it("stores nothing when the authenticator response does not verify", async () => {
      const options = await app.call("POST", "/auth/passkey/register/options", {
        headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
      });
      const res = await app.call("POST", "/auth/passkey/register/verify", {
        cookies: { asa_challenge: cookieValue(options.cookies, "asa_challenge") },
        body: { response: { id: "cred-1", challenge: "wrong" } },
      });
      expect(res.status).toBe(400);
      expect(await app.auth.listPasskeys()).toHaveLength(0);
    });

    it("validates the body and the passkey name", async () => {
      const options = await app.call("POST", "/auth/passkey/register/options", {
        headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
      });
      const cookies = { asa_challenge: cookieValue(options.cookies, "asa_challenge") };
      expect((await app.call("POST", "/auth/passkey/register/verify", { cookies, body: { response: "x" } })).status).toBe(400);
      expect((await app.call("POST", "/auth/passkey/register/verify", { cookies })).status).toBe(400);
      const badName = await app.call("POST", "/auth/passkey/register/verify", {
        cookies,
        body: { name: "x".repeat(61), response: { id: "c", challenge: "reg-1" } },
      });
      expect(badName.status).toBe(400);
    });
  });

  describe("login", () => {
    it("has nothing to offer before a passkey exists", async () => {
      expect((await app.call("POST", "/auth/passkey/login/options")).status).toBe(404);
    });

    it("signs in with a registered passkey and bumps the counter", async () => {
      await app.bootstrap();
      const { verify, session } = await app.login();
      expect(verify.status).toBe(200);
      expect(session).toBeDefined();
      expect((await app.auth.listPasskeys())[0]?.counter).toBe(1);
      const res = await app.call("GET", "/sync/head", { cookies: { asa_session: session } });
      expect(res.status).toBe(200);
    });

    it("rejects an unknown credential", async () => {
      await app.bootstrap();
      const { verify } = await app.login("unknown");
      expect(verify.status).toBe(401);
      expect(verify.cookies).toBeUndefined();
    });

    it("rejects a response that does not verify", async () => {
      await app.bootstrap();
      const options = await app.call("POST", "/auth/passkey/login/options");
      const res = await app.call("POST", "/auth/passkey/login/verify", {
        cookies: { asa_challenge: cookieValue(options.cookies, "asa_challenge") },
        body: { response: { id: "cred-1", challenge: "wrong" } },
      });
      expect(res.status).toBe(401);
    });

    it("does not accept a register challenge for login", async () => {
      await app.bootstrap();
      const options = await app.call("POST", "/auth/passkey/register/options", {
        headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
      });
      expect(options.status).toBe(403);
      const cookies = await (async () => {
        const { session } = await app.login();
        return { asa_session: session };
      })();
      const reg = await app.call("POST", "/auth/passkey/register/options", { cookies });
      const res = await app.call("POST", "/auth/passkey/login/verify", {
        cookies: { asa_challenge: cookieValue(reg.cookies, "asa_challenge") },
        body: { response: { id: "cred-1", challenge: (reg.body as { challenge: string }).challenge } },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("sessions", () => {
    it("expires after the TTL", async () => {
      const cookies = await app.ownerCookies();
      expect((await app.call("GET", "/sync/head", { cookies })).status).toBe(200);
      app.clock.ms += (CONFIG.sessionTtlSeconds + 1) * 1000;
      expect((await app.call("GET", "/sync/head", { cookies })).status).toBe(401);
    });

    it("rejects a forged session cookie", async () => {
      const cookies = await app.ownerCookies();
      const forged = { asa_session: `${cookies.asa_session}x` };
      expect((await app.call("GET", "/sync/head", { cookies: forged })).status).toBe(401);
    });

    it("does not accept a challenge token as a session", async () => {
      const options = await app.call("POST", "/auth/passkey/register/options", {
        headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
      });
      const challenge = cookieValue(options.cookies, "asa_challenge");
      const res = await app.call("GET", "/sync/head", { cookies: { asa_session: challenge } });
      expect(res.status).toBe(401);
    });

    it("logout clears the session cookie", async () => {
      const res = await app.call("POST", "/auth/logout");
      expect(setCookie(res.cookies, "asa_session")).toContain("Max-Age=0");
    });
  });

  describe("origin check", () => {
    it("rejects state-changing requests without an allowed Origin", async () => {
      const cookies = await app.ownerCookies();
      const none = await app.call("POST", "/devices", { cookies, origin: null, body: { name: "d", scope: "sync" } });
      const wrong = await app.call("POST", "/devices", {
        cookies,
        origin: "https://evil.example",
        body: { name: "d", scope: "sync" },
      });
      expect(none.status).toBe(403);
      expect(wrong.status).toBe(403);
    });

    it("also protects public auth endpoints", async () => {
      const res = await app.call("POST", "/auth/passkey/login/options", { origin: "https://evil.example" });
      expect(res.status).toBe(403);
    });
  });

  describe("device tokens", () => {
    async function createToken(cookies: Record<string, string>, scope: string, name = "daemon") {
      const res = await app.call("POST", "/devices", { cookies, body: { name, scope } });
      return res;
    }

    const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

    it("creates a token, shows it once and never lists its secret", async () => {
      const cookies = await app.ownerCookies();
      const created = await createToken(cookies, "sync");
      expect(created.status).toBe(201);
      const body = created.body as { id: string; token: string; scope: string };
      expect(body.token).toMatch(/^asa_[A-Za-z0-9_-]{40,}$/);

      const list = await app.call("GET", "/devices", { cookies });
      const text = JSON.stringify(list.body);
      expect(text).toContain(body.id);
      expect(text).not.toContain(body.token);
      expect(text).not.toContain("tokenHash");
    });

    it("lets full and sync tokens read the sync endpoints", async () => {
      const cookies = await app.ownerCookies();
      for (const scope of ["full", "sync"]) {
        const { token } = (await createToken(cookies, scope)).body as { token: string };
        expect((await app.call("GET", "/sync/head", { headers: bearer(token) })).status).toBe(200);
        expect((await app.call("GET", "/changes", { headers: bearer(token) })).status).toBe(200);
      }
    });

    it("forbids bot tokens on the sync endpoints", async () => {
      const cookies = await app.ownerCookies();
      const { token } = (await createToken(cookies, "bot")).body as { token: string };
      expect((await app.call("GET", "/sync/head", { headers: bearer(token) })).status).toBe(403);
    });

    it("never lets a device token manage devices or passkeys", async () => {
      const cookies = await app.ownerCookies();
      const { token } = (await createToken(cookies, "full")).body as { token: string };
      expect((await app.call("GET", "/devices", { headers: bearer(token) })).status).toBe(403);
      expect(
        (await app.call("POST", "/devices", { headers: bearer(token), body: { name: "x", scope: "full" } })).status,
      ).toBe(403);
      const options = await app.call("POST", "/auth/passkey/register/options", { headers: bearer(token) });
      expect(options.status).toBe(401);
    });

    it("rejects revoked, unknown and malformed tokens", async () => {
      const cookies = await app.ownerCookies();
      const created = (await createToken(cookies, "sync")).body as { id: string; token: string };
      expect((await app.call("GET", "/sync/head", { headers: bearer(created.token) })).status).toBe(200);

      const revoked = await app.call("DELETE", "/devices/" + created.id, { cookies });
      expect(revoked.status).toBe(200);
      expect((await app.call("GET", "/sync/head", { headers: bearer(created.token) })).status).toBe(401);

      expect((await app.call("GET", "/sync/head", { headers: bearer("asa_unknown") })).status).toBe(401);
      expect((await app.call("GET", "/sync/head", { headers: { authorization: "Basic abc" } })).status).toBe(401);
      expect((await app.call("GET", "/sync/head", { headers: { authorization: "Bearer " } })).status).toBe(401);
    });

    it("does not fall back to the session when a bad bearer is sent", async () => {
      const cookies = await app.ownerCookies();
      const res = await app.call("GET", "/sync/head", { cookies, headers: bearer("asa_wrong") });
      expect(res.status).toBe(401);
    });

    it("answers 404 when revoking something that does not exist", async () => {
      const cookies = await app.ownerCookies();
      const res = await app.call("DELETE", "/devices/00000000-0000-0000-0000-000000000000", { cookies });
      expect(res.status).toBe(404);
    });

    it("validates name and scope", async () => {
      const cookies = await app.ownerCookies();
      expect((await createToken(cookies, "admin")).status).toBe(400);
      expect((await app.call("POST", "/devices", { cookies, body: { name: "", scope: "sync" } })).status).toBe(400);
      expect((await app.call("POST", "/devices", { cookies, body: { scope: "sync" } })).status).toBe(400);
      expect((await app.call("POST", "/devices", { cookies })).status).toBe(400);
    });
  });
});
