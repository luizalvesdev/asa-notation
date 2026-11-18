export interface AuthConfig {
  /** Origens aceitas em requisições que alteram dados (proteção contra CSRF). */
  origins: string[];
  sessionSecret: string;
  secureCookies: boolean;
  sessionTtlSeconds: number;
}

export const SESSION_COOKIE = "asa_session";
export const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
