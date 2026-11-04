import { beforeEach, describe, expect, it } from "vitest";
import { simpleWebAuthn } from "../src/auth/webauthn.js";
import { CONFIG, cookieValue, createApp, ORIGIN } from "./helpers.js";
import { SoftAuthenticator } from "./soft-authenticator.js";

const RP = { rpId: "localhost", origins: [ORIGIN] };
const OWNER = new Uint8Array(16);

async function newRegistration(authenticator: SoftAuthenticator, overrides: { origin?: string; rpId?: string; userVerified?: boolean } = {}) {
  const { challenge } = await simpleWebAuthn.registrationOptions({ rpId: RP.rpId, rpName: "asa", userName: "owner", userId: OWNER, exclude: [] });
  const response = authenticator.register({
    challenge,
    origin: overrides.origin ?? ORIGIN,
    rpId: overrides.rpId ?? RP.rpId,
    userVerified: overrides.userVerified,
  });
  return { challenge, response };
}

describe("simpleWebAuthn adapter with a software authenticator", () => {
  let authenticator: SoftAuthenticator;

  beforeEach(() => {
    authenticator = new SoftAuthenticator();
  });

  describe("registration", () => {
    it("accepts a valid registration and returns the credential", async () => {
      const { challenge, response } = await newRegistration(authenticator);
      const result = await simpleWebAuthn.verifyRegistration({ response, challenge, ...RP });
      expect(result).toMatchObject({ credentialId: authenticator.id, counter: 0, transports: ["internal"] });
      expect(result!.publicKey.length).toBeGreaterThan(0);
    });

    it("rejects a different origin, rpId or challenge", async () => {
      const { challenge, response } = await newRegistration(authenticator);
      expect(await simpleWebAuthn.verifyRegistration({ response, challenge, rpId: RP.rpId, origins: ["https://evil.example"] })).toBeNull();
      expect(await simpleWebAuthn.verifyRegistration({ response, challenge, rpId: "example.com", origins: RP.origins })).toBeNull();
      expect(await simpleWebAuthn.verifyRegistration({ response, challenge: "other", ...RP })).toBeNull();
    });

    it("rejects an authenticator that did not verify the user", async () => {
      const { challenge, response } = await newRegistration(authenticator, { userVerified: false });
      expect(await simpleWebAuthn.verifyRegistration({ response, challenge, ...RP })).toBeNull();
    });

    it("rejects garbage without throwing", async () => {
      expect(await simpleWebAuthn.verifyRegistration({ response: { id: "x" }, challenge: "c", ...RP })).toBeNull();
      expect(await simpleWebAuthn.verifyRegistration({ response: null, challenge: "c", ...RP })).toBeNull();
    });
  });

  describe("authentication", () => {
    async function registered() {
      const { challenge, response } = await newRegistration(authenticator);
      const credential = (await simpleWebAuthn.verifyRegistration({ response, challenge, ...RP }))!;
      return { id: credential.credentialId, publicKey: credential.publicKey, counter: credential.counter, transports: credential.transports };
    }

    async function loginChallenge(credentialId: string) {
      return (await simpleWebAuthn.authenticationOptions({ rpId: RP.rpId, allow: [{ id: credentialId, transports: [] }] })).challenge;
    }

    it("accepts a valid assertion and reports the new counter", async () => {
      const credential = await registered();
      const challenge = await loginChallenge(credential.id);
      const response = authenticator.assert({ challenge, origin: ORIGIN, rpId: RP.rpId, counter: 1 });
      expect(await simpleWebAuthn.verifyAuthentication({ response, challenge, ...RP, credential })).toEqual({ newCounter: 1 });
    });

    it("rejects a replayed counter", async () => {
      const credential = { ...(await registered()), counter: 1 };
      const challenge = await loginChallenge(credential.id);
      const response = authenticator.assert({ challenge, origin: ORIGIN, rpId: RP.rpId, counter: 1 });
      expect(await simpleWebAuthn.verifyAuthentication({ response, challenge, ...RP, credential })).toBeNull();
    });

    it("rejects a signature from another key", async () => {
      const credential = await registered();
      const challenge = await loginChallenge(credential.id);
      const impostor = new SoftAuthenticator();
      const response = { ...impostor.assert({ challenge, origin: ORIGIN, rpId: RP.rpId, counter: 1 }), id: authenticator.id, rawId: authenticator.id };
      expect(await simpleWebAuthn.verifyAuthentication({ response, challenge, ...RP, credential })).toBeNull();
    });

    it("rejects a wrong challenge, origin or missing user verification", async () => {
      const credential = await registered();
      const challenge = await loginChallenge(credential.id);
      const good = authenticator.assert({ challenge, origin: ORIGIN, rpId: RP.rpId, counter: 1 });
      expect(await simpleWebAuthn.verifyAuthentication({ response: good, challenge: "other", ...RP, credential })).toBeNull();
      expect(await simpleWebAuthn.verifyAuthentication({ response: good, challenge, rpId: RP.rpId, origins: ["https://evil.example"], credential })).toBeNull();
      const noUv = authenticator.assert({ challenge, origin: ORIGIN, rpId: RP.rpId, counter: 1, userVerified: false });
      expect(await simpleWebAuthn.verifyAuthentication({ response: noUv, challenge, ...RP, credential })).toBeNull();
    });
  });
});

