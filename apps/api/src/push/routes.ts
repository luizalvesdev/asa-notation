import { UUID_SOURCE, badRequest, isRecord, json, notFound, type Route } from "../routing.js";
import { broadcast, type PushDeps } from "./job.js";
import { isKey, isPushEndpoint } from "./webpush.js";

const ID = `(${UUID_SOURCE})`;

/** Sem as chaves e o endpoint: a tela só precisa reconhecer o aparelho. */
const publicView = (s: { id: string; endpoint: string; label: string; createdAt: string; lastOkAt: string | null }) => ({
  id: s.id,
  label: s.label,
  service: new URL(s.endpoint).hostname,
  createdAt: s.createdAt,
  lastOkAt: s.lastOkAt,
});

export function pushRoutes(deps: PushDeps): Route[] {
  const { push } = deps;
  return [
    {
      method: "GET",
      pattern: /^\/push$/,
      access: "owner",
      handle: async () => {
        const [keys, subs] = await Promise.all([push.vapid(), push.list()]);
        return json(200, { publicKey: keys.publicKey, subscriptions: subs.map(publicView) });
      },
    },
    {
      method: "POST",
      pattern: /^\/push\/subscriptions$/,
      access: "owner",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        const keys = isRecord(body.keys) ? body.keys : {};
        if (!isPushEndpoint(body.endpoint)) return badRequest("invalid_endpoint");
        if (!isKey(keys.p256dh, 65) || !isKey(keys.auth, 16)) return badRequest("invalid_keys");
        const label = typeof body.label === "string" ? body.label.slice(0, 80) : "";
        await push.subscribe({ endpoint: body.endpoint, p256dh: keys.p256dh, auth: keys.auth }, label);
        return json(201, { ok: true });
      },
    },
    {
      method: "DELETE",
      pattern: /^\/push\/subscriptions$/,
      access: "owner",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        if (typeof body.endpoint !== "string") return badRequest("invalid_endpoint");
        await push.unsubscribe(body.endpoint);
        return json(200, { ok: true });
      },
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^/push/subscriptions/${ID}$`),
      access: "owner",
      handle: async ({ match }) => ((await push.removeById(match[1]!)) ? json(200, { ok: true }) : notFound()),
    },
    {
      method: "POST",
      pattern: /^\/push\/test$/,
      access: "owner",
      handle: async () => {
        const result = await broadcast(deps, [{ title: "asa-notation", body: "Os avisos estão chegando neste aparelho.", link: "#/notificacoes", tag: "test" }]);
        return json(200, result);
      },
    },
  ];
}
