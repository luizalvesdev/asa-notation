import { DEFAULT_MODEL, ProviderError, createModel, type FetchLike } from "../ai/anthropic.js";
import type { PgCaptureStore } from "../captures/store.js";
import type { PgGoalStore } from "../goals/store.js";
import type { PgPageStore } from "../pages/store.js";
import { UUID_SOURCE, badRequest, isRecord, json, notFound, type Route } from "../routing.js";
import type { PgSecretStore } from "../secrets/store.js";
import type { PgSettingsStore } from "../settings/store.js";
import { localParts } from "../notifications/checkins.js";
import type { PgTaskStore } from "../tasks/store.js";
import { runTurn, trimHistory } from "./agent.js";
import { markdownToDoc } from "./markdown.js";
import type { Agent, DraftKind, PgChatStore } from "./store.js";
import { systemPrompt, toolsFor } from "./tools.js";

const KEY_NAME = "anthropic";
const MAX_TEXT = 4000;
const ID = `(${UUID_SOURCE})`;

interface Deps {
  chat: PgChatStore;
  secrets: PgSecretStore;
  settings: PgSettingsStore;
  tasks: PgTaskStore;
  goals: PgGoalStore;
  pages: PgPageStore;
  captures: PgCaptureStore;
  fetchImpl: FetchLike;
  now: () => number;
}

const isAgent = (v: unknown): v is Agent => v === "hermes" || v === "renato";

/** Resposta HTTP para uma falha do provedor, sem vazar detalhes. */
function providerFailure(err: ProviderError) {
  if (err.status === 401 || err.status === 403) return json(502, { error: "invalid_key" });
  if (err.status === 429) return json(429, { error: "rate_limited" });
  if (err.status === 0) return json(504, { error: err.message === "timeout" ? "provider_timeout" : "provider_unreachable" });
  return json(502, { error: "provider_error" });
}

