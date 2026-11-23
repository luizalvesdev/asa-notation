import type { Page, PagePatch, SearchHit, TrashItem, TreeNode } from "./pages-types";
import { NetworkError } from "./capture-outbox";
import { SseParser } from "./sse";
import type { Capture, Counts, Kind, KindFilter } from "./captures-types";
import type { Goal, GoalPatch, NewGoalInput, OutlineGroup } from "./goals-types";
import type { Candidate, Deck, NewCardInput, Overview, QueueCard, ReviewResponse, Stats, StudyCard } from "./study-types";
import type { ApiToken, Settings } from "./settings-types";
import type { Notification, ProgressData, RoutineWeek, WeeklyReview } from "./routine-types";
import type { Agent, ChatMessage, Conversation } from "./chat-types";
import type { NewTaskInput, TaskItem, TaskList } from "./tasks-types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

let onUnauthorized: (() => void) | null = null;

/** Chamado quando qualquer rota responde 401 (sessão expirou). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch só rejeita quando não há conexão com o servidor.
    throw new NetworkError("offline");
  }
  const data: unknown = await res.json().catch(() => null);
  if (res.status === 401) onUnauthorized?.();
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const pagesApi = {
  tree: () => request<{ pages: TreeNode[] }>("GET", "/pages/tree").then((r) => r.pages),
  /** Página raiz da seção Minha Carreira (criada na primeira vez). */
  ensureCareer: () => request<{ page: Page }>("POST", "/pages/career").then((r) => r.page),
  get: (id: string) => request<{ page: Page }>("GET", `/pages/${id}`).then((r) => r.page),
  create: (input: { parentId?: string | null; title?: string; body?: unknown; icon?: string; kind?: "page" | "database" | "row" | "canvas"; props?: Record<string, unknown> }) =>
    request<{ page: Page }>("POST", "/pages", input).then((r) => r.page),
  update: (id: string, patch: PagePatch, baseRev?: number) =>
    request<{ page: Page }>("PATCH", `/pages/${id}`, baseRev === undefined ? patch : { ...patch, baseRev }).then((r) => r.page),
  remove: (id: string) => request<{ deleted: number }>("DELETE", `/pages/${id}`),
  restore: (id: string) => request<{ page: Page }>("POST", `/pages/${id}/restore`).then((r) => r.page),
  trash: () => request<{ items: TrashItem[] }>("GET", "/pages/trash").then((r) => r.items),
  rows: (databaseId: string) => request<{ rows: import("./db-types").Row[] }>("GET", `/databases/${databaseId}/rows`).then((r) => r.rows),
  backlinks: (id: string) => request<{ pages: { id: string; title: string; icon: string | null }[] }>("GET", `/pages/${id}/backlinks`).then((r) => r.pages),
  versions: (id: string) => request<{ versions: { id: number; title: string; createdAt: string; excerpt: string }[] }>("GET", `/pages/${id}/versions`).then((r) => r.versions),
  version: (id: string, versionId: number) => request<{ version: { id: number; title: string; body: unknown; createdAt: string } }>("GET", `/pages/${id}/versions/${versionId}`).then((r) => r.version),
  restoreVersion: (id: string, versionId: number) => request<{ page: Page }>("POST", `/pages/${id}/versions/${versionId}/restore`).then((r) => r.page),
  share: (id: string) => request<{ share: { slug: string; views: number } | null }>("GET", `/pages/${id}/share`).then((r) => r.share),
  enableShare: (id: string) => request<{ share: { slug: string; views: number } }>("POST", `/pages/${id}/share`).then((r) => r.share),
  disableShare: (id: string) => request<{ unshared: number }>("DELETE", `/pages/${id}/share`),
  search: (q: string) => request<{ hits: SearchHit[] }>("GET", `/pages/search?q=${encodeURIComponent(q)}&limit=20`).then((r) => r.hits),
};

export const publicApi = {
  get: (slug: string) => request<{ page: { title: string; icon: string | null; cover: string | null; kind: string; body: unknown; updatedAt: string } }>("GET", `/public/${slug}`).then((r) => r.page),
};

