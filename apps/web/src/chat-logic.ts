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
  const body = typeof p.mermaid === "string" ? "Diagrama Mermaid" : String(p.markdown ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4).join(" · ");
  return { title: `Rascunho · página “${String(p.title ?? "")}”`, lines: body ? [body.length > 160 ? `${body.slice(0, 160)}…` : body] : [], approve: "Criar página" };
}

/** Texto do que aconteceu depois de aprovar. */
export function describeResult(draft: Pick<Draft, "kind" | "result">): string {
  const r = draft.result ?? {};
  if (draft.kind === "tasks") return plural(Number(r.created ?? 0), "tarefa criada", "tarefas criadas");
  if (draft.kind === "capture") return "Salva na Inbox";
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
