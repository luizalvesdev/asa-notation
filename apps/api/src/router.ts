import { createHash } from "node:crypto";
import { extractText } from "@asa/core";
import {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_SECONDS,
  SESSION_COOKIE,
  type AuthConfig,
} from "./auth/config.js";
import type { AuthStore, DeviceScope } from "./auth/store.js";
import {
  hashDeviceToken,
  newDeviceToken,
  safeEqual,
  serializeCookie,
  signToken,
  verifyToken,
} from "./auth/tokens.js";
import type { WebAuthnAdapter } from "./auth/webauthn.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import type { PagePatch, PageStore } from "./store.js";

export type { ApiRequest, ApiResponse } from "./http.js";

export interface RouterDeps {
  store: PageStore;
  auth: AuthStore;
  webauthn: WebAuthnAdapter;
  config: AuthConfig;
  now?: () => number;
}

type Principal = { kind: "session" } | { kind: "device"; scope: DeviceScope; id: string };

type Access = "public" | "registration" | "session" | "sync" | "full";

interface Ctx {
  req: ApiRequest;
  match: RegExpMatchArray;
  principal: Principal | null;
}

interface Route {
  method: string;
  pattern: RegExp;
  access: Access;
  handle: (ctx: Ctx) => Promise<ApiResponse>;
}

interface SessionPayload {
  typ: "session";
  exp: number;
}

interface ChallengePayload {
  typ: "challenge";
  purpose: "register" | "login";
  mode: "session" | "bootstrap";
  challenge: string;
  exp: number;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const MAX_TITLE_LENGTH = 500;
const MAX_JSON_BYTES = 500_000;
const SEARCH_LIMIT = 20;
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID_PATTERN = new RegExp(`^${UUID}$`);
const PAGE_KINDS: readonly string[] = ["page", "database"];
const OWNER_USER_ID = createHash("sha256").update("asa-notation-owner").digest().subarray(0, 16);
const DEVICE_SCOPES: readonly string[] = ["full", "bot", "sync"];

const json = (status: number, body: unknown, cookies?: string[]): ApiResponse =>
  cookies ? { status, body, cookies } : { status, body };

const unauthorized = () => json(401, { error: "unauthorized" });
const forbidden = () => json(403, { error: "forbidden" });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInteger(raw: string | undefined, fallback: number, min: number, max: number): number | null {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) return null;
  return value;
}

function jsonSize(value: unknown): number {
  return JSON.stringify(value).length;
}

function validTitle(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_TITLE_LENGTH ? value : null;
}

function validDoc(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.type === "doc" && jsonSize(value) <= MAX_JSON_BYTES;
}

function validProps(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && jsonSize(value) <= MAX_JSON_BYTES;
}

