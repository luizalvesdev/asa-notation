import { ProviderError } from "../ai/anthropic.js";
import type { AiProvider } from "../ai/provider.js";
import { UUID_SOURCE, badRequest, isRecord, isUuid, json, notFound, type Route } from "../routing.js";
import { blockTexts, extractCards } from "./extract.js";
import { NothingToStudy, generateCards } from "./generate.js";
import type { CardKind, NewCardInput } from "./model.js";
import { GRADES, type Grade } from "./scheduler.js";
import type { PgStudyStore } from "./store.js";

const MAX_FIELD = 2000;
const MAX_TITLE = 200;
const MAX_BULK = 200;
const MAX_DAYS = 365;

const ID = `(${UUID_SOURCE})`;

const validTitle = (v: unknown): v is string => typeof v === "string" && v.trim().length >= 1 && v.length <= MAX_TITLE;

function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function validTimeZone(tz: string): boolean {
  if (!/^[A-Za-z0-9_+\-/]{1,64}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Valida um card vindo do cliente. Devolve a mensagem de erro ou o card limpo. */
function parseCard(raw: unknown): NewCardInput | string {
  if (!isRecord(raw)) return "invalid_card";
  const kind = raw.kind;
  if (kind !== "basic" && kind !== "cloze") return "invalid_kind";
  const front = typeof raw.front === "string" ? raw.front.trim() : "";
  const back = typeof raw.back === "string" ? raw.back.trim() : "";
  if (front === "" || front.length > MAX_FIELD || back.length > MAX_FIELD) return "invalid_text";
  if (kind === "basic" && back === "") return "invalid_text";
  if (kind === "cloze" && !/\{\{[^{}]+\}\}/.test(front)) return "invalid_cloze";
  const deckId = raw.deckId ?? null;
  if (deckId !== null && !isUuid(deckId)) return "invalid_deck";
  const sourcePageId = raw.sourcePageId ?? null;
  const sourceKey = raw.sourceKey ?? null;
  if (sourcePageId !== null && !isUuid(sourcePageId)) return "invalid_source";
  if (sourceKey !== null && (typeof sourceKey !== "string" || sourceKey.length > MAX_FIELD * 2 || sourcePageId === null)) return "invalid_source";
  return { deckId, kind: kind as CardKind, front, back: kind === "cloze" ? "" : back, sourcePageId, sourceKey };
}

/** `ai` é opcional: sem ele, gerar cards com IA responde que não está configurado. */
export function studyRoutes(store: PgStudyStore, ai?: AiProvider): Route[] {
  return [
    {
      method: "GET",
      pattern: /^\/study\/overview$/,
      access: "session",
      handle: async ({ req }) => {
        const dayStart = parseDate(req.query.dayStart);
        if (!dayStart) return badRequest("invalid_day_start");
        return json(200, await store.overview(dayStart));
      },
    },
    {
      method: "GET",
      pattern: /^\/study\/queue$/,
      access: "session",
      handle: async ({ req }) => {
        const dayStart = parseDate(req.query.dayStart);
        if (!dayStart) return badRequest("invalid_day_start");
        return json(200, { cards: await store.queue(dayStart) });
      },
    },
    {
      method: "GET",
      pattern: /^\/study\/stats$/,
      access: "session",
      handle: async ({ req }) => {
        const tz = req.query.tz ?? "UTC";
        const days = req.query.days === undefined ? 30 : Number(req.query.days);
        if (!validTimeZone(tz) || !Number.isInteger(days) || days < 1 || days > MAX_DAYS) return badRequest("invalid_query");
        return json(200, await store.stats(tz, days));
      },
    },
    {
      method: "POST",
      pattern: /^\/study\/decks$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        const title = typeof body.title === "string" ? body.title.trim() : body.title;
        const goalId = body.goalId ?? null;
        if (!validTitle(title)) return badRequest("invalid_title");
        if (goalId !== null && !isUuid(goalId)) return badRequest("invalid_goal");
        const result = await store.createDeck(title, goalId);
        return result.kind === "ok" ? json(201, { deck: result.deck }) : json(404, { error: "goal_not_found" });
      },
    },
    {
      method: "PATCH",
      pattern: new RegExp(`^/study/decks/${ID}$`),
      access: "session",
      handle: async ({ req, match }) => {
        const body = isRecord(req.body) ? req.body : {};
        const patch: { title?: string; goalId?: string | null } = {};
        if (body.title !== undefined) {
          const title = typeof body.title === "string" ? body.title.trim() : body.title;
          if (!validTitle(title)) return badRequest("invalid_title");
          patch.title = title;
        }
        if (body.goalId !== undefined) {
          if (body.goalId !== null && !isUuid(body.goalId)) return badRequest("invalid_goal");
          patch.goalId = body.goalId;
        }
        if (Object.keys(patch).length === 0) return badRequest("empty_patch");
        const result = await store.updateDeck(match[1]!, patch);
        if (result.kind === "ok") return json(200, { deck: result.deck });
        return result.kind === "not_found" ? notFound() : json(404, { error: "goal_not_found" });
      },
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^/study/decks/${ID}$`),
      access: "session",
      handle: async ({ match }) => ((await store.deleteDeck(match[1]!)) ? json(200, { deleted: 1 }) : notFound()),
    },
    {
      method: "GET",
      pattern: /^\/study\/cards$/,
      access: "session",
      handle: async ({ req }) => {
        const deck = req.query.deckId;
        if (deck !== undefined && deck !== "none" && !isUuid(deck)) return badRequest("invalid_deck");
        return json(200, { cards: await store.listCards(deck === undefined ? undefined : deck === "none" ? null : deck) });
      },
    },
    {
      method: "POST",
      pattern: /^\/study\/cards$/,
      access: "session",
      handle: async ({ req }) => {
        const card = parseCard(req.body);
        if (typeof card === "string") return badRequest(card);
        if (card.deckId && !(await store.deckExists(card.deckId))) return json(404, { error: "deck_not_found" });
        // "Também ao contrário": um segundo card que pergunta pela resposta.
        const both = isRecord(req.body) && req.body.reverse === true && card.kind === "basic";
        const { created } = await store.createCards(both ? [card, { ...card, front: card.back, back: card.front }] : [card]);
        return json(201, { created });
      },
    },
    {
      method: "POST",
      pattern: /^\/study\/cards\/bulk$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        const deckId = body.deckId ?? null;
        if (deckId !== null && !isUuid(deckId)) return badRequest("invalid_deck");
        if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_BULK) return badRequest("invalid_items");
        const cards: NewCardInput[] = [];
        for (const raw of body.items) {
          const card = parseCard(isRecord(raw) ? { ...raw, deckId } : raw);
          if (typeof card === "string") return badRequest(card);
          cards.push(card);
        }
        if (deckId && !(await store.deckExists(deckId))) return json(404, { error: "deck_not_found" });
        return json(201, await store.createCards(cards));
      },
    },
    {
      method: "PATCH",
      pattern: new RegExp(`^/study/cards/${ID}$`),
      access: "session",
      handle: async ({ req, match }) => {
        const body = isRecord(req.body) ? req.body : {};
        const cur = await store.getCard(match[1]!);
        if (!cur) return notFound();
        const card = parseCard({
          kind: cur.kind,
          front: body.front ?? cur.front,
          back: body.back ?? cur.back,
          deckId: body.deckId === undefined ? cur.deckId : body.deckId,
        });
        if (typeof card === "string") return badRequest(card);
        if (card.deckId && !(await store.deckExists(card.deckId))) return json(404, { error: "deck_not_found" });
        const updated = await store.updateCard(cur.id, { front: card.front, back: card.back, deckId: card.deckId });
        return updated ? json(200, { card: updated }) : notFound();
      },
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^/study/cards/${ID}$`),
      access: "session",
      handle: async ({ match }) => ((await store.deleteCard(match[1]!)) ? json(200, { deleted: 1 }) : notFound()),
    },
    {
      method: "POST",
      pattern: new RegExp(`^/study/cards/${ID}/review$`),
      access: "session",
      handle: async ({ req, match }) => {
        const body = isRecord(req.body) ? req.body : {};
        const grade = body.rating;
        if (typeof grade !== "number" || !(GRADES as number[]).includes(grade)) return badRequest("invalid_rating");
        const duration = body.durationMs;
        if (duration !== undefined && (typeof duration !== "number" || !Number.isInteger(duration) || duration < 0 || duration > 3_600_000)) {
          return badRequest("invalid_duration");
        }
        const result = await store.review(match[1]!, grade as Grade, (duration as number | undefined) ?? null);
        return result.kind === "ok" ? json(200, { dueAt: result.dueAt, state: result.state, preview: result.preview }) : notFound();
      },
    },
    {
      method: "POST",
      pattern: /^\/study\/extract$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        if (!isUuid(body.pageId)) return badRequest("invalid_page");
        const doc = await store.pageBody(body.pageId);
        if (doc === undefined) return notFound();
        const candidates = extractCards(blockTexts(doc));
        const exists = await store.candidatesExist(body.pageId, candidates);
        return json(200, { candidates: candidates.map((c, i) => ({ ...c, exists: exists[i] ?? false })) });
      },
    },
    {
      method: "POST",
      pattern: /^\/study\/generate$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        if (!isUuid(body.pageId)) return badRequest("invalid_page");
        const page = await store.page(body.pageId);
        if (!page) return notFound();
        const model = ai ? await ai.forTurn() : null;
        if (!model) return json(409, { error: "ai_not_configured" });
        try {
          const candidates = await generateCards(model, page.title, blockTexts(page.body));
          const exists = await store.candidatesExist(body.pageId, candidates);
          return json(200, { candidates: candidates.map((c, i) => ({ ...c, exists: exists[i] ?? false })) });
        } catch (err) {
          if (err instanceof NothingToStudy) return badRequest("page_too_short");
          if (err instanceof ProviderError) return json(err.status === 429 ? 429 : 502, { error: err.status === 429 ? "ai_busy" : "ai_failed" });
          throw err;
        }
      },
    },
  ];
}
