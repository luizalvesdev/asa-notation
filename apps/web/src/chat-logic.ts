import { ApiError } from "./api";
import type { Draft } from "./chat-types";

export interface DraftView {
  title: string;
  lines: string[];
  /** Verbo do botão de aprovar. */
  approve: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function when(date: unknown, time: unknown): string {
  if (typeof date !== "string") return "";
  const [, m, d] = date.split("-");
  return `${d}/${m}${typeof time === "string" ? ` ${time}` : ""}`;
}

/** Como um rascunho aparece no chat: título, linhas e o texto do botão. */
export function describeDraft(draft: Pick<Draft, "kind" | "payload">): DraftView {
  const p = draft.payload;
  if (draft.kind === "tasks") {
    const tasks = (Array.isArray(p.tasks) ? p.tasks : []) as { title?: string; date?: string | null; time?: string | null }[];
    return { title: `Rascunho · ${plural(tasks.length, "tarefa", "tarefas")}`, lines: tasks.map((t) => `${t.title ?? ""}${t.date ? ` · ${when(t.date, t.time)}` : ""}`), approve: tasks.length === 1 ? "Criar tarefa" : "Criar tarefas" };
  }
  if (draft.kind === "capture") {
    return { title: "Rascunho · captura para a Inbox", lines: [String(p.text ?? "")], approve: "Salvar na Inbox" };
  }
  if (draft.kind === "action") {
    const tool = String(p.tool ?? "");
    const danger = p.danger === true;
    const verb = tool.startsWith("delete_") ? "Apagar" : tool === "rewrite_page" ? "Reescrever" : tool.startsWith("create_") ? "Criar" : tool.startsWith("append_") ? "Acrescentar" : "Aplicar";
    return { title: danger ? "Precisa da sua aprovação" : "Rascunho", lines: [String(p.summary ?? "")], approve: verb };
  }
  const body = typeof p.mermaid === "string" ? "Diagrama Mermaid" : String(p.markdown ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4).join(" · ");
  return { title: `Rascunho · página “${String(p.title ?? "")}”`, lines: body ? [body.length > 160 ? `${body.slice(0, 160)}…` : body] : [], approve: "Criar página" };
}

/** Texto do que aconteceu depois de aprovar. */
export function describeResult(draft: Pick<Draft, "kind" | "result">): string {
  const r = draft.result ?? {};
  if (draft.kind === "tasks") return plural(Number(r.created ?? 0), "tarefa criada", "tarefas criadas");
  if (draft.kind === "capture") return "Salva na Inbox";
  if (draft.kind === "action") return typeof r.message === "string" ? r.message : "Feito";
  return "Página criada";
}

export type ChatErrorKind = "no_key" | "invalid_key" | "rate_limited" | "offline" | "other";

/** Traduz a falha de /chat/send para uma mensagem e para a ação que a tela deve oferecer. */
export function classifyChatError(err: unknown): { kind: ChatErrorKind; message: string } {
  if (err instanceof ApiError) {
    const code = typeof err.body === "object" && err.body !== null ? (err.body as { error?: unknown }).error : undefined;
    if (err.status === 412 || code === "no_key") return { kind: "no_key", message: "Configure uma chave de IA para conversar com os assistentes." };
    if (code === "invalid_key") return { kind: "invalid_key", message: "O provedor recusou a chave. Confira em Configurações > Assistentes." };
    if (err.status === 429) return { kind: "rate_limited", message: "Muitas mensagens em pouco tempo. Aguarde um instante e tente de novo." };
    if (err.status === 504) return { kind: "other", message: "O provedor demorou para responder. Tente de novo." };
    const raw = typeof err.body === "object" && err.body !== null ? (err.body as { detail?: unknown }).detail : undefined;
    if (typeof raw === "string" && /credit balance/i.test(raw)) return { kind: "other", message: "A conta do provedor está sem créditos. Adicione saldo em Plans & Billing (console.anthropic.com) e tente de novo." };
    const detail = typeof err.body === "object" && err.body !== null ? (err.body as { detail?: unknown }).detail : undefined;
    return { kind: "other", message: `Não foi possível falar com o assistente.${typeof detail === "string" && detail ? ` (${detail})` : " Tente de novo."}` };
  }
  return { kind: "offline", message: "Sem conexão. A mensagem não foi enviada." };
}

/** Para onde o "Abrir" de um rascunho aprovado leva (ou null se não há para onde ir, como depois de apagar). */
export function draftTarget(draft: Pick<Draft, "kind" | "payload" | "result">): { page: string } | { route: "hoje" | "metas" | "estudo" | "inbox" } | null {
  const r = draft.result ?? {};
  if (typeof r.pageId === "string") return { page: r.pageId };
  if (draft.kind === "tasks") return { route: "hoje" };
  if (draft.kind === "capture") return { route: "inbox" };
  if (draft.kind === "action") {
    const tool = String(draft.payload.tool ?? "");
    if (tool.startsWith("delete_")) return null;
    if (tool.endsWith("_task")) return { route: "hoje" };
    if (tool.endsWith("_goal")) return { route: "metas" };
    if (tool.endsWith("_deck") || tool.endsWith("_cards")) return { route: "estudo" };
    if (tool === "archive_capture") return { route: "inbox" };
    return null;
  }
  return null;
}