export const tasksApi = {
  list: (from: string, to: string, today: string) =>
    request<TaskList>("GET", `/tasks?from=${from}&to=${to}&today=${today}`),
  create: (input: NewTaskInput) => request<{ task: TaskItem }>("POST", "/tasks", input).then((r) => r.task),
  update: (id: string, patch: { title?: string; date?: string | null; time?: string | null; goalId?: string | null }) =>
    request<{ task: TaskItem }>("PATCH", `/tasks/${id}`, patch).then((r) => r.task),
  setDone: (id: string, done: boolean, date: string | null) =>
    request<{ done: boolean }>("POST", `/tasks/${id}/done`, date ? { done, date } : { done }),
  reschedule: (ids: string[], date: string) => request<{ updated: number }>("POST", "/tasks/reschedule", { ids, date }),
  remove: (id: string) => request<{ deleted: number }>("DELETE", `/tasks/${id}`),
  restore: (id: string) => request<{ task: TaskItem }>("POST", `/tasks/${id}/restore`).then((r) => r.task),
};

export const goalsApi = {
  list: () => request<{ goals: Goal[] }>("GET", "/goals").then((r) => r.goals),
  get: (id: string) => request<{ goal: Goal; tasks: TaskItem[]; outline: OutlineGroup[] | null }>("GET", `/goals/${id}`),
  create: (input: NewGoalInput) => request<{ goal: Goal }>("POST", "/goals", input).then((r) => r.goal),
  update: (id: string, patch: GoalPatch) => request<{ goal: Goal }>("PATCH", `/goals/${id}`, patch).then((r) => r.goal),
  remove: (id: string) => request<{ deleted: number }>("DELETE", `/goals/${id}`),
  restore: (id: string) => request<{ goal: Goal }>("POST", `/goals/${id}/restore`).then((r) => r.goal),
};

export const capturesApi = {
  list: (filter: KindFilter = "all") =>
    request<{ items: Capture[]; counts: Counts }>("GET", filter === "all" ? "/captures" : `/captures?kind=${filter}`),
  create: (input: { id?: string; text: string; kind?: Kind | null; createdAt?: string }) =>
    request<{ capture: Capture }>("POST", "/captures", input).then((r) => r.capture),
  bulk: (ids: string[], op: { action: "archive" } | { action: "restore" } | { action: "kind"; kind: Kind | null }) =>
    request<{ updated: number }>("POST", "/captures/bulk", { ids, ...op }),
  move: (id: string, parentId: string | null) => request<{ page: Page }>("POST", `/captures/${id}/move`, { parentId }).then((r) => r.page),
};

export type WritingAction = "improve_page" | "improve_selection" | "explain" | "write";
export type WritingVoice = "renato" | "tutor" | "hermes";

/** IA dentro da página: devolve Markdown para prévia; nada é salvo no servidor. */
export const writingApi = {
  run: (input: { action: WritingAction; title: string; page: string; selection?: string; instruction?: string; voice?: WritingVoice }) =>
    request<{ markdown: string; truncated: boolean }>("POST", "/ai/writing", input),
};

