import { ACTIONS } from "./actions.js";
import { markdownToDoc } from "./markdown.js";
import type { DraftKind } from "./store.js";
import type { StoreContext } from "./tools.js";

/** Executa um rascunho (aprovado pelo usuário ou, no modo automático, na hora). Lança com a mensagem do erro se não der. */
export async function executeDraft(kind: DraftKind, payload: Record<string, unknown>, stores: StoreContext): Promise<Record<string, unknown>> {
  if (kind === "tasks") {
    const tasks = payload.tasks as { title: string; date: string | null; time: string | null }[];
    const ids: string[] = [];
    for (const t of tasks) {
      const created = await stores.tasks.create({ title: t.title, parentId: null, date: t.date, time: t.time, recurrence: null, goalId: null });
      if (created.kind === "ok") ids.push(created.task.id);
    }
    return { created: ids.length, ids, message: `${ids.length} ${ids.length === 1 ? "tarefa criada" : "tarefas criadas"}.` };
  }
  if (kind === "capture") {
    const created = await stores.captures.create({ text: payload.text as string, kind: (payload.kind as never) ?? null });
    return { id: created.id, message: "Captura salva na Inbox." };
  }
  if (kind === "action") {
    const def = ACTIONS[String(payload.tool)];
    if (!def) throw new Error("Ação desconhecida.");
    return { ...(await def.run((payload.input ?? {}) as Record<string, unknown>, stores)) };
  }
  const p = payload as { title: string; markdown?: string; mermaid?: string; parentId: string | null };
  const body = p.mermaid ? { type: "doc", content: [{ type: "mermaid", attrs: { code: p.mermaid } }] } : markdownToDoc(p.markdown ?? "");
  const parentId = p.parentId && (await stores.pages.get(p.parentId)) ? p.parentId : null;
  const page = await stores.pages.create({ parentId, title: p.title, icon: null, body });
  return { pageId: page?.id ?? null, message: `Página “${p.title}” criada.` };
}

