import { captureRoutes } from "./captures/routes.js";
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
import { PgTaskStore } from "./tasks/store.js";
import { forbidden, json, notFound, unauthorized, type Route } from "./routing.js";
import type { SqlClient } from "./sql.js";

export type { ApiRequest, ApiResponse } from "./http.js";
export type Api = (req: ApiRequest) => Promise<ApiResponse>;

export interface AppDeps {
  sql: SqlClient;
  config: AuthConfig;
  now?: () => number;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createApp({ sql, config, now = Date.now }: AppDeps): Api {
  const taskStore = new PgTaskStore(sql, now);
  const pageStore = new PgPageStore(sql, now);
  const routes: Route[] = [
    ...authRoutes({ auth: new PgAuthStore(sql), config }),
    ...pageRoutes(pageStore),
    ...taskRoutes(taskStore),
    ...goalRoutes(new PgGoalStore(sql, now), taskStore),
    ...captureRoutes(new PgCaptureStore(sql, now), pageStore),
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

      // Cookie de sessão é enviado sozinho pelo navegador: toda escrita precisa vir de uma origem conhecida.
      if (!SAFE_METHODS.has(req.method) && !config.origins.includes(req.headers?.origin ?? "")) return forbidden();

      const nowMs = now();
      const session = verifyToken<{ typ?: string; exp: number }>(
        req.cookies?.[SESSION_COOKIE],
        config.sessionSecret,
        Math.floor(nowMs / 1000),
      );
      const authenticated = session?.typ === "session";
      if (route.access === "session" && !authenticated) return unauthorized();
      return route.handle({ req, match, now: nowMs, authenticated });
    }
    return pathMatched ? json(405, { error: "method_not_allowed" }) : notFound();
  };
}