export function chatRoutes(deps: Deps): Route[] {
  const { chat, secrets, settings, fetchImpl } = deps;

  return [
    {
      method: "GET",
      pattern: /^\/ai\/status$/,
      access: "session",
      handle: async () => json(200, { configured: (await secrets.last4(KEY_NAME)) !== null, last4: await secrets.last4(KEY_NAME), model: DEFAULT_MODEL }),
    },
    {
      method: "PUT",
      pattern: /^\/ai\/key$/,
      access: "owner",
      handle: async ({ req }) => {
        const key = isRecord(req.body) && typeof req.body.key === "string" ? req.body.key.trim() : "";
        if (key.length < 20 || key.length > 300 || /\s/.test(key)) return badRequest("invalid_key");
        // Testa com uma chamada mínima antes de guardar.
        try {
          await createModel(key, DEFAULT_MODEL, fetchImpl)({ system: "Responda apenas: ok", messages: [{ role: "user", content: "ok" }], tools: [], maxTokens: 8 });
        } catch (err) {
          if (err instanceof ProviderError && (err.status === 401 || err.status === 403)) return badRequest("key_rejected");
          if (err instanceof ProviderError && err.status !== 0 && err.status !== 429) return json(502, { error: "provider_error" });
          if (err instanceof ProviderError) return providerFailure(err);
          throw err;
        }
        await secrets.set(KEY_NAME, key);
        return json(200, { configured: true, last4: key.slice(-4) });
      },
    },
    {
      method: "DELETE",
      pattern: /^\/ai\/key$/,
      access: "owner",
      handle: async () => ((await secrets.remove(KEY_NAME)) ? json(200, { removed: 1 }) : notFound()),
    },
    {
      method: "GET",
      pattern: /^\/chat\/conversations$/,
      access: "session",
      handle: async ({ req }) => {
        const agent = req.query.agent;
        if (!isAgent(agent)) return badRequest("invalid_agent");
        return json(200, { conversations: await chat.list(agent) });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^/chat/conversations/${ID}$`),
      access: "session",
      handle: async ({ match }) => {
        const conversation = await chat.get(match[1]!);
        return conversation ? json(200, { conversation, messages: await chat.visible(conversation.id) }) : notFound();
      },
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^/chat/conversations/${ID}$`),
      access: "session",
      handle: async ({ match }) => ((await chat.remove(match[1]!)) ? json(200, { deleted: 1 }) : notFound()),
    },
    {
      method: "POST",
      pattern: /^\/chat\/send$/,
      access: "session",
      handle: async ({ req, now }) => {
        const body = isRecord(req.body) ? req.body : {};
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!isAgent(body.agent)) return badRequest("invalid_agent");
        if (text === "" || text.length > MAX_TEXT) return badRequest("invalid_text");
        if (body.conversationId !== undefined && typeof body.conversationId !== "string") return badRequest("invalid_conversation");
        const agent = body.agent;

        const apiKey = await secrets.get(KEY_NAME);
        if (!apiKey) return json(412, { error: "no_key" });

        let conversation = body.conversationId ? await chat.get(body.conversationId as string) : null;
        if (body.conversationId && (!conversation || conversation.agent !== agent)) return notFound();
        const conversationId = conversation?.id ?? (await chat.create(agent, "")).id;
        conversation = conversation ?? (await chat.get(conversationId))!;

        const config = await settings.get();
        const today = localParts(now, config.timezone).date;
        const draftIds: string[] = [];
        const { specs, handlers } = toolsFor(agent, {
          tasks: deps.tasks,
          goals: deps.goals,
          pages: deps.pages,
          captures: deps.captures,
          today,
          draft: async (kind: DraftKind, payload) => {
            const id = await chat.addDraft(conversationId, kind, payload);
            draftIds.push(id);
            return id;
          },
        });

        const history = trimHistory(await chat.replay(conversationId));
        let turn;
        try {
          turn = await runTurn(history, text, { system: systemPrompt(agent, today, config.timezone), specs, handlers, model: createModel(apiKey, DEFAULT_MODEL, fetchImpl) });
        } catch (err) {
          if (err instanceof ProviderError) {
            // Rascunhos criados antes da falha não servem a ninguém.
            return providerFailure(err);
          }
          throw err;
        }

        // Guarda o turno: o que o usuário viu fica visível; chamadas e resultados de ferramenta ficam só para o histórico.
        let finalId = "";
        for (let i = 0; i < turn.messages.length; i++) {
          const m = turn.messages[i]!;
          const isFinal = i === turn.messages.length - 1 && m.role === "assistant";
          const isUserText = i === 0;
          const id = await chat.add(conversationId, m.role, m.content, isUserText ? text : isFinal ? turn.text : "", isUserText || isFinal);
          if (isFinal) finalId = id;
        }
        await chat.attachDrafts(draftIds, finalId);
        await chat.touch(conversationId, text.slice(0, 60));
        const messages = await chat.visible(conversationId);
        return json(200, { conversation: await chat.get(conversationId), messages });
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/chat/drafts/${ID}/(approve|discard)$`),
      access: "session",
      handle: async ({ match }) => {
        const draft = await chat.draft(match[1]!);
        if (!draft) return notFound();
        if (draft.status !== "pending") return json(409, { error: "already_decided" });

        if (match[2] === "discard") {
          await chat.decide(draft.id, "discarded", null);
          return json(200, { status: "discarded" });
        }

        let result: Record<string, unknown>;
        if (draft.kind === "tasks") {
          const tasks = draft.payload.tasks as { title: string; date: string | null; time: string | null }[];
          const ids: string[] = [];
          for (const t of tasks) {
            const created = await deps.tasks.create({ title: t.title, parentId: null, date: t.date, time: t.time, recurrence: null, goalId: null });
            if (created.kind === "ok") ids.push(created.task.id);
          }
          result = { created: ids.length, ids };
        } else if (draft.kind === "capture") {
          const created = await deps.captures.create({ text: draft.payload.text as string, kind: (draft.payload.kind as never) ?? null });
          result = { id: created.id };
        } else {
          const p = draft.payload as { title: string; markdown?: string; mermaid?: string; parentId: string | null };
          const body = p.mermaid ? { type: "doc", content: [{ type: "mermaid", attrs: { code: p.mermaid } }] } : markdownToDoc(p.markdown ?? "");
          const parentId = p.parentId && (await deps.pages.get(p.parentId)) ? p.parentId : null;
          const page = await deps.pages.create({ parentId, title: p.title, icon: null, body });
          result = { pageId: page?.id ?? null };
        }
        // Só marca como aprovado se ninguém decidiu antes (duas abas).
        if (!(await chat.decide(draft.id, "approved", result))) return json(409, { error: "already_decided" });
        return json(200, { status: "approved", result });
      },
    },
  ];
}
