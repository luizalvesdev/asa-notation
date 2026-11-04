import type { Page, SearchHit, TreeNode } from "@asa/core";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`api error ${status}`);
  }

  get code(): string | undefined {
    const body = this.body as { error?: unknown } | null;
    return typeof body?.error === "string" ? body.error : undefined;
  }
}

export const UNAUTHORIZED_EVENT = "asa:unauthorized";

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data: unknown = text === "" ? null : JSON.parse(text);
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(response.status, data);
  }
  return data as T;
}

export interface Me {
  authenticated: boolean;
  hasPasskeys: boolean;
}

export interface PageDraft {
  title?: string;
  parentId?: string | null;
  body?: unknown;
  props?: Record<string, unknown>;
}

export const api = {
  me: () => request<Me>("GET", "/auth/me"),
  logout: () => request<{ ok: true }>("POST", "/auth/logout"),
  registerOptions: (bootstrapToken: string) =>
    request<unknown>("POST", "/auth/passkey/register/options", undefined, { "x-bootstrap-token": bootstrapToken }),
  registerVerify: (name: string, response: unknown) =>
    request<{ ok: true }>("POST", "/auth/passkey/register/verify", { name, response }),
  loginOptions: () => request<unknown>("POST", "/auth/passkey/login/options"),
  loginVerify: (response: unknown) => request<{ ok: true }>("POST", "/auth/passkey/login/verify", { response }),

  head: () => request<{ seq: number }>("GET", "/sync/head"),
  tree: () => request<{ pages: TreeNode[] }>("GET", "/tree"),
  search: (q: string) => request<{ hits: SearchHit[] }>("GET", `/search?q=${encodeURIComponent(q)}`),
  getPage: (id: string) => request<Page>("GET", `/pages/${id}`),
  createPage: (draft: PageDraft) => request<Page>("POST", "/pages", draft),
  updatePage: (id: string, baseRev: number, patch: PageDraft) =>
    request<Page>("PATCH", `/pages/${id}`, { baseRev, ...patch }),
  deletePage: (id: string) => request<{ ok: true }>("DELETE", `/pages/${id}`),
};
