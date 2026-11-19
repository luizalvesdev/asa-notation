import { captureRoutes } from "./captures/routes.js";
import { clipRoutes } from "./clips/routes.js";
import { writingRoutes } from "./writing/routes.js";
import { PgCaptureStore } from "./captures/store.js";
import { goalRoutes } from "./goals/routes.js";
import { PgGoalStore } from "./goals/store.js";
import { PgAuthStore } from "./auth/store.js";
import { authRoutes } from "./auth/routes.js";
import { SESSION_COOKIE, type AuthConfig } from "./auth/config.js";
import { verifyToken } from "./auth/tokens.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { pageRoutes } from "./pages/routes.js";
import { PgPageStore } from "./pages/store.js";
import { taskRoutes } from "./tasks/routes.js";
import { studyRoutes } from "./study/routes.js";
import { PgStudyStore } from "./study/store.js";
import { PgTaskStore } from "./tasks/store.js";
import type { FetchLike } from "./ai/anthropic.js";
import type { AiConfig, BedrockInvoke, BedrockStream } from "./ai/bedrock.js";
import { createProvider } from "./ai/provider.js";
import { chatRoutes } from "./chat/routes.js";
import { PgChatStore } from "./chat/store.js";
import { secretsKey } from "./secrets/crypto.js";
import { PgSecretStore } from "./secrets/store.js";
import { notificationRoutes } from "./notifications/routes.js";
import { PgNotificationStore } from "./notifications/store.js";
import { progressRoutes } from "./progress/routes.js";
import { routineRoutes } from "./routine/routes.js";
import { PgRoutineStore } from "./routine/store.js";
import { exportRoutes } from "./export/routes.js";
import { settingsRoutes } from "./settings/routes.js";
import { PgSettingsStore } from "./settings/store.js";
import { tokenRoutes } from "./tokens/routes.js";
import { runPushJob, type PushDeps } from "./push/job.js";
import { pushRoutes } from "./push/routes.js";
import { mcpRoutes } from "./mcp/routes.js";
import { PgPushStore } from "./push/store.js";
import type { PushFetch } from "./push/webpush.js";
import { PgTokenStore } from "./tokens/store.js";
import { forbidden, json, notFound, unauthorized, type Route } from "./routing.js";
import type { SqlClient } from "./sql.js";

export type { ApiRequest, ApiResponse } from "./http.js";
export type Api = (req: ApiRequest) => Promise<ApiResponse>;

export interface AppDeps {
  sql: SqlClient;
  config: AuthConfig;
  now?: () => number;
  /** Para chamar o provedor de IA. Os testes trocam por uma versão falsa. */
  fetchImpl?: FetchLike;
  /** Provedor de IA: Anthropic (com chave guardada no app) ou Bedrock (credenciais IAM do servidor). */
  ai?: AiConfig;
  /** Troca a chamada ao Bedrock nos testes. */
  bedrockInvoke?: BedrockInvoke;
  /** Troca o fluxo do Bedrock nos testes. */
  bedrockStream?: BedrockStream;
  /** Envia para os serviços de push. Os testes trocam por uma versão falsa. */
  pushFetch?: PushFetch;
}

const defaultPushFetch: PushFetch = async (url, init) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  return { status: res.status };
};

/** Contato do servidor no VAPID: a primeira origem https do app ou, em desenvolvimento, um mailto genérico. */
export function pushSubject(config: AuthConfig): string {
  return config.origins.find((o) => o.startsWith("https://")) ?? "mailto:asa-notation@localhost";
}

function pushDeps(sql: SqlClient, config: AuthConfig, now: () => number, pushFetch: PushFetch): PushDeps {
  return { push: new PgPushStore(sql, new PgSecretStore(sql, secretsKey(config.sessionSecret), now), now), fetchImpl: pushFetch, subject: pushSubject(config), now };
}