export const studyApi = {
  overview: (dayStart: string) => request<Overview>("GET", `/study/overview?dayStart=${encodeURIComponent(dayStart)}`),
  queue: (dayStart: string) => request<{ cards: QueueCard[] }>("GET", `/study/queue?dayStart=${encodeURIComponent(dayStart)}`).then((r) => r.cards),
  stats: (tz: string, days: number) => request<Stats>("GET", `/study/stats?tz=${encodeURIComponent(tz)}&days=${days}`),
  review: (id: string, rating: number, durationMs: number) => request<ReviewResponse>("POST", `/study/cards/${id}/review`, { rating, durationMs }),
  cards: (deckId: string | "none") => request<{ cards: StudyCard[] }>("GET", `/study/cards?deckId=${deckId}`).then((r) => r.cards),
  createCard: (input: NewCardInput & { reverse?: boolean }) => request<{ created: number }>("POST", "/study/cards", input),
  updateCard: (id: string, patch: { front?: string; back?: string; deckId?: string | null }) => request<{ card: StudyCard }>("PATCH", `/study/cards/${id}`, patch).then((r) => r.card),
  generate: (pageId: string) => request<{ candidates: Candidate[] }>("POST", "/study/generate", { pageId }).then((r) => r.candidates),
  createCards: (deckId: string | null, items: NewCardInput[]) => request<{ created: number; skipped: number }>("POST", "/study/cards/bulk", { deckId, items }),
  deleteCard: (id: string) => request<{ deleted: number }>("DELETE", `/study/cards/${id}`),
  extract: (pageId: string) => request<{ candidates: Candidate[] }>("POST", "/study/extract", { pageId }).then((r) => r.candidates),
  createDeck: (title: string, goalId: string | null) => request<{ deck: Deck }>("POST", "/study/decks", { title, goalId }).then((r) => r.deck),
  updateDeck: (id: string, patch: { title?: string; goalId?: string | null }) => request<{ deck: Deck }>("PATCH", `/study/decks/${id}`, patch).then((r) => r.deck),
  deleteDeck: (id: string) => request<{ deleted: number }>("DELETE", `/study/decks/${id}`),
};

export const settingsApi = {
  get: () => request<{ settings: Settings }>("GET", "/settings").then((r) => r.settings),
  patch: (patch: { timezone?: string; weekStart?: 0 | 1; checkins?: Partial<Settings["checkins"]>; checkinsEnabled?: Partial<Settings["checkinsEnabled"]>; quiet?: Partial<Settings["quiet"]>; aiAutoApply?: boolean }) =>
    request<{ settings: Settings }>("PATCH", "/settings", patch).then((r) => r.settings),
};

export const tokensApi = {
  list: () => request<{ tokens: ApiToken[] }>("GET", "/tokens").then((r) => r.tokens),
  create: (name: string, scope: "read" | "write") => request<{ token: ApiToken; secret: string }>("POST", "/tokens", { name, scope }),
  revoke: (id: string) => request<{ revoked: number }>("DELETE", `/tokens/${id}`),
};

export const accountApi = {
  changePassword: (currentPassword: string, newPassword: string) => request<{ ok: true }>("POST", "/auth/password/change", { currentPassword, newPassword }),
  exportAll: () => request<{ pages: { id: string; parent_id: string | null; title: string; body: unknown }[] } & Record<string, unknown>>("GET", "/export"),
};

export interface PushDevice {
  id: string;
  label: string;
  service: string;
  createdAt: string;
  lastOkAt: string | null;
}

export const pushApi = {
  get: () => request<{ publicKey: string; subscriptions: PushDevice[] }>("GET", "/push"),
  subscribe: (sub: PushSubscriptionJSON, label: string) => request<{ ok: true }>("POST", "/push/subscriptions", { ...sub, label }),
  unsubscribe: (endpoint: string) => request<{ ok: true }>("DELETE", "/push/subscriptions", { endpoint }),
  remove: (id: string) => request<{ ok: true }>("DELETE", `/push/subscriptions/${id}`),
  test: () => request<{ sent: number; removed: number; failed: number }>("POST", "/push/test"),
};

export const notificationsApi = {
  list: (filter: "all" | "unread") => request<{ items: Notification[]; unread: number }>("GET", `/notifications?filter=${filter}`),
  count: () => request<{ unread: number }>("GET", "/notifications/count").then((r) => r.unread),
  setRead: (id: string, read: boolean) => request<{ read: boolean }>("PATCH", `/notifications/${id}`, { read }),
  readAll: () => request<{ updated: number }>("POST", "/notifications/read-all"),
};

export const routineApi = {
  week: (start: string, tz: string) => request<RoutineWeek>("GET", `/routine/week?start=${start}&tz=${encodeURIComponent(tz)}`),
  saveReview: (weekStart: string, patch: { rating?: number | null; worked?: string; blocked?: string; focus?: string[] }) =>
    request<{ review: WeeklyReview }>("PUT", "/routine/review", { weekStart, ...patch }).then((r) => r.review),
  apply: (weekStart: string) => request<{ created: number; date: string }>("POST", "/routine/review/apply", { weekStart }),
};

