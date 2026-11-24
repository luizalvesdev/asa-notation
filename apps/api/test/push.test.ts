import { createECDH, createPublicKey, randomBytes, verify } from "node:crypto";
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";
import { createPushJob } from "../src/app.js";
import { encryptPayload, generateVapidKeys, isPushEndpoint, vapidAuthorization, type PushFetch } from "../src/push/webpush.js";
import { CONFIG, createTestApp, type TestApp } from "./helpers.js";

// Implementação de referência (dependência do pacote web-push), só para conferir a cifra.
const ece = createRequire(import.meta.url)("http_ece") as { decrypt: (buf: Buffer, params: Record<string, unknown>) => Buffer };

/** Um "navegador": par de chaves P-256 e segredo de autenticação. */
function browser(endpoint = `https://fcm.googleapis.com/fcm/send/${randomBytes(8).toString("hex")}`) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh,
    auth,
    subscription: { endpoint, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } },
    decrypt: (body: Uint8Array) => JSON.parse(ece.decrypt(Buffer.from(body), { version: "aes128gcm", privateKey: ecdh, authSecret: auth.toString("base64url") }).toString("utf8")),
  };
}

describe("cifra e VAPID", () => {
  it("a referência decifra o que o servidor cifra", () => {
    const b = browser();
    const body = encryptPayload(Buffer.from(JSON.stringify({ title: "Olá", body: "ção" })), b.subscription.keys.p256dh, b.subscription.keys.auth);
    expect(b.decrypt(body)).toEqual({ title: "Olá", body: "ção" });
  });

  it("assina o JWT com a chave VAPID, para a origem do endpoint", () => {
    const keys = generateVapidKeys();
    const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", "https://asa.example", keys, 1_000);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(match[4]).toBe(keys.publicKey);
    const claims = JSON.parse(Buffer.from(match[2]!, "base64url").toString());
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_000 + 12 * 3600, sub: "https://asa.example" });
    const pub = Buffer.from(keys.publicKey, "base64url");
    const key = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") } });
    expect(verify("sha256", Buffer.from(`${match[1]}.${match[2]}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(match[3]!, "base64url"))).toBe(true);
  });

  it("aceita só endpoints dos serviços de push", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isPushEndpoint("https://evil.com/fcm.googleapis.com")).toBe(false);
    expect(isPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isPushEndpoint("https://169.254.169.254/latest")).toBe(false);
  });
});

describe("rotas e envio", () => {
  let app: TestApp;
  let cookies: Record<string, string>;
  let sent: { url: string; headers: Record<string, string>; body: Uint8Array }[];
  let status: number;
  const pushFetch: PushFetch = async (url, init) => {
    sent.push({ url, headers: init.headers, body: init.body });
    return { status };
  };
  const job = () => createPushJob({ sql: app.sql, config: CONFIG, now: () => app.clock.ms, pushFetch })();

  beforeEach(async () => {
    sent = [];
    status = 201;
    app = await createTestApp({ pushFetch });
    cookies = await app.owner();
  });

  it("guarda a chave pública e inscreve o navegador", async () => {
    const first = (await app.call("GET", "/push", { cookies })).body as { publicKey: string; subscriptions: unknown[] };
    expect(Buffer.from(first.publicKey, "base64url")).toHaveLength(65);
    const again = (await app.call("GET", "/push", { cookies })).body as { publicKey: string };
    expect(again.publicKey).toBe(first.publicKey);

    const b = browser();
    expect((await app.call("POST", "/push/subscriptions", { cookies, body: { ...b.subscription, label: "Chrome" } })).status).toBe(201);
    // Inscrever de novo o mesmo endpoint não duplica.
    await app.call("POST", "/push/subscriptions", { cookies, body: b.subscription });
    const list = (await app.call("GET", "/push", { cookies })).body as { subscriptions: { label: string; service: string }[] };
    expect(list.subscriptions).toHaveLength(1);
    expect(list.subscriptions[0]).toMatchObject({ service: "fcm.googleapis.com" });
    expect(JSON.stringify(list)).not.toContain(b.subscription.keys.auth);

    expect((await app.call("DELETE", "/push/subscriptions", { cookies, body: { endpoint: b.subscription.endpoint } })).status).toBe(200);
    expect(((await app.call("GET", "/push", { cookies })).body as { subscriptions: unknown[] }).subscriptions).toHaveLength(0);
  });

  it("recusa endpoint estranho, chaves erradas e acesso sem sessão", async () => {
    const b = browser("https://example.com/push");
    expect((await app.call("POST", "/push/subscriptions", { cookies, body: b.subscription })).body).toEqual({ error: "invalid_endpoint" });
    const c = browser();
    expect((await app.call("POST", "/push/subscriptions", { cookies, body: { ...c.subscription, keys: { p256dh: "abc", auth: c.subscription.keys.auth } } })).body).toEqual({ error: "invalid_keys" });
    expect((await app.call("GET", "/push")).status).toBe(401);
  });

  it("teste manda um aviso cifrado com VAPID para cada aparelho", async () => {
    const b = browser();
    await app.call("POST", "/push/subscriptions", { cookies, body: b.subscription });
    const res = await app.call("POST", "/push/test", { cookies });
    expect(res.body).toEqual({ sent: 1, removed: 0, failed: 0 });
    expect(sent[0]!.url).toBe(b.subscription.endpoint);
    expect(sent[0]!.headers).toMatchObject({ "content-encoding": "aes128gcm", ttl: "86400" });
    expect(sent[0]!.headers.authorization).toMatch(/^vapid t=/);
    expect(b.decrypt(sent[0]!.body)).toMatchObject({ title: "asa-notation", tag: "test" });
  });

  it("o trabalho agendado manda o check-in vencido uma vez só", async () => {
    // 18/11/2026 12:00 UTC = quarta 09:00 em São Paulo: o plano das 08:30 venceu.
    const b = browser();
    await app.call("POST", "/push/subscriptions", { cookies, body: b.subscription });
    const result = await job();
    expect(result).toMatchObject({ sent: 1, pending: 1 });
    expect(b.decrypt(sent[0]!.body)).toMatchObject({ title: "Plano do dia", link: "#/hoje" });

    expect(await job()).toMatchObject({ sent: 0, pending: 0 });
    expect(sent).toHaveLength(1);
  });

  it("avisa quando chega o horário de uma tarefa, uma vez só e sem avisar as velhas ou concluídas", async () => {
    // Quarta 09:00 em São Paulo.
    const b = browser();
    await app.call("POST", "/push/subscriptions", { cookies, body: b.subscription });
    await job(); // check-in do plano do dia sai primeiro
    sent.length = 0;
    const make = async (title: string, time: string) =>
      ((await app.call("POST", "/tasks", { cookies, body: { title, date: "2026-11-18", time } })).body as { task: { id: string } }).task.id;
    await make("Estudar Alura", "08:50");
    await make("Muito cedo", "05:00");
    await make("Ainda não", "09:30");
    const done = await make("Já feita", "08:55");
    await app.call("POST", `/tasks/${done}/done`, { cookies, body: { done: true, date: "2026-11-18" } });

    expect(await job()).toMatchObject({ sent: 1, pending: 1 });
    expect(b.decrypt(sent[0]!.body)).toMatchObject({ title: "Estudar Alura", body: "Marcada para as 08:50.", link: "#/hoje" });
    expect(await job()).toMatchObject({ sent: 0, pending: 0 });

    app.clock.ms += 30 * 60_000; // 09:30
    cookies = await app.owner();
    expect(await job()).toMatchObject({ sent: 1, pending: 1 });
    expect(b.decrypt(sent[1]!.body)).toMatchObject({ title: "Ainda não" });
  });

  it("não manda o que já foi lido no app", async () => {
    await app.call("GET", "/notifications", { cookies });
    await app.call("POST", "/notifications/read-all", { cookies });
    await app.call("POST", "/push/subscriptions", { cookies, body: browser().subscription });
    expect(await job()).toMatchObject({ sent: 0, pending: 0 });
  });

  it("sem aparelho inscrito guarda o aviso para quando houver", async () => {
    expect(await job()).toMatchObject({ sent: 0 });
    await app.call("POST", "/push/subscriptions", { cookies, body: browser().subscription });
    expect(await job()).toMatchObject({ sent: 1 });
  });

  it("no horário de silêncio segura o aviso e manda depois", async () => {
    await app.call("POST", "/push/subscriptions", { cookies, body: browser().subscription });
    await app.call("PATCH", "/settings", { cookies, body: { quiet: { start: "08:00", end: "10:00" } } });
    expect(await job()).toMatchObject({ sent: 0, quiet: true });
    app.clock.ms += 90 * 60_000; // 10:30 em São Paulo
    cookies = await app.owner();
    expect(await job()).toMatchObject({ sent: 1 });
  });

  it("tira da lista a inscrição que o serviço deu como morta", async () => {
    await app.call("POST", "/push/subscriptions", { cookies, body: browser().subscription });
    status = 410;
    expect(await job()).toMatchObject({ sent: 0, removed: 1 });
    expect(((await app.call("GET", "/push", { cookies })).body as { subscriptions: unknown[] }).subscriptions).toHaveLength(0);
  });
});
