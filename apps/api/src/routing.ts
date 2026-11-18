import type { ApiRequest, ApiResponse } from "./http.js";

/**
 * public: sem login. session: cookie de sessão ou token de API (leitura para GET, escrita para o resto).
 * owner: só o cookie de sessão (senha, tokens e configurações não se mexem por token).
 */
export type Access = "public" | "session" | "owner";

export interface Ctx {
  req: ApiRequest;
  match: RegExpMatchArray;
  /** Relógio injetado, em ms. */
  now: number;
  /** A requisição traz uma sessão válida ou um token de API. */
  authenticated: boolean;
}

export interface Route {
  method: string;
  pattern: RegExp;
  access: Access;
  handle: (ctx: Ctx) => Promise<ApiResponse>;
}

export const json = (status: number, body: unknown, cookies?: string[]): ApiResponse =>
  cookies ? { status, body, cookies } : { status, body };

export const unauthorized = (extra?: Record<string, unknown>) => json(401, { error: "unauthorized", ...extra });
export const forbidden = () => json(403, { error: "forbidden" });
export const notFound = () => json(404, { error: "not_found" });
export const badRequest = (error: string) => json(400, { error });

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export const UUID_SOURCE = UUID;
const UUID_PATTERN = new RegExp(`^${UUID}$`);

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