function mergeProps(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

function cleanName(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

export function createRouter(deps: RouterDeps) {
  const { store, auth, webauthn, config } = deps;
  const nowMs = deps.now ?? Date.now;
  const nowSeconds = () => Math.floor(nowMs() / 1000);

  const sessionCookie = () =>
    serializeCookie(
      SESSION_COOKIE,
      signToken({ typ: "session", exp: nowSeconds() + config.sessionTtlSeconds }, config.sessionSecret),
      { maxAge: config.sessionTtlSeconds, secure: config.secureCookies },
    );

  const clearCookie = (name: string) => serializeCookie(name, "", { maxAge: 0, secure: config.secureCookies });

  const challengeCookie = (purpose: ChallengePayload["purpose"], mode: ChallengePayload["mode"], challenge: string) =>
    serializeCookie(
      CHALLENGE_COOKIE,
      signToken(
        { typ: "challenge", purpose, mode, challenge, exp: nowSeconds() + CHALLENGE_TTL_SECONDS },
        config.sessionSecret,
      ),
      { maxAge: CHALLENGE_TTL_SECONDS, secure: config.secureCookies },
    );

  const readChallenge = (req: ApiRequest, purpose: ChallengePayload["purpose"]): ChallengePayload | null => {
    const payload = verifyToken<ChallengePayload>(req.cookies?.[CHALLENGE_COOKIE], config.sessionSecret, nowSeconds());
    return payload && payload.typ === "challenge" && payload.purpose === purpose ? payload : null;
  };

  async function authenticate(req: ApiRequest): Promise<Principal | null> {
    const authorization = req.headers?.authorization;
    if (authorization !== undefined) {
      const match = /^Bearer (asa_[A-Za-z0-9_-]+)$/.exec(authorization);
      if (!match) return null;
      const info = await auth.findActiveDeviceToken(hashDeviceToken(match[1]!));
      return info ? { kind: "device", scope: info.scope, id: info.id } : null;
    }
    const session = verifyToken<SessionPayload>(req.cookies?.[SESSION_COOKIE], config.sessionSecret, nowSeconds());
    return session && session.typ === "session" ? { kind: "session" } : null;
  }

  function accessDenied(access: Access, principal: Principal | null): ApiResponse | null {
    if (access === "public" || access === "registration") return null;
    if (access === "session") {
      if (principal?.kind === "session") return null;
      return principal ? forbidden() : unauthorized();
    }
    if (principal?.kind === "session") return null;
    const allowedScopes: DeviceScope[] = access === "sync" ? ["full", "sync"] : ["full"];
    if (principal?.kind === "device" && allowedScopes.includes(principal.scope)) return null;
    return principal ? forbidden() : unauthorized();
  }

  const originAllowed = (req: ApiRequest, principal: Principal | null) => {
    if (req.method === "GET" || principal?.kind === "device") return true;
    const origin = req.headers?.origin;
    return origin !== undefined && config.origins.includes(origin);
  };

  const routes: Route[] = [
    {
      method: "GET",
      pattern: /^\/sync\/head$/,
      access: "sync",
      handle: async () => json(200, { seq: await store.head() }),
    },
    {
      method: "GET",
      pattern: /^\/changes$/,
      access: "sync",
      handle: async ({ req }) => {
        const since = parseInteger(req.query.since, 0, 0, Number.MAX_SAFE_INTEGER);
        if (since === null) return json(400, { error: "invalid_since" });
        const limit = parseInteger(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
        if (limit === null) return json(400, { error: "invalid_limit" });
        return json(200, await store.changes(since, limit));
      },
    },
    {
      method: "GET",
      pattern: /^\/tree$/,
      access: "full",
      handle: async () => json(200, { pages: await store.tree() }),
    },
    {
      method: "GET",
      pattern: /^\/search$/,
      access: "full",
      handle: async ({ req }) => {
        const query = (req.query.q ?? "").trim();
        if (query.length === 0 || query.length > 200) return json(400, { error: "invalid_query" });
        return json(200, { hits: await store.search(query, SEARCH_LIMIT) });
      },
    },
    {
      method: "POST",
      pattern: /^\/pages$/,
      access: "full",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : null;
        if (!body) return json(400, { error: "invalid_body" });

        const title = body.title === undefined ? "" : validTitle(body.title);
        if (title === null) return json(400, { error: "invalid_title" });
        const kind = body.kind === undefined ? "page" : body.kind;
        if (typeof kind !== "string" || !PAGE_KINDS.includes(kind)) return json(400, { error: "invalid_kind" });
        const pageBody = body.body === undefined || body.body === null ? null : body.body;
        if (pageBody !== null && !validDoc(pageBody)) return json(400, { error: "invalid_page_body" });
        const props = body.props === undefined ? {} : body.props;
        if (!validProps(props)) return json(400, { error: "invalid_props" });

        let parentId: string | null = null;
        if (body.parentId !== undefined && body.parentId !== null) {
          if (typeof body.parentId !== "string" || !UUID_PATTERN.test(body.parentId)) {
            return json(400, { error: "invalid_parent" });
          }
          if (!(await store.get(body.parentId))) return json(400, { error: "parent_not_found" });
          parentId = body.parentId;
        }

        const page = await store.create({
          parentId,
          kind: kind as "page" | "database",
          title,
          body: pageBody,
          bodyText: pageBody === null ? "" : extractText(pageBody),
          props,
        });
        return json(201, page);
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^/pages/(${UUID})$`),
      access: "full",
      handle: async ({ match }) => {
        const page = await store.get(match[1]!);
        return page ? json(200, page) : json(404, { error: "not_found" });
      },
    },
    {
      method: "PATCH",
      pattern: new RegExp(`^/pages/(${UUID})$`),
      access: "full",
      handle: async ({ req, match }) => {
        const id = match[1]!;
        const body = isRecord(req.body) ? req.body : null;
        if (!body) return json(400, { error: "invalid_body" });
        const baseRev = body.baseRev;
        if (typeof baseRev !== "number" || !Number.isSafeInteger(baseRev) || baseRev < 0) {
          return json(400, { error: "invalid_base_rev" });
        }

        const patch: PagePatch = {};
        if (body.title !== undefined) {
          const title = validTitle(body.title);
          if (title === null) return json(400, { error: "invalid_title" });
          patch.title = title;
        }
        if (body.body !== undefined) {
          if (body.body !== null && !validDoc(body.body)) return json(400, { error: "invalid_page_body" });
          patch.body = body.body;
          patch.bodyText = body.body === null ? "" : extractText(body.body);
        }
        if (body.parentId !== undefined) {
          if (body.parentId !== null && (typeof body.parentId !== "string" || !UUID_PATTERN.test(body.parentId))) {
            return json(400, { error: "invalid_parent" });
          }
          patch.parentId = body.parentId;
        }
        let propsPatch: Record<string, unknown> | undefined;
        if (body.props !== undefined) {
          if (!validProps(body.props)) return json(400, { error: "invalid_props" });
          propsPatch = body.props;
        }
        if (Object.keys(patch).length === 0 && propsPatch === undefined) return json(400, { error: "empty_patch" });

        const current = await store.get(id);
        if (!current) return json(404, { error: "not_found" });
        if (current.rev !== baseRev) return json(409, { error: "conflict", page: current });

        if (typeof patch.parentId === "string") {
          if (patch.parentId === id || (await store.isDescendant(id, patch.parentId))) {
            return json(400, { error: "invalid_parent" });
          }
          if (!(await store.get(patch.parentId))) return json(400, { error: "parent_not_found" });
        }
        if (propsPatch !== undefined) patch.props = mergeProps(current.props, propsPatch);

        const result = await store.update(id, patch, baseRev);
        if (result.status === "ok") return json(200, result.page);
        if (result.status === "conflict") return json(409, { error: "conflict", page: result.page });
        return json(404, { error: "not_found" });
      },
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^/pages/(${UUID})$`),
      access: "full",
      handle: async ({ match }) =>
        (await store.softDelete(match[1]!)) ? json(200, { ok: true }) : json(404, { error: "not_found" }),
    },
    {
      method: "GET",
      pattern: /^\/auth\/me$/,
      access: "public",
      handle: async ({ req }) => {
        const principal = await authenticate(req);
        const hasPasskeys = (await auth.listPasskeys()).length > 0;
        return json(200, { authenticated: principal?.kind === "session", hasPasskeys });
      },
    },
    {
      method: "POST",
      pattern: /^\/auth\/passkey\/register\/options$/,
      access: "registration",
      handle: async ({ req, principal }) => {
        const passkeys = await auth.listPasskeys();
        let mode: ChallengePayload["mode"];
        if (principal?.kind === "session") {
          mode = "session";
        } else {
          const supplied = req.headers?.["x-bootstrap-token"];
          if (supplied === undefined || !safeEqual(supplied, config.bootstrapToken)) return unauthorized();
          if (passkeys.length > 0) return json(403, { error: "bootstrap_closed" });
          mode = "bootstrap";
        }
        const { options, challenge } = await webauthn.registrationOptions({
          rpId: config.rpId,
          rpName: config.rpName,
          userName: "owner",
          userId: OWNER_USER_ID,
          exclude: passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
        });
        return json(200, options, [challengeCookie("register", mode, challenge)]);
      },
    },
    {
      method: "POST",
      pattern: /^\/auth\/passkey\/register\/verify$/,
      access: "registration",
      handle: async ({ req, principal }) => {
        const challenge = readChallenge(req, "register");
        if (!challenge) return json(400, { error: "invalid_challenge" });
        if (challenge.mode === "session" && principal?.kind !== "session") return unauthorized();
        if (challenge.mode === "bootstrap" && (await auth.listPasskeys()).length > 0) {
          return json(403, { error: "bootstrap_closed" });
        }
        const body = isRecord(req.body) ? req.body : null;
        const response = body?.response;
        if (!isRecord(response) || typeof response.id !== "string") return json(400, { error: "invalid_body" });
        const name = cleanName(body?.name, "passkey");
        if (name === null) return json(400, { error: "invalid_name" });

        const verified = await webauthn.verifyRegistration({
          response,
          challenge: challenge.challenge,
          origins: config.origins,
          rpId: config.rpId,
        });
        if (!verified) return json(400, { error: "verification_failed" });

        await auth.addPasskey({ ...verified, name });
        const cookies = [clearCookie(CHALLENGE_COOKIE)];
        if (challenge.mode === "bootstrap") cookies.push(sessionCookie());
        return json(200, { ok: true }, cookies);
      },
    },
    {
      method: "POST",
      pattern: /^\/auth\/passkey\/login\/options$/,
      access: "public",
      handle: async () => {
        const passkeys = await auth.listPasskeys();
        if (passkeys.length === 0) return json(404, { error: "no_passkeys" });
        const { options, challenge } = await webauthn.authenticationOptions({
          rpId: config.rpId,
          allow: passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
        });
        return json(200, options, [challengeCookie("login", "session", challenge)]);
      },
    },
    {
      method: "POST",
      pattern: /^\/auth\/passkey\/login\/verify$/,
      access: "public",
      handle: async ({ req }) => {
        const challenge = readChallenge(req, "login");
        if (!challenge) return json(400, { error: "invalid_challenge" });
        const body = isRecord(req.body) ? req.body : null;
        const response = body?.response;
        if (!isRecord(response) || typeof response.id !== "string") return json(400, { error: "invalid_body" });

        const passkey = (await auth.listPasskeys()).find((p) => p.credentialId === response.id);
        if (!passkey) return unauthorized();

        const result = await webauthn.verifyAuthentication({
          response,
          challenge: challenge.challenge,
          origins: config.origins,
          rpId: config.rpId,
          credential: {
            id: passkey.credentialId,
            publicKey: passkey.publicKey,
            counter: passkey.counter,
            transports: passkey.transports,
          },
        });
        if (!result) return unauthorized();

        await auth.updatePasskeyCounter(passkey.credentialId, result.newCounter);
        return json(200, { ok: true }, [clearCookie(CHALLENGE_COOKIE), sessionCookie()]);
      },
    },
    {
      method: "POST",
      pattern: /^\/auth\/logout$/,
      access: "public",
      handle: async () => json(200, { ok: true }, [clearCookie(SESSION_COOKIE)]),
    },
    {
      method: "GET",
      pattern: /^\/devices$/,
      access: "session",
      handle: async () => json(200, { devices: await auth.listDeviceTokens() }),
    },
    {
      method: "POST",
      pattern: /^\/devices$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : null;
        const name = cleanName(body?.name, null);
        if (name === null) return json(400, { error: "invalid_name" });
        const scope = body?.scope;
        if (typeof scope !== "string" || !DEVICE_SCOPES.includes(scope)) return json(400, { error: "invalid_scope" });
        const { token, hash } = newDeviceToken();
        const info = await auth.createDeviceToken({ name, scope: scope as DeviceScope, tokenHash: hash });
        return json(201, { ...info, token });
      },
    },
    {
      method: "DELETE",
      pattern: /^\/devices\/([0-9a-fA-F-]{36})$/,
      access: "session",
      handle: async ({ match }) => {
        const revoked = await auth.revokeDeviceToken(match[1]!);
        return revoked ? json(200, { ok: true }) : json(404, { error: "not_found" });
      },
    },
  ];

  return async function handle(incoming: ApiRequest): Promise<ApiResponse> {
    const req = { ...incoming, path: incoming.path.replace(/^\/api(?=\/|$)/, "") || "/" };
    const matching = routes
      .map((route) => ({ route, match: route.pattern.exec(req.path) }))
      .filter((entry): entry is { route: Route; match: RegExpExecArray } => entry.match !== null);
    if (matching.length === 0) return json(404, { error: "not_found" });
    const found = matching.find((entry) => entry.route.method === req.method);
    if (!found) return json(405, { error: "method_not_allowed" });

    const { route, match } = found;
    const principal = route.access === "public" ? null : await authenticate(req);

    if (!originAllowed(req, route.access === "public" ? null : principal)) return forbidden();
    const denied = accessDenied(route.access, principal);
    if (denied) return denied;

    return route.handle({ req, match, principal });
  };
}
