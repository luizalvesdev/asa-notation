/**
 * Teste de fumaça dos assistentes contra o modelo de verdade.
 *
 *   read -s ANTHROPIC_API_KEY; export ANTHROPIC_API_KEY
 *   npm run smoke:chat -w @asa/api
 *
 * Usa um banco em memória (não toca no seu .dev), lê a chave só do ambiente, guarda no cofre desse banco
 * temporário e nunca a imprime. `SMOKE_MOCK=1` roda o mesmo roteiro com o provedor de mentira (para conferir o script).
 */
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { createApp } from "../src/app.js";
import { DEFAULT_SESSION_TTL_SECONDS, type AuthConfig } from "../src/auth/config.js";
import { hashPassword } from "../src/auth/password.js";
import { PgAuthStore } from "../src/auth/store.js";
import { mockProvider } from "../src/dev-ai-mock.js";
import { readMigrations } from "../src/migrations.js";
import { secretsKey } from "../src/secrets/crypto.js";
import { PgSecretStore } from "../src/secrets/store.js";
import type { SqlClient } from "../src/sql.js";

const ORIGIN = "http://localhost:5173";
const PASSWORD = "senha-de-teste-do-smoke-1234";
const mock = !!process.env.SMOKE_MOCK;
const key = process.env.ANTHROPIC_API_KEY ?? (mock ? "sk-ant-mock-0000000000000000" : "");

if (!key) {
  console.error("Defina ANTHROPIC_API_KEY no ambiente (ex.: read -s ANTHROPIC_API_KEY; export ANTHROPIC_API_KEY).");
  process.exit(2);
}

const config: AuthConfig = { origins: [ORIGIN], sessionSecret: "smoke-session-secret-0123456789-abcdef", secureCookies: false, sessionTtlSeconds: DEFAULT_SESSION_TTL_SECONDS };

const db = new PGlite({ extensions: { unaccent } });
for (const m of readMigrations(new URL("../apps/api/migrations/", import.meta.url))) await db.exec(m.sql);
const sql: SqlClient = { query: async (text, params) => (await db.query(text, params)).rows as Record<string, unknown>[] };
const api = createApp({ sql, config, ...(mock ? { fetchImpl: mockProvider } : {}) });

await new PgAuthStore(sql).setPassword(await hashPassword(PASSWORD), new Date().toISOString());
await new PgSecretStore(sql, secretsKey(config.sessionSecret)).set("anthropic", key);

const login = await api({ method: "POST", path: "/auth/password/login", query: {}, headers: { origin: ORIGIN }, body: { password: PASSWORD } });
const session = login.cookies?.[0]?.split(";")[0]?.split("=").slice(1).join("=") ?? "";

async function call(method: string, path: string, body?: unknown, query: Record<string, string> = {}) {
  const res = await api({ method, path, query, headers: { origin: ORIGIN }, cookies: { asa_session: session }, body });
  return { status: res.status, body: res.body as Record<string, any> };
}

// ---- dados de exemplo ----
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
await call("POST", "/tasks", { title: "Enviar proposta revisada ao cliente", date: day(-1) });
await call("POST", "/tasks", { title: "Daily do trabalho", date: day(0), time: "09:30" });
await call("POST", "/goals", { title: "Certificação em sistemas distribuídos", dueDate: day(120) });
await call("POST", "/pages", { title: "Idempotência em filas", body: { type: "doc", content: [para("Retry seguro exige chave de idempotência. Guardar o resultado da primeira execução e devolver o mesmo em repetições.")] } });
await call("POST", "/pages", { title: "Consenso com Raft", body: { type: "doc", content: [para("Raft elege um líder por termo e replica o log para os seguidores.")] } });
await call("POST", "/study/cards", { kind: "basic", front: "O que é quorum?", back: "A maioria dos nós." });
const queue = (await call("GET", "/study/queue", undefined, { dayStart: new Date(new Date().setHours(0, 0, 0, 0)).toISOString() })).body.cards as { id: string }[];
for (let i = 0; i < 2; i++) await call("POST", `/study/cards/${queue[0]!.id}/review`, { rating: 1 });

