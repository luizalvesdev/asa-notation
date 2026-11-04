export interface AuthConfig {
  rpId: string;
  rpName: string;
  origins: string[];
  sessionSecret: string;
  bootstrapToken: string;
  secureCookies: boolean;
  sessionTtlSeconds: number;
}

export const SESSION_COOKIE = "asa_session";
export const CHALLENGE_COOKIE = "asa_challenge";
export const CHALLENGE_TTL_SECONDS = 300;
export const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
