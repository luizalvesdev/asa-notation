import type { Page, PagePatch, SearchHit, TrashItem, TreeNode } from "./pages-types";
import type { Goal, GoalPatch, NewGoalInput } from "./goals-types";
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
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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

export function isConflict(err: unknown): err is ApiError & { body: { page: Page } } {
  return err instanceof ApiError && err.status === 409 && typeof err.body === "object" && err.body !== null && "page" in err.body;
}
