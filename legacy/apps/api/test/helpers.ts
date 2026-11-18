import type { AuthConfig } from "../src/auth/config.js";
import { InMemoryAuthStore } from "../src/auth/memory-store.js";
import type { CredentialRef, VerifiedRegistration, WebAuthnAdapter } from "../src/auth/webauthn.js";
import type { ApiResponse } from "../src/http.js";
import { InMemoryPageStore } from "../src/memory-store.js";
import { createRouter } from "../src/router.js";

export const ORIGIN = "http://localhost:5173";

export const CONFIG: AuthConfig = {
  rpId: "localhost",
  rpName: "asa-notation",
  origins: [ORIGIN],
  sessionSecret: "s".repeat(40),
  bootstrapToken: "b".repeat(30),
  secureCookies: true,
  sessionTtlSeconds: 3600,
};

export class FakeWebAuthn implements WebAuthnAdapter {
  private counter = 0;

  async registrationOptions(_input: {
    rpId: string;
    rpName: string;
    userName: string;
    userId: Uint8Array;
    exclude: CredentialRef[];
  }) {
    const challenge = `reg-${++this.counter}`;
    return { options: { challenge }, challenge };
  }

  async verifyRegistration(input: { response: unknown; challenge: string }): Promise<VerifiedRegistration | null> {
    const response = input.response as { id: string; challenge?: string };
    if (response.challenge !== input.challenge) return null;
    return { credentialId: response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] };
  }

  async authenticationOptions(_input: { rpId: string; allow: CredentialRef[] }) {
    const challenge = `login-${++this.counter}`;
    return { options: { challenge }, challenge };
  }

  async verifyAuthentication(input: {
    response: unknown;
    challenge: string;
    credential: { id: string; counter: number };
  }) {
    const response = input.response as { id: string; challenge?: string };
    if (response.challenge !== input.challenge || response.id !== input.credential.id) return null;
    return { newCounter: input.credential.counter + 1 };
  }
}

export interface CallInit {
  query?: Record<string, string>;
  headers?: Record<string, string>;
  cookies?: Record<string, string | undefined>;
  body?: unknown;
  origin?: string | null;
}

export function createApp(webauthn: WebAuthnAdapter = new FakeWebAuthn()) {
  const clock = { ms: Date.UTC(2026, 10, 4, 12, 0, 0) };
  const store = new InMemoryPageStore();
  const auth = new InMemoryAuthStore(() => new Date(clock.ms));
  const handle = createRouter({ store, auth, webauthn, config: CONFIG, now: () => clock.ms });

  async function call(method: string, path: string, init: CallInit = {}): Promise<ApiResponse> {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    const origin = init.origin === undefined ? ORIGIN : init.origin;
    if (method !== "GET" && origin !== null) headers.origin = origin;
    const cookies: Record<string, string> = {};
    for (const [key, value] of Object.entries(init.cookies ?? {})) if (value !== undefined) cookies[key] = value;
    return handle({ method, path, query: init.query ?? {}, headers, cookies, body: init.body });
  }

  async function bootstrap(name = "laptop", credentialId = "cred-1") {
    const options = await call("POST", "/auth/passkey/register/options", {
      headers: { "x-bootstrap-token": CONFIG.bootstrapToken },
    });
    const challenge = (options.body as { challenge: string }).challenge;
    const verify = await call("POST", "/auth/passkey/register/verify", {
      cookies: { asa_challenge: cookieValue(options.cookies, "asa_challenge") },
      body: { name, response: { id: credentialId, challenge } },
    });
    return { options, verify, session: cookieValue(verify.cookies, "asa_session") };
  }

  async function login(credentialId = "cred-1") {
    const options = await call("POST", "/auth/passkey/login/options");
    const challenge = (options.body as { challenge: string }).challenge;
    const verify = await call("POST", "/auth/passkey/login/verify", {
      cookies: { asa_challenge: cookieValue(options.cookies, "asa_challenge") },
      body: { response: { id: credentialId, challenge } },
    });
    return { options, verify, session: cookieValue(verify.cookies, "asa_session") };
  }

  async function ownerCookies(): Promise<Record<string, string>> {
    const { session } = await bootstrap();
    if (!session) throw new Error("bootstrap did not issue a session");
    return { asa_session: session };
  }

  return { call, clock, store, auth, bootstrap, login, ownerCookies };
}

export function cookieValue(setCookies: string[] | undefined, name: string): string | undefined {
  const entry = setCookies?.find((c) => c.startsWith(`${name}=`));
  if (!entry) return undefined;
  const value = entry.slice(name.length + 1).split(";")[0] ?? "";
  return value === "" ? undefined : value;
}

export function setCookie(setCookies: string[] | undefined, name: string): string | undefined {
  return setCookies?.find((c) => c.startsWith(`${name}=`));
}
