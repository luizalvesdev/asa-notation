import type { Page, PagePatch, TreeNode } from "./pages-types";

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
};

export function isConflict(err: unknown): err is ApiError & { body: { page: Page } } {
  return err instanceof ApiError && err.status === 409 && typeof err.body === "object" && err.body !== null && "page" in err.body;
}
