import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { CONFIG, cookieValue, createApp } from "./helpers.js";

const GOOD = "uma senha bem longa";
const OTHER = "outra senha comprida";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword(GOOD);
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword(GOOD, hash)).toBe(true);
    expect(await verifyPassword(OTHER, hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword(GOOD)).not.toBe(await hashPassword(GOOD));
  });

  it("treats composed and decomposed accents as the same password", async () => {
    const hash = await hashPassword("açúcar e café 123");
    expect(await verifyPassword("açúcar e café 123", hash)).toBe(true);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword(GOOD, "plain")).toBe(false);
    expect(await verifyPassword(GOOD, "bcrypt$1$2$3$4$5")).toBe(false);
  });
});

describe("password login", () => {
  let app: ReturnType<typeof createApp>;

  const bootstrapPassword = (password: string, token = CONFIG.bootstrapToken) =>
    app.call("POST", "/auth/password/set", { headers: { "x-bootstrap-token": token }, body: { password } });
  const login = (password: string) => app.call("POST", "/auth/password/login", { body: { password } });

  beforeEach(() => {
    app = createApp();
  });

  describe("first access", () => {
    it("sets the password with the bootstrap token and starts a session", async () => {
      const res = await bootstrapPassword(GOOD);
      expect(res.status).toBe(200);
      const session = cookieValue(res.cookies, "asa_session");
      expect(session).toBeDefined();
      const me = await app.call("GET", "/auth/me", { cookies: { asa_session: session } });
      expect(me.body).toEqual({ authenticated: true, hasPasskeys: false, hasPassword: true });
    });

    it("rejects a missing or wrong bootstrap token", async () => {
      expect((await app.call("POST", "/auth/password/set", { body: { password: GOOD } })).status).toBe(401);
      expect((await bootstrapPassword(GOOD, "x".repeat(30))).status).toBe(401);
    });

    it("requires at least 12 characters", async () => {
      const res = await bootstrapPassword("curta");
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "invalid_password" });
      expect((await bootstrapPassword("x".repeat(201))).status).toBe(400);
    });

    it("closes the bootstrap once any credential exists", async () => {
      await bootstrapPassword(GOOD);
      expect((await bootstrapPassword(OTHER)).status).toBe(403);
      const passkey = await app.call("POST", "/auth/passkey/register/options", {
        headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
      });
      expect(passkey.status).toBe(403);
    });

    it("cannot be used after a passkey was registered", async () => {
      await app.bootstrap();
      const res = await bootstrapPassword(GOOD);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "bootstrap_closed" });
    });
  });

  describe("login", () => {
    beforeEach(async () => {
      await bootstrapPassword(GOOD);
    });

    it("starts a session with the right password", async () => {
      const res = await login(GOOD);
      expect(res.status).toBe(200);
      const session = cookieValue(res.cookies, "asa_session");
      expect((await app.call("GET", "/sync/head", { cookies: { asa_session: session } })).status).toBe(200);
    });

    it("rejects a wrong password without a cookie", async () => {
      const res = await login(OTHER);
      expect(res.status).toBe(401);
      expect(res.cookies).toBeUndefined();
    });

    it("locks for 15 minutes after 5 wrong attempts, even for the right password", async () => {
      for (let i = 0; i < 4; i++) expect((await login(OTHER)).status).toBe(401);
      const fifth = await login(OTHER);
      expect(fifth.status).toBe(429);
      expect(fifth.body).toEqual({ error: "locked", retryAfterSeconds: 900 });
      expect((await login(GOOD)).status).toBe(429);
      app.clock.ms += 15 * 60 * 1000 + 1000;
      expect((await login(GOOD)).status).toBe(200);
    });

    it("forgives earlier failures after a successful login", async () => {
      for (let i = 0; i < 4; i++) await login(OTHER);
      expect((await login(GOOD)).status).toBe(200);
      for (let i = 0; i < 4; i++) expect((await login(OTHER)).status).toBe(401);
    });

    it("requires an allowed Origin", async () => {
      const res = await app.call("POST", "/auth/password/login", { body: { password: GOOD }, origin: null });
      expect(res.status).toBe(403);
    });

    it("answers 401 when no password was ever set", async () => {
      const fresh = createApp();
      expect((await fresh.call("POST", "/auth/password/login", { body: { password: GOOD } })).status).toBe(401);
    });

    it("validates the payload", async () => {
      expect((await app.call("POST", "/auth/password/login", { body: {} })).status).toBe(400);
      expect((await login("")).status).toBe(400);
    });
  });

  describe("changing the password", () => {
    it("requires the current password", async () => {
      const session = cookieValue((await bootstrapPassword(GOOD)).cookies, "asa_session");
      const cookies = { asa_session: session };
      const wrong = await app.call("POST", "/auth/password/set", {
        cookies,
        body: { password: OTHER, currentPassword: "nao e essa senha" },
      });
      expect(wrong.status).toBe(403);
      const missing = await app.call("POST", "/auth/password/set", { cookies, body: { password: OTHER } });
      expect(missing.status).toBe(403);

      const ok = await app.call("POST", "/auth/password/set", { cookies, body: { password: OTHER, currentPassword: GOOD } });
      expect(ok.status).toBe(200);
      expect((await login(GOOD)).status).toBe(401);
      expect((await login(OTHER)).status).toBe(200);
    });

    it("lets an owner signed in with a passkey add a password", async () => {
      const cookies = await app.ownerCookies();
      const res = await app.call("POST", "/auth/password/set", { cookies, body: { password: GOOD } });
      expect(res.status).toBe(200);
      expect((await login(GOOD)).status).toBe(200);
    });

    it("does not let device tokens set passwords", async () => {
      const cookies = await app.ownerCookies();
      const { token } = (await app.call("POST", "/devices", { cookies, body: { name: "d", scope: "full" } })).body as {
        token: string;
      };
      const res = await app.call("POST", "/auth/password/set", {
        headers: { authorization: `Bearer ${token}` },
        body: { password: GOOD },
      });
      expect(res.status).toBe(401);
    });
  });
});
