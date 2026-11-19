/** Conversa com a API do Asa usando o token de API guardado nas opções da extensão. */

export const DEFAULT_SERVER = "https://asa.luizalves.dev";

export interface Config {
  server: string;
  token: string;
}

export interface TreePage {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  kind: string;
  position: string;
}

export interface DateEvent {
  title: string;
  kind: "prova" | "entrega" | "aula" | "outro";
  date: string;
  time: string | null;
  exists: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** Endereço base sem barra no fim, ou null se não for http(s). */
export function normalizeServer(raw: string): string | null {
  const value = raw.trim().replace(/\/+$/, "");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(url.hostname))) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function createApi(config: Config, fetchImpl: typeof fetch = fetch) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${config.server}/api${path}`, {
        method,
        headers: { authorization: `Bearer ${config.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, "offline");
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiError(res.status, data.error ?? `http_${res.status}`);
    return data as T;
  }

  return {
    tree: () => call<{ pages: TreePage[] }>("GET", "/pages/tree").then((r) => r.pages),
    clip: (input: { url: string; title: string; markdown: string; kind: string; parentId: string | null }) =>
      call<{ page: { id: string; title: string; parentId: string } }>("POST", "/clips", input).then((r) => r.page),
    dates: (input: { url: string; title: string; text: string }) => call<{ today: string; events: DateEvent[] }>("POST", "/clips/dates", input),
    createTask: (input: { title: string; date: string; time: string | null }) => call<{ task: { id: string } }>("POST", "/tasks", input),
    pageLink: (id: string) => `${config.server}/#/p/${id}`,
  };
}

export type Api = ReturnType<typeof createApi>;

/** Pastas para escolher: páginas comuns até dois níveis, em ordem, com a de dentro recuada. */
export function folderOptions(pages: TreePage[]): { id: string; label: string }[] {
  const plain = pages.filter((p) => p.kind === "page");
  const byParent = new Map<string | null, TreePage[]>();
  for (const p of plain) byParent.set(p.parentId, [...(byParent.get(p.parentId) ?? []), p]);
  const sorted = (list: TreePage[] = []) => [...list].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  const name = (p: TreePage) => `${p.icon ? `${p.icon} ` : ""}${p.title || "Sem título"}`;
  const out: { id: string; label: string }[] = [];
  for (const top of sorted(byParent.get(null))) {
    out.push({ id: top.id, label: name(top) });
    for (const child of sorted(byParent.get(top.id))) out.push({ id: child.id, label: `   ${name(child)}` });
  }
  return out;
}

export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Algo deu errado.";
  if (err.code === "offline") return "Sem conexão com o Asa. Confira o endereço nas opções.";
  if (err.status === 401) return "Token inválido ou revogado. Crie outro em Configurações > API.";
  if (err.code === "read_only_token") return "Esse token é só de leitura. Crie um de escrita.";
  if (err.code === "ai_not_configured") return "A IA do Asa não está configurada.";
  if (err.code === "ai_busy") return "A IA está ocupada. Tente de novo em instantes.";
  if (err.code === "ai_failed") return "A IA falhou. Tente de novo.";
  if (err.code === "text_too_short") return "Quase não há texto nesta página.";
  if (err.code === "invalid_content") return "Não achei conteúdo para salvar nesta página.";
  return "Não deu certo.";
}
