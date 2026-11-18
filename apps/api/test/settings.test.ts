import { beforeEach, describe, expect, it } from "vitest";
import { ORIGIN, PASSWORD, createTestApp, type TestApp } from "./helpers.js";

let app: TestApp;
let cookies: Record<string, string>;

beforeEach(async () => {
  app = await createTestApp();
  cookies = await app.owner();
});

interface SettingsJson {
  timezone: string;
  weekStart: number;
  checkins: { plan: string; thursday: string; saturday: string };
  quiet: { start: string; end: string };
}
const get = async () => ((await app.call("GET", "/settings", { cookies })).body as { settings: SettingsJson }).settings;
const patch = (body: unknown) => app.call("PATCH", "/settings", { cookies, body });

describe("configurações", () => {
  it("exige sessão e devolve os padrões", async () => {
    expect((await app.call("GET", "/settings")).status).toBe(401);
    expect(await get()).toEqual({ timezone: "America/Sao_Paulo", weekStart: 1, checkins: { plan: "08:30", thursday: "18:00", saturday: "10:00" }, quiet: { start: "22:00", end: "07:30" } });
  });

  it("muda só o que foi enviado", async () => {
    await patch({ timezone: "Europe/Lisbon", checkins: { thursday: "17:15" } });
    const s = await get();
    expect(s.timezone).toBe("Europe/Lisbon");
    expect(s.checkins).toEqual({ plan: "08:30", thursday: "17:15", saturday: "10:00" });
    await patch({ quiet: { end: "08:00" }, weekStart: 0 });
    expect(await get()).toMatchObject({ weekStart: 0, quiet: { start: "22:00", end: "08:00" }, timezone: "Europe/Lisbon" });
  });

  it("valida cada campo", async () => {
    for (const body of [{}, { timezone: "Nao/Existe" }, { timezone: "x; drop" }, { weekStart: 2 }, { checkins: "x" }, { checkins: { plan: "25:00" } }, { quiet: { start: "9h" } }]) {
      expect((await patch(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await get()).timezone).toBe("America/Sao_Paulo");
  });
});

describe("tokens de API", () => {
  const create = async (body: Record<string, unknown>) => app.call("POST", "/tokens", { cookies, body });
  const bearer = (secret: string) => ({ authorization: `Bearer ${secret}` });

  it("cria, mostra o segredo uma vez e lista sem ele", async () => {
    const res = await create({ name: "Script de backup", scope: "read" });
    expect(res.status).toBe(201);
    const { token, secret } = res.body as { token: { id: string; name: string; scope: string }; secret: string };
    expect(secret).toMatch(/^asa_[\w-]{40,}$/);
    expect(token).toMatchObject({ name: "Script de backup", scope: "read" });
    const list = (await app.call("GET", "/tokens", { cookies })).body as { tokens: object[] };
    expect(JSON.stringify(list)).not.toContain(secret);
    expect(list.tokens).toHaveLength(1);
  });

  it("valida nome e escopo", async () => {
    expect((await create({ name: " ", scope: "read" })).status).toBe(400);
    expect((await create({ name: "x", scope: "admin" })).status).toBe(400);
  });

  it("token de leitura lê, mas não escreve", async () => {
    const { secret } = (await create({ name: "r", scope: "read" })).body as { secret: string };
    expect((await app.call("GET", "/pages/tree", { headers: bearer(secret) })).status).toBe(200);
    const write = await app.call("POST", "/pages", { headers: bearer(secret), body: { title: "x" }, origin: null });
    expect(write.status).toBe(403);
    expect(write.body).toEqual({ error: "read_only_token" });
  });

  it("token de escrita escreve sem precisar de Origin", async () => {
    const { secret } = (await create({ name: "w", scope: "write" })).body as { secret: string };
    const res = await app.call("POST", "/pages", { headers: bearer(secret), body: { title: "Por script" }, origin: null });
    expect(res.status).toBe(201);
  });

  it("token não mexe em senha, tokens nem configurações", async () => {
    const { secret } = (await create({ name: "w", scope: "write" })).body as { secret: string };
    const h = bearer(secret);
    expect((await app.call("GET", "/tokens", { headers: h })).status).toBe(403);
    expect((await app.call("POST", "/tokens", { headers: h, body: { name: "n", scope: "write" }, origin: null })).status).toBe(403);
    expect((await app.call("PATCH", "/settings", { headers: h, body: { weekStart: 0 }, origin: null })).status).toBe(403);
    expect((await app.call("POST", "/auth/password/change", { headers: h, body: { currentPassword: PASSWORD, newPassword: "outra-senha-longa-123" }, origin: null })).status).toBe(403);
    expect((await app.call("GET", "/settings", { headers: h })).status).toBe(200);
  });

  it("token inválido, revogado ou sem prefixo não autentica", async () => {
    const { token, secret } = (await create({ name: "w", scope: "write" })).body as { token: { id: string }; secret: string };
    expect((await app.call("GET", "/pages/tree", { headers: bearer("asa_naoexiste") })).status).toBe(401);
    expect((await app.call("GET", "/pages/tree", { headers: bearer("qualquer") })).status).toBe(401);
    expect((await app.call("DELETE", `/tokens/${token.id}`, { cookies })).status).toBe(200);
    expect((await app.call("GET", "/pages/tree", { headers: bearer(secret) })).status).toBe(401);
    expect((await app.call("DELETE", `/tokens/${token.id}`, { cookies })).status).toBe(404);
  });

  it("token errado não vira sessão: continua exigindo Origin nas escritas do cookie", async () => {
    const res = await app.call("POST", "/pages", { cookies, headers: bearer("asa_errado"), body: { title: "x" }, origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(ORIGIN).toBeTruthy();
  });

  it("registra o último uso", async () => {
    const { token, secret } = (await create({ name: "w", scope: "read" })).body as { token: { id: string }; secret: string };
    await app.call("GET", "/pages/tree", { headers: bearer(secret) });
    const list = (await app.call("GET", "/tokens", { cookies })).body as { tokens: { id: string; lastUsedAt: string | null }[] };
    expect(list.tokens.find((t) => t.id === token.id)?.lastUsedAt).toBe(new Date(app.clock.ms).toISOString());
  });
});

describe("export", () => {
  it("exige sessão e junta os dados sem segredos nem lixeira", async () => {
    expect((await app.call("GET", "/export")).status).toBe(401);
    const keep = ((await app.call("POST", "/pages", { cookies, body: { title: "Fica" } })).body as { page: { id: string } }).page;
    const gone = ((await app.call("POST", "/pages", { cookies, body: { title: "Some" } })).body as { page: { id: string } }).page;
    await app.call("DELETE", `/pages/${gone.id}`, { cookies });
    await app.call("POST", "/tasks", { cookies, body: { title: "Tarefa", date: "2026-11-18", time: "09:00" } });
    await app.call("POST", "/goals", { cookies, body: { title: "Meta" } });
    await app.call("POST", "/captures", { cookies, body: { text: "Ideia #x" } });
    await app.call("POST", "/tokens", { cookies, body: { name: "n", scope: "read" } });

    const res = await app.call("GET", "/export", { cookies });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown[]> & { version: number; exportedAt: string };
    expect(body.version).toBe(1);
    expect((body.pages as { id: string }[]).map((p) => p.id)).toEqual([keep.id]);
    expect(body.tasks).toHaveLength(1);
    expect(body.goals).toHaveLength(1);
    expect(body.captures).toHaveLength(1);
    const text = JSON.stringify(body);
    expect(text).not.toContain("token_hash");
    expect(text).not.toContain("password");
  });
});
