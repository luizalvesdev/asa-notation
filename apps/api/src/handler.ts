import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";
import { neon } from "@neondatabase/serverless";
import { createApp, createPushJob, type Api } from "./app.js";
import { DEFAULT_SESSION_TTL_SECONDS, type AuthConfig } from "./auth/config.js";
import { aiConfigFromEnv } from "./ai/provider.js";
import { createLambdaHandler } from "./lambda.js";

let cached: Promise<Runtime> | undefined;

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

interface Runtime {
  api: Api;
  pushJob: ReturnType<typeof createPushJob>;
}

async function build(): Promise<Runtime> {
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

  const neonSql = neon(secrets.databaseUrl);
  const sql = { query: async (text: string, params?: unknown[]) => (await neonSql.query(text, params)) as Record<string, unknown>[] };
  return {
    api: createApp({ sql, config, ai: aiConfigFromEnv(process.env) }),
    pushJob: createPushJob({ sql, config }),
  };
}

function getRuntime(): Promise<Runtime> {
  cached ??= build().catch((err) => {
    cached = undefined;
    throw err;
  });
  return cached;
}

const httpHandler = createLambdaHandler(async () => (await getRuntime()).api);

/** A mesma função atende a API (eventos do API Gateway) e o agendador ({"job": "push"}). */
export async function handler(event: Parameters<typeof httpHandler>[0] | { job: "push" }) {
  if ("job" in event) {
    const result = await (await getRuntime()).pushJob();
    console.log(JSON.stringify({ job: "push", ...result }));
    return result;
  }
  return httpHandler(event);
}