describe("full flow through the router with real WebAuthn verification", () => {
  it("bootstraps, registers, then logs in again", async () => {
    const app = createApp(simpleWebAuthn);
    const authenticator = new SoftAuthenticator();

    const options = await app.call("POST", "/auth/passkey/register/options", {
      headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
    });
    expect(options.status).toBe(200);
    const registerChallenge = (options.body as { challenge: string }).challenge;
    const registered = await app.call("POST", "/auth/passkey/register/verify", {
      cookies: { asa_challenge: cookieValue(options.cookies, "asa_challenge") },
      body: { name: "soft", response: authenticator.register({ challenge: registerChallenge, origin: ORIGIN, rpId: CONFIG.rpId }) },
    });
    expect(registered.status).toBe(200);
    expect(cookieValue(registered.cookies, "asa_session")).toBeDefined();

    const loginOptions = await app.call("POST", "/auth/passkey/login/options");
    const loginChallenge = (loginOptions.body as { challenge: string }).challenge;
    const login = await app.call("POST", "/auth/passkey/login/verify", {
      cookies: { asa_challenge: cookieValue(loginOptions.cookies, "asa_challenge") },
      body: { response: authenticator.assert({ challenge: loginChallenge, origin: ORIGIN, rpId: CONFIG.rpId, counter: 1 }) },
    });
    expect(login.status).toBe(200);
    const session = cookieValue(login.cookies, "asa_session");
    expect((await app.call("GET", "/sync/head", { cookies: { asa_session: session } })).status).toBe(200);
    expect((await app.auth.listPasskeys())[0]?.counter).toBe(1);
  });

  it("a different authenticator cannot log in as the owner", async () => {
    const app = createApp(simpleWebAuthn);
    const owner = new SoftAuthenticator();
    const options = await app.call("POST", "/auth/passkey/register/options", {
      headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
    });
    await app.call("POST", "/auth/passkey/register/verify", {
      cookies: { asa_challenge: cookieValue(options.cookies, "asa_challenge") },
      body: { response: owner.register({ challenge: (options.body as { challenge: string }).challenge, origin: ORIGIN, rpId: CONFIG.rpId }) },
    });

    const attacker = new SoftAuthenticator();
    const loginOptions = await app.call("POST", "/auth/passkey/login/options");
    const challenge = (loginOptions.body as { challenge: string }).challenge;
    const forged = await app.call("POST", "/auth/passkey/login/verify", {
      cookies: { asa_challenge: cookieValue(loginOptions.cookies, "asa_challenge") },
      body: { response: attacker.assert({ challenge, origin: ORIGIN, rpId: CONFIG.rpId, counter: 1 }) },
    });
    expect(forged.status).toBe(401);
    expect(cookieValue(forged.cookies, "asa_session")).toBeUndefined();
  });
});
