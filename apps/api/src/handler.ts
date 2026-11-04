import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { neon } from "@neondatabase/serverless";
import { DEFAULT_SESSION_TTL_SECONDS, type AuthConfig } from "./auth/config.js";
import { PgAuthStore } from "./auth/pg-store.js";
import { simpleWebAuthn } from "./auth/webauthn.js";
import { createLambdaHandler, type Router } from "./lambda.js";
import { PgPageStore } from "./pg-store.js";
import { createRouter } from "./router.js";

let cached: Promise<Router> | undefined;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function loadSecrets(names: Record<"databaseUrl" | "sessionSecret" | "bootstrapToken", string>) {
  const out = await new SSMClient({}).send(
    new GetParametersCommand({ Names: Object.values(names), WithDecryption: true }),
  );
  const byName = new Map((out.Parameters ?? []).map((p) => [p.Name, p.Value]));
  const read = (key: keyof typeof names) => {
    const value = byName.get(names[key]);
    if (!value) throw new Error(`parameter ${names[key]} is missing or empty`);
    return value;
  };
  return {
    databaseUrl: read("databaseUrl"),
    sessionSecret: read("sessionSecret"),
    bootstrapToken: read("bootstrapToken"),
  };
}

async function buildRouter(): Promise<Router> {
  const secrets = await loadSecrets({
    databaseUrl: env("DATABASE_URL_PARAM"),
    sessionSecret: env("SESSION_SECRET_PARAM"),
    bootstrapToken: env("BOOTSTRAP_TOKEN_PARAM"),
  });
  if (secrets.sessionSecret.length < 32) throw new Error("session secret must have at least 32 characters");
  if (secrets.bootstrapToken.length < 24) throw new Error("bootstrap token must have at least 24 characters");

  const config: AuthConfig = {
    rpId: env("RP_ID"),
    rpName: env("RP_NAME"),
    origins: env("ALLOWED_ORIGINS").split(",").map((o) => o.trim()).filter(Boolean),
    sessionSecret: secrets.sessionSecret,
    bootstrapToken: secrets.bootstrapToken,
    secureCookies: process.env.SECURE_COOKIES !== "false",
    sessionTtlSeconds: DEFAULT_SESSION_TTL_SECONDS,
  };

  const sql = neon(secrets.databaseUrl);
  const client = {
    query: async (text: string, params?: unknown[]) => (await sql.query(text, params)) as Record<string, unknown>[],
  };
  return createRouter({
    store: new PgPageStore(client),
    auth: new PgAuthStore(client),
    webauthn: simpleWebAuthn,
    config,
  });
}

function getRouter(): Promise<Router> {
  cached ??= buildRouter().catch((err) => {
    cached = undefined;
    throw err;
  });
  return cached;
}

export const handler = createLambdaHandler(getRouter);
