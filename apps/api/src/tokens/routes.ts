import { UUID_SOURCE, badRequest, isRecord, json, notFound, type Route } from "../routing.js";
import type { PgTokenStore } from "./store.js";

const MAX_NAME = 80;
const MAX_TOKENS = 50;

export function tokenRoutes(store: PgTokenStore): Route[] {
  return [
    {
      method: "GET",
      pattern: /^\/tokens$/,
      access: "owner",
      handle: async () => json(200, { tokens: await store.list() }),
    },
    {
      method: "POST",
      pattern: /^\/tokens$/,
      access: "owner",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (name.length < 1 || name.length > MAX_NAME) return badRequest("invalid_name");
        if (body.scope !== "read" && body.scope !== "write") return badRequest("invalid_scope");
        if ((await store.list()).length >= MAX_TOKENS) return json(409, { error: "too_many_tokens" });
        const { token, secret } = await store.create(name, body.scope);
        return json(201, { token, secret });
      },
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^/tokens/(${UUID_SOURCE})$`),
      access: "owner",
      handle: async ({ match }) => ((await store.revoke(match[1]!)) ? json(200, { revoked: 1 }) : notFound()),
    },
  ];
}