export const aiApi = {
  status: () => request<{ provider: "anthropic" | "bedrock"; configured: boolean; last4: string | null; model: string; autoApply: boolean }>("GET", "/ai/status"),
  setKey: (key: string) => request<{ configured: boolean; last4: string }>("PUT", "/ai/key", { key }),
  removeKey: () => request<{ removed: number }>("DELETE", "/ai/key"),
};

export interface ChatStreamHandlers {
  /** Pedaço de texto da resposta. */
  onDelta: (text: string) => void;
  /** O modelo vai responder de novo (depois de usar ferramentas): o texto parcial anterior deixa de valer. */
  onStep: () => void;
  onTool: (event: { name: string; phase: "start" | "end" }) => void;
}

type ChatResult = { conversation: Conversation; messages: ChatMessage[] };

export const chatApi = {
  conversations: (agent: Agent) => request<{ conversations: Conversation[] }>("GET", `/chat/conversations?agent=${agent}`).then((r) => r.conversations),
  open: (id: string) => request<{ conversation: Conversation; messages: ChatMessage[] }>("GET", `/chat/conversations/${id}`),
  remove: (id: string) => request<{ deleted: number }>("DELETE", `/chat/conversations/${id}`),
  send: (agent: Agent, text: string, conversationId: string | null) =>
    request<ChatResult>("POST", "/chat/send", conversationId ? { agent, text, conversationId } : { agent, text }),
  /**
   * Como `send`, mas o texto chega aos poucos. Se o servidor não tem a rota (versão antiga) cai no `send`.
   * Onde a infraestrutura segura a resposta (API Gateway), os eventos chegam juntos no fim e tudo continua funcionando.
   */
  async stream(agent: Agent, text: string, conversationId: string | null, handlers: ChatStreamHandlers): Promise<ChatResult> {
    const payload = conversationId ? { agent, text, conversationId } : { agent, text };
    let res: Response;
    try {
      res = await fetch("/api/chat/stream", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    } catch {
      throw new NetworkError("offline");
    }
    if (res.status === 401) onUnauthorized?.();
    if (res.status === 404 || res.status === 405) return chatApi.send(agent, text, conversationId);
    if (!res.ok || !res.body) throw new ApiError(res.status, await res.json().catch(() => null));

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    let result: ChatResult | null = null;
    const handle = (event: unknown) => {
      const e = event as { type?: string; text?: string; name?: string; phase?: "start" | "end"; status?: number; body?: unknown };
      if (e.type === "delta" && typeof e.text === "string") handlers.onDelta(e.text);
      else if (e.type === "step") handlers.onStep();
      else if (e.type === "tool" && typeof e.name === "string" && e.phase) handlers.onTool({ name: e.name, phase: e.phase });
      else if (e.type === "done") result = { conversation: (event as ChatResult).conversation, messages: (event as ChatResult).messages };
      else if (e.type === "error") throw new ApiError(e.status ?? 500, e.body ?? null);
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const event of parser.push(decoder.decode(value, { stream: true }))) handle(event);
      }
      for (const event of parser.flush()) handle(event);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new NetworkError("interrupted");
    }
    if (!result) throw new NetworkError("interrupted");
    return result;
  },
  approve: (id: string) => request<{ status: "approved"; result: Record<string, unknown> }>("POST", `/chat/drafts/${id}/approve`),
  discard: (id: string) => request<{ status: "discarded" }>("POST", `/chat/drafts/${id}/discard`),
};

export const progressApi = {
  get: (today: string, tz: string, weeks: number) => request<ProgressData>("GET", `/progress?today=${today}&tz=${encodeURIComponent(tz)}&weeks=${weeks}`),
};

export function isConflict(err: unknown): err is ApiError & { body: { page: Page } } {
  return err instanceof ApiError && err.status === 409 && typeof err.body === "object" && err.body !== null && "page" in err.body;
}
