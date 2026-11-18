import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { neon } from "@neondatabase/serverless";
import { createApp, type Api } from "./app.js";
import { DEFAULT_SESSION_TTL_SECONDS, type AuthConfig } from "./auth/config.js";
import { createLambdaHandler } from "./lambda.js";

let cached: Promise<Api> | undefined;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function loadSecrets(names: Record<"databaseUrl" | "sessionSecret", string>) {
  const out = await new SSMClient({}).send(new GetParametersCommand({ Names: Object.values(names), WithDecryption: true }));
  const byName = new Map((out.Parameters ?? []).map((p) => [p.Name, p.Value]));
  const read = (key: keyof typeof names) => {
    const value = byName.get(names[key]);
    if (!value) throw new Error(`parameter ${names[key]} is missing or empty`);
    return value;
  };
  return { databaseUrl: read("databaseUrl"), sessionSecret: read("sessionSecret") };
}

async function buildApi(): Promise<Api> {
  const secrets = await loadSecrets({
    databaseUrl: env("DATABASE_URL_PARAM"),
    sessionSecret: env("SESSION_SECRET_PARAM"),
  });
  if (secrets.sessionSecret.length < 32) throw new Error("session secret must have at least 32 characters");

  const config: AuthConfig = {
    origins: env("ALLOWED_ORIGINS").split(",").map((o) => o.trim()).filter(Boolean),
    sessionSecret: secrets.sessionSecret,
    secureCookies: process.env.SECURE_COOKIES !== "false",
    sessionTtlSeconds: DEFAULT_SESSION_TTL_SECONDS,
  };

  const sql = neon(secrets.databaseUrl);
  return createApp({
    sql: { query: async (text, params) => (await sql.query(text, params)) as Record<string, unknown>[] },
    config,
  });
}

function getApi(): Promise<Api> {
  cached ??= buildApi().catch((err) => {
    cached = undefined;
    throw err;
  });
  return cached;
}

export const handler = createLambdaHandler(getApi);