/** O trabalho agendado: gera os check-ins vencidos e manda por push. */
export function createPushJob({ sql, config, now = Date.now, pushFetch = defaultPushFetch }: Pick<AppDeps, "sql" | "config" | "now" | "pushFetch">) {
  const checkins = { store: new PgNotificationStore(sql, now), settings: new PgSettingsStore(sql, now), tasks: new PgTaskStore(sql, now), sql, now };
  return () => runPushJob({ ...pushDeps(sql, config, now, pushFetch), checkins });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createApp({ sql, config, now = Date.now, fetchImpl = globalThis.fetch as unknown as FetchLike, ai = { provider: "anthropic" }, bedrockInvoke, bedrockStream, pushFetch = defaultPushFetch }: AppDeps): Api {
  const taskStore = new PgTaskStore(sql, now);
  const pageStore = new PgPageStore(sql, now);
  const tokenStore = new PgTokenStore(sql, now);
  const settingsStore = new PgSettingsStore(sql, now);
  const goalStore = new PgGoalStore(sql, now);
  const studyStore = new PgStudyStore(sql, now);
  const captureStore = new PgCaptureStore(sql, now);
  const secretStore = new PgSecretStore(sql, secretsKey(config.sessionSecret), now);
  const aiProvider = createProvider({ config: ai, secrets: secretStore, fetchImpl, ...(bedrockInvoke ? { bedrockInvoke } : {}), ...(bedrockStream ? { bedrockStream } : {}) });
  const routes: Route[] = [
    ...authRoutes({ auth: new PgAuthStore(sql), config }),
    ...pageRoutes(pageStore),
    ...taskRoutes(taskStore),
    ...goalRoutes(goalStore, taskStore),
    ...studyRoutes(studyStore, aiProvider),
    ...captureRoutes(captureStore, pageStore),
    ...settingsRoutes(settingsStore),
    ...notificationRoutes({ store: new PgNotificationStore(sql, now), settings: settingsStore, tasks: taskStore, sql, now }),
    ...routineRoutes(new PgRoutineStore(sql, now), taskStore, sql),
    ...progressRoutes(sql),
    ...chatRoutes({
      chat: new PgChatStore(sql, now),
      secrets: secretStore,
      provider: aiProvider,
      settings: settingsStore,
      tasks: taskStore,
      goals: goalStore,
      pages: pageStore,
      captures: captureStore,
      study: studyStore,
      fetchImpl,
      now,
    }),
    ...tokenRoutes(tokenStore),
    ...pushRoutes(pushDeps(sql, config, now, pushFetch)),
    ...mcpRoutes({ settings: settingsStore, tasks: taskStore, goals: goalStore, pages: pageStore, captures: captureStore, study: studyStore, now }),
    ...exportRoutes(sql, now),
    ...clipRoutes({ sql, pages: pageStore, settings: settingsStore, ai: aiProvider }),
    ...writingRoutes(aiProvider),
  ];

  return async function handle(incoming: ApiRequest): Promise<ApiResponse> {
    const path = incoming.path.replace(/^\/api(?=\/|$)/, "") || "/";
    const req: ApiRequest = { ...incoming, path };

    let pathMatched = false;
    for (const route of routes) {
      const match = path.match(route.pattern);
      if (!match) continue;
      pathMatched = true;
      if (route.method !== req.method) continue;

      const nowMs = now();

      // Token de API: não é enviado sozinho pelo navegador, então não precisa de Origin.
      const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers?.authorization ?? "")?.[1];
      const token = bearer ? await tokenStore.verify(bearer) : null;
      if (token) {
        if (route.access === "owner") return forbidden();
        const canWrite = token.scope === "write";
        if (!SAFE_METHODS.has(req.method) && !canWrite && !(route.readTokenPost && req.method === "POST")) return json(403, { error: "read_only_token" });
        return route.handle({ req, match, now: nowMs, authenticated: true, canWrite });
      }

      // Rotas de token (MCP) não aceitam cookie: sem token válido, 401 para o cliente saber que é a credencial.
      if (route.readTokenPost) return unauthorized();

      // Cookie de sessão é enviado sozinho pelo navegador: toda escrita precisa vir de uma origem conhecida.
      if (!SAFE_METHODS.has(req.method) && !config.origins.includes(req.headers?.origin ?? "")) return forbidden();

      const session = verifyToken<{ typ?: string; exp: number }>(
        req.cookies?.[SESSION_COOKIE],
        config.sessionSecret,
        Math.floor(nowMs / 1000),
      );
      const authenticated = session?.typ === "session";
      if (route.access !== "public" && !authenticated) return unauthorized();
      return route.handle({ req, match, now: nowMs, authenticated, canWrite: authenticated });
    }
    return pathMatched ? json(405, { error: "method_not_allowed" }) : notFound();
  };
}
