import type { Page, PagePatch, SearchHit, TrashItem, TreeNode } from "./pages-types";
import { NetworkError } from "./capture-outbox";
import type { Capture, Counts, Kind, KindFilter } from "./captures-types";
import type { Goal, GoalPatch, NewGoalInput } from "./goals-types";
import type { Candidate, Deck, NewCardInput, Overview, QueueCard, ReviewResponse, Stats, StudyCard } from "./study-types";
import type { ApiToken, Settings } from "./settings-types";
import type { Notification, ProgressData, RoutineWeek, WeeklyReview } from "./routine-types";
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
  get: (id: string) => request<{ page: Page }>("GET", `/pages/${id}`).then((r) => r.page),
  create: (input: { parentId?: string | null; title?: string }) =>
    request<{ page: Page }>("POST", "/pages", input).then((r) => r.page),
  update: (id: string, patch: PagePatch, baseRev?: number) =>
    request<{ page: Page }>("PATCH", `/pages/${id}`, baseRev === undefined ? patch : { ...patch, baseRev }).then((r) => r.page),
  remove: (id: string) => request<{ deleted: number }>("DELETE", `/pages/${id}`),
  restore: (id: string) => request<{ page: Page }>("POST", `/pages/${id}/restore`).then((r) => r.page),
  trash: () => request<{ items: TrashItem[] }>("GET", "/pages/trash").then((r) => r.items),
  search: (q: string) => request<{ hits: SearchHit[] }>("GET", `/pages/search?q=${encodeURIComponent(q)}&limit=20`).then((r) => r.hits),
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
  get: (id: string) => request<{ goal: Goal; tasks: TaskItem[] }>("GET", `/goals/${id}`),
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

export const studyApi = {
  overview: (dayStart: string) => request<Overview>("GET", `/study/overview?dayStart=${encodeURIComponent(dayStart)}`),
  queue: (dayStart: string) => request<{ cards: QueueCard[] }>("GET", `/study/queue?dayStart=${encodeURIComponent(dayStart)}`).then((r) => r.cards),
  stats: (tz: string, days: number) => request<Stats>("GET", `/study/stats?tz=${encodeURIComponent(tz)}&days=${days}`),
  review: (id: string, rating: number, durationMs: number) => request<ReviewResponse>("POST", `/study/cards/${id}/review`, { rating, durationMs }),
  cards: (deckId: string | "none") => request<{ cards: StudyCard[] }>("GET", `/study/cards?deckId=${deckId}`).then((r) => r.cards),
  createCard: (input: NewCardInput) => request<{ created: number }>("POST", "/study/cards", input),
  createCards: (deckId: string | null, items: NewCardInput[]) => request<{ created: number; skipped: number }>("POST", "/study/cards/bulk", { deckId, items }),
  deleteCard: (id: string) => request<{ deleted: number }>("DELETE", `/study/cards/${id}`),
  extract: (pageId: string) => request<{ candidates: Candidate[] }>("POST", "/study/extract", { pageId }).then((r) => r.candidates),
  createDeck: (title: string, goalId: string | null) => request<{ deck: Deck }>("POST", "/study/decks", { title, goalId }).then((r) => r.deck),
  updateDeck: (id: string, patch: { title?: string; goalId?: string | null }) => request<{ deck: Deck }>("PATCH", `/study/decks/${id}`, patch).then((r) => r.deck),
  deleteDeck: (id: string) => request<{ deleted: number }>("DELETE", `/study/decks/${id}`),
};

export const settingsApi = {
  get: () => request<{ settings: Settings }>("GET", "/settings").then((r) => r.settings),
  patch: (patch: { timezone?: string; weekStart?: 0 | 1; checkins?: Partial<Settings["checkins"]>; checkinsEnabled?: Partial<Settings["checkinsEnabled"]>; quiet?: Partial<Settings["quiet"]> }) =>
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

export const progressApi = {
  get: (today: string, tz: string, weeks: number) => request<ProgressData>("GET", `/progress?today=${today}&tz=${encodeURIComponent(tz)}&weeks=${weeks}`),
};

export function isConflict(err: unknown): err is ApiError & { body: { page: Page } } {
  return err instanceof ApiError && err.status === 409 && typeof err.body === "object" && err.body !== null && "page" in err.body;
}