// ---- roteiro ----
interface Result { name: string; ok: boolean; notes: string[] }
const results: Result[] = [];

async function scenario(name: string, agent: string, text: string, check: (r: { reply: string; drafts: any[]; tools: string[] }) => string[]) {
  const t0 = Date.now();
  const res = await call("POST", "/chat/send", { agent, text });
  const ms = Date.now() - t0;
  if (res.status !== 200) {
    results.push({ name, ok: false, notes: [`HTTP ${res.status}: ${JSON.stringify(res.body)}`] });
    return null;
  }
  const messages = res.body.messages as { role: string; text: string; drafts: any[] }[];
  const last = messages[messages.length - 1]!;
  const stored = (await db.query("select content from chat_messages where conversation_id = $1 and role = 'assistant' order by seq", [res.body.conversation.id])).rows as { content: { type: string; name?: string }[] }[];
  const tools = stored.flatMap((r) => r.content.filter((b) => b.type === "tool_use").map((b) => b.name!));
  const problems = check({ reply: last.text, drafts: last.drafts, tools });
  results.push({ name, ok: problems.length === 0, notes: [`${ms} ms`, `ferramentas: ${tools.join(", ") || "nenhuma"}`, `rascunhos: ${last.drafts.map((d) => d.kind).join(", ") || "nenhum"}`, `resposta: ${last.text.replace(/\s+/g, " ").slice(0, 220)}`, ...problems.map((p) => `PROBLEMA: ${p}`)] });
  return last;
}

const hermes = await scenario("Hermes planeja o dia seguinte", "hermes", "Organiza meu dia de amanhã com base nas minhas tarefas e metas. Cria as tarefas que fizerem sentido.", ({ reply, drafts, tools }) => [
  ...(tools.includes("list_tasks") || tools.includes("list_goals") ? [] : ["não consultou tarefas nem metas antes de planejar"]),
  ...(drafts.some((d) => d.kind === "tasks") ? [] : ["não propôs um rascunho de tarefas"]),
  ...(/criei|criado|criadas/i.test(reply) && !/rascunho|aprov/i.test(reply) ? ["disse que criou sem falar em rascunho/aprovação"] : []),
]);
const draft = hermes?.drafts.find((d: any) => d.kind === "tasks");
if (draft) {
  const before = (await call("GET", "/tasks", undefined, { from: day(1), to: day(1), today: day(0) })).body.days.length;
  const approved = await call("POST", `/chat/drafts/${draft.id}/approve`);
  const after = (await call("GET", "/tasks", undefined, { from: day(1), to: day(1), today: day(0) })).body.days.length;
  results.push({ name: "Aprovar o rascunho do Hermes", ok: approved.status === 200 && after > before, notes: [`tarefas de amanhã: ${before} -> ${after}`] });
}

await scenario("Renato acha uma nota", "renato", "O que anotei sobre idempotência?", ({ reply, tools }) => [
  ...(tools.includes("search_notes") ? [] : ["não usou search_notes"]),
  ...(/idempot/i.test(reply) ? [] : ["a resposta não menciona a nota encontrada"]),
]);
await scenario("Renato propõe um mapa mental", "renato", "Cria um mapa mental sobre Raft como rascunho de página.", ({ drafts }) => [
  ...(drafts.some((d) => d.kind === "page" && typeof d.payload?.mermaid === "string") ? [] : ["não propôs uma página com diagrama Mermaid"]),
]);
await scenario("Tutor começa um quiz", "tutor", "Me faça um quiz nos meus pontos fracos.", ({ reply, drafts, tools }) => [
  ...(tools.includes("list_weak_cards") ? [] : ["não consultou os pontos fracos"]),
  ...(reply.includes("?") ? [] : ["a resposta não traz uma pergunta"]),
  ...(drafts.length === 0 ? [] : ["o tutor não deveria criar rascunhos"]),
]);

// ---- relatório ----
let failed = 0;
for (const r of results) {
  console.log(`\n${r.ok ? "OK " : "FALHOU"}  ${r.name}`);
  for (const n of r.notes) console.log(`   ${n}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} cenários ok${mock ? " (provedor de mentira)" : ""}.`);
process.exit(failed === 0 ? 0 : 1);
