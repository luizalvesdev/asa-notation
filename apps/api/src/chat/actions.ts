import type { ToolSpec } from "../ai/anthropic.js";
import { isUuid } from "../routing.js";
import { isDate, isTime } from "../tasks/recurrence.js";
import { appendBlocks, asDoc, replaceSection } from "./doc-edit.js";
import { markdownToDoc } from "./markdown.js";
import type { StoreContext as ToolContext } from "./tools.js";

/**
 * Ações de escrita dos assistentes além de criar tarefa/captura/página (essas têm rascunho próprio): editar, mover, apagar,
 * metas, baralhos e cards. Cada uma tem duas fases com a mesma validação: `prepare` confere o pedido e descreve o que vai
 * acontecer (vai para o cartão de aprovação); `run` executa. No modo automático as duas rodam juntas; senão `run` espera o "Aprovar".
 * Apagar sempre pede aprovação (vai para a lixeira, então dá para desfazer).
 */
export interface Prepared {
  /** Frase curta do que vai acontecer, para o cartão de aprovação. */
  summary: string;
  /** Pede aprovação mesmo no modo automático. */
  danger: boolean;
}
export interface ActionResult {
  message: string;
  pageId?: string;
}

interface ActionDef {
  spec: ToolSpec;
  prepare: (input: Record<string, unknown>, ctx: ToolContext) => Promise<Prepared>;
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ActionResult>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const str = (description: string) => ({ type: "string", description });
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

function text(v: unknown, max: number, what: string): string {
  if (typeof v !== "string" || v.trim() === "" || v.length > max) throw new Error(`${what} inválido.`);
  return v.trim();
}
function uuid(v: unknown, what: string): string {
  if (!isUuid(v)) throw new Error(`Id de ${what} inválido.`);
  return v;
}
function optDate(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (!isDate(v)) throw new Error(`Data inválida: ${String(v)}.`);
  return v;
}
function optTime(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (!isTime(v)) throw new Error(`Hora inválida: ${String(v)}.`);
  return v;
}

async function page(ctx: ToolContext, id: unknown) {
  const found = await ctx.pages.get(uuid(id, "página"));
  if (!found) throw new Error("Página não encontrada.");
  if (found.kind === "database" || found.kind === "row" || found.kind === "canvas") throw new Error("Essa página é uma database ou um quadro: edite só páginas de texto.");
  return found;
}
const MAX_MARKDOWN = 20_000;
function markdown(v: unknown) {
  if (typeof v !== "string" || v.trim() === "" || v.length > MAX_MARKDOWN) throw new Error("Conteúdo inválido (vazio ou grande demais).");
  return v;
}

export const ACTIONS: Record<string, ActionDef> = {
  update_task: {
    spec: { name: "update_task", description: "Altera uma tarefa existente: título, data, hora ou se está feita. Use o id que list_tasks devolveu.", input_schema: obj({ id: str("Id da tarefa"), title: str("Novo título"), date: str("AAAA-MM-DD ou vazio para tirar a data"), time: str("HH:MM ou vazio"), done: { type: "boolean", description: "Marcar como feita ou desfeita" } }, ["id"]) },
    async prepare(input, ctx) {
      const task = await ctx.tasks.get(uuid(input.id, "tarefa"));
      if (!task) throw new Error("Tarefa não encontrada.");
      const parts: string[] = [];
      if (input.title !== undefined) parts.push(`título “${clip(text(input.title, 200, "Título"))}”`);
      const date = optDate(input.date);
      const time = optTime(input.time);
      if (date !== undefined) parts.push(date ? `data ${date}` : "sem data");
      if (time !== undefined) parts.push(time ? `hora ${time}` : "sem hora");
      if (typeof input.done === "boolean") parts.push(input.done ? "marcar como feita" : "marcar como não feita");
      if (parts.length === 0) throw new Error("Nada para alterar.");
      return { summary: `Tarefa “${clip(task.title)}”: ${parts.join(", ")}`, danger: false };
    },
    async run(input, ctx) {
      const id = uuid(input.id, "tarefa");
      const patch: { title?: string; date?: string | null; time?: string | null } = {};
      if (input.title !== undefined) patch.title = text(input.title, 200, "Título");
      const date = optDate(input.date);
      const time = optTime(input.time);
      if (date !== undefined) patch.date = date;
      if (time !== undefined) patch.time = time;
      if (Object.keys(patch).length > 0) {
        const res = await ctx.tasks.update(id, patch);
        if (res.kind !== "ok") throw new Error(res.kind === "not_found" ? "Tarefa não encontrada." : "Alteração inválida (hora sem data?).");
      }
      if (typeof input.done === "boolean") {
        const res = await ctx.tasks.setDone(id, input.done, ctx.today);
        if (res !== "ok") throw new Error("Não foi possível marcar a tarefa.");
      }
      return { message: "Tarefa atualizada." };
    },
  },

  delete_task: {
    spec: { name: "delete_task", description: "Apaga uma tarefa (vai para a lixeira). Sempre pede aprovação do usuário.", input_schema: obj({ id: str("Id da tarefa") }, ["id"]) },
    async prepare(input, ctx) {
      const task = await ctx.tasks.get(uuid(input.id, "tarefa"));
      if (!task) throw new Error("Tarefa não encontrada.");
      return { summary: `Apagar a tarefa “${clip(task.title)}” (vai para a lixeira)`, danger: true };
    },
    async run(input, ctx) {
      if (!(await ctx.tasks.softDelete(uuid(input.id, "tarefa")))) throw new Error("Tarefa não encontrada.");
      return { message: "Tarefa na lixeira." };
    },
  },

  create_goal: {
    spec: { name: "create_goal", description: "Cria uma meta.", input_schema: obj({ title: str("Título da meta"), description: str("Descrição, opcional"), dueDate: str("Prazo AAAA-MM-DD, opcional") }, ["title"]) },
    async prepare(input) {
      const due = optDate(input.dueDate);
      return { summary: `Criar a meta “${clip(text(input.title, 200, "Título"))}”${due ? ` com prazo ${due}` : ""}`, danger: false };
    },
    async run(input, ctx) {
      const goal = await ctx.goals.create({ title: text(input.title, 200, "Título"), description: typeof input.description === "string" ? input.description.slice(0, 4000) : "", dueDate: optDate(input.dueDate) ?? null });
      return { message: `Meta “${goal.title}” criada.` };
    },
  },

  update_goal: {
    spec: { name: "update_goal", description: "Altera uma meta: título, descrição, prazo ou concluída.", input_schema: obj({ id: str("Id da meta (de list_goals)"), title: str("Novo título"), description: str("Nova descrição"), dueDate: str("AAAA-MM-DD ou vazio"), done: { type: "boolean", description: "Concluir ou reabrir" } }, ["id"]) },
    async prepare(input, ctx) {
      const goal = await ctx.goals.get(uuid(input.id, "meta"));
      if (!goal) throw new Error("Meta não encontrada.");
      const parts = [input.title !== undefined && "título", input.description !== undefined && "descrição", input.dueDate !== undefined && "prazo", typeof input.done === "boolean" && (input.done ? "concluir" : "reabrir")].filter(Boolean);
      if (parts.length === 0) throw new Error("Nada para alterar.");
      optDate(input.dueDate);
      return { summary: `Meta “${clip(goal.title)}”: ${parts.join(", ")}`, danger: false };
    },
    async run(input, ctx) {
      const patch: { title?: string; description?: string; dueDate?: string | null; done?: boolean } = {};
      if (input.title !== undefined) patch.title = text(input.title, 200, "Título");
      if (typeof input.description === "string") patch.description = input.description.slice(0, 4000);
      const due = optDate(input.dueDate);
      if (due !== undefined) patch.dueDate = due;
      if (typeof input.done === "boolean") patch.done = input.done;
      if (!(await ctx.goals.update(uuid(input.id, "meta"), patch))) throw new Error("Meta não encontrada.");
      return { message: "Meta atualizada." };
    },
  },

  delete_goal: {
    spec: { name: "delete_goal", description: "Apaga uma meta (vai para a lixeira). Sempre pede aprovação do usuário.", input_schema: obj({ id: str("Id da meta") }, ["id"]) },
    async prepare(input, ctx) {
      const goal = await ctx.goals.get(uuid(input.id, "meta"));
      if (!goal) throw new Error("Meta não encontrada.");
      return { summary: `Apagar a meta “${clip(goal.title)}” (vai para a lixeira)`, danger: true };
    },
    async run(input, ctx) {
      if (!(await ctx.goals.softDelete(uuid(input.id, "meta")))) throw new Error("Meta não encontrada.");
      return { message: "Meta na lixeira." };
    },
  },

  update_page: {
    spec: { name: "update_page", description: "Renomeia uma página, troca o ícone (um emoji) ou marca/desmarca como favorita. Não mexe no conteúdo.", input_schema: obj({ id: str("Id da página"), title: str("Novo título"), icon: str("Emoji, ou vazio para tirar"), favorite: { type: "boolean" } }, ["id"]) },
    async prepare(input, ctx) {
      const p = await page(ctx, input.id);
      const parts = [input.title !== undefined && `renomear para “${clip(text(input.title, 200, "Título"))}”`, input.icon !== undefined && "trocar o ícone", typeof input.favorite === "boolean" && (input.favorite ? "favoritar" : "desfavoritar")].filter(Boolean);
      if (parts.length === 0) throw new Error("Nada para alterar.");
      return { summary: `Página “${clip(p.title)}”: ${parts.join(", ")}`, danger: false };
    },
    async run(input, ctx) {
      const p = await page(ctx, input.id);
      const patch: { title?: string; icon?: string | null; favorite?: boolean } = {};
      if (input.title !== undefined) patch.title = text(input.title, 200, "Título");
      if (input.icon !== undefined) patch.icon = typeof input.icon === "string" && input.icon.trim() !== "" ? input.icon.trim().slice(0, 8) : null;
      if (typeof input.favorite === "boolean") patch.favorite = input.favorite;
      await ctx.pages.update(p.id, patch);
      return { message: "Página atualizada.", pageId: p.id };
    },
  },

  append_to_page: {
    spec: {
      name: "append_to_page",
      description:
        "Acrescenta conteúdo (Markdown) a uma página que já existe, sem apagar nada. Sem `section`, vai para o fim. Com `section` (texto de um título da página), entra no fim dessa seção; se não houver, cria a seção nova no fim. Use para incrementar uma página de estudo com um tema relacionado, sempre com um título (## ...) para manter organizado.",
      input_schema: obj({ id: str("Id da página"), markdown: str("Conteúdo em Markdown (pode ter código, listas, ```mermaid)"), section: str("Título da seção onde entra, opcional") }, ["id", "markdown"]),
    },
    async prepare(input, ctx) {
      const p = await page(ctx, input.id);
      markdown(input.markdown);
      const where = typeof input.section === "string" && input.section.trim() !== "" ? ` na seção “${clip(input.section.replace(/^#+\s*/, ""), 40)}”` : " no fim";
      return { summary: `Acrescentar conteúdo à página “${clip(p.title)}”${where}`, danger: false };
    },
    async run(input, ctx) {
      const p = await page(ctx, input.id);
      const added = markdownToDoc(markdown(input.markdown)).content as never[];
      const section = typeof input.section === "string" ? input.section : undefined;
      const { doc, placed, heading } = appendBlocks(p.body, added, section);
      const res = await ctx.pages.update(p.id, { body: doc });
      if (res.kind !== "ok") throw new Error("Não foi possível salvar a página.");
      const where = placed === "section" ? `na seção “${heading}”` : placed === "new_section" ? `numa seção nova “${heading}”` : "no fim";
      return { message: `Conteúdo adicionado ${where} de “${p.title}”.`, pageId: p.id };
    },
  },

  replace_section: {
    spec: { name: "replace_section", description: "Troca o conteúdo de uma seção de uma página (o título da seção fica). Leia a seção antes com read_note.", input_schema: obj({ id: str("Id da página"), section: str("Título da seção"), markdown: str("Novo conteúdo da seção em Markdown") }, ["id", "section", "markdown"]) },
    async prepare(input, ctx) {
      const p = await page(ctx, input.id);
      markdown(input.markdown);
      if (!replaceSection(p.body, text(input.section, 200, "Seção"), [])) throw new Error(`Seção “${String(input.section)}” não encontrada na página.`);
      return { summary: `Reescrever a seção “${clip(String(input.section).replace(/^#+\s*/, ""), 40)}” da página “${clip(p.title)}”`, danger: false };
    },
    async run(input, ctx) {
      const p = await page(ctx, input.id);
      const blocks = markdownToDoc(markdown(input.markdown)).content as never[];
      const out = replaceSection(p.body, text(input.section, 200, "Seção"), blocks);
      if (!out) throw new Error("Seção não encontrada.");
      const res = await ctx.pages.update(p.id, { body: out.doc });
      if (res.kind !== "ok") throw new Error("Não foi possível salvar a página.");
      return { message: `Seção “${out.heading}” reescrita em “${p.title}”.`, pageId: p.id };
    },
  },

  rewrite_page: {
    spec: { name: "rewrite_page", description: "Substitui TODO o conteúdo de uma página. Só use quando o usuário pedir para reescrever a página inteira; antes leia com read_note para não perder nada. O histórico de versões permite voltar.", input_schema: obj({ id: str("Id da página"), markdown: str("Conteúdo novo, completo") }, ["id", "markdown"]) },
    async prepare(input, ctx) {
      const p = await page(ctx, input.id);
      markdown(input.markdown);
      return { summary: `Reescrever a página “${clip(p.title)}” inteira (dá para voltar pelo Histórico)`, danger: true };
    },
    async run(input, ctx) {
      const p = await page(ctx, input.id);
      const res = await ctx.pages.update(p.id, { body: asDoc(markdownToDoc(markdown(input.markdown))) });
      if (res.kind !== "ok") throw new Error("Não foi possível salvar a página.");
      return { message: `Página “${p.title}” reescrita.`, pageId: p.id };
    },
  },

  move_page: {
    spec: { name: "move_page", description: "Move uma página para dentro de outra (ou para a raiz, sem parentId).", input_schema: obj({ id: str("Id da página"), parentId: str("Id da nova página pai; vazio = raiz") }, ["id"]) },
    async prepare(input, ctx) {
      const p = await page(ctx, input.id);
      const parent = input.parentId ? await ctx.pages.get(uuid(input.parentId, "página pai")) : null;
      if (input.parentId && !parent) throw new Error("Página pai não encontrada.");
      return { summary: `Mover “${clip(p.title)}” para ${parent ? `dentro de “${clip(parent.title)}”` : "a raiz"}`, danger: false };
    },
    async run(input, ctx) {
      const p = await page(ctx, input.id);
      const res = await ctx.pages.move(p.id, { parentId: input.parentId ? uuid(input.parentId, "página pai") : null });
      if (res.kind !== "ok") throw new Error(res.kind === "cycle" ? "Não dá para mover uma página para dentro dela mesma." : "Não foi possível mover.");
      return { message: `“${p.title}” movida.`, pageId: p.id };
    },
  },

  delete_page: {
    spec: { name: "delete_page", description: "Apaga uma página e as subpáginas (vão para a lixeira, dá para restaurar). Sempre pede aprovação do usuário.", input_schema: obj({ id: str("Id da página") }, ["id"]) },
    async prepare(input, ctx) {
      const p = await ctx.pages.get(uuid(input.id, "página"));
      if (!p) throw new Error("Página não encontrada.");
      return { summary: `Apagar a página “${clip(p.title)}” e as subpáginas (vão para a lixeira)`, danger: true };
    },
    async run(input, ctx) {
      const n = await ctx.pages.softDelete(uuid(input.id, "página"));
      if (n === 0) throw new Error("Página não encontrada.");
      return { message: n === 1 ? "Página na lixeira." : `${n} páginas na lixeira.` };
    },
  },

  create_deck: {
    spec: { name: "create_deck", description: "Cria um baralho de estudo.", input_schema: obj({ title: str("Nome do baralho") }, ["title"]) },
    async prepare(input) {
      return { summary: `Criar o baralho “${clip(text(input.title, 120, "Título"))}”`, danger: false };
    },
    async run(input, ctx) {
      const res = await ctx.study.createDeck(text(input.title, 120, "Título"), null);
      if (res.kind !== "ok") throw new Error("Não foi possível criar o baralho.");
      return { message: `Baralho “${res.deck.title}” criado.` };
    },
  },

  create_cards: {
    spec: {
      name: "create_cards",
      description: "Cria cards de estudo (pergunta e resposta) num baralho. Até 20 por vez. Para lacuna, use kind \"cloze\" com {{c1::resposta}} no front.",
      input_schema: obj({ deckId: str("Id do baralho (de list_decks); vazio = sem baralho"), cards: { type: "array", maxItems: 20, items: obj({ front: str("Pergunta"), back: str("Resposta"), kind: { type: "string", enum: ["basic", "cloze"] } }, ["front", "back"]) } }, ["cards"]),
    },
    async prepare(input, ctx) {
      const cards = Array.isArray(input.cards) ? input.cards : [];
      if (cards.length === 0 || cards.length > 20) throw new Error("Envie de 1 a 20 cards.");
      for (const c of cards as Record<string, unknown>[]) {
        text(c.front, 2000, "Pergunta");
        text(c.back ?? "-", 2000, "Resposta");
      }
      if (input.deckId && !(await ctx.study.deckExists(uuid(input.deckId, "baralho")))) throw new Error("Baralho não encontrado.");
      return { summary: `Criar ${cards.length} ${cards.length === 1 ? "card" : "cards"} de estudo`, danger: false };
    },
    async run(input, ctx) {
      const deckId = input.deckId ? uuid(input.deckId, "baralho") : null;
      const items = (input.cards as Record<string, unknown>[]).map((c) => ({ deckId, kind: (c.kind === "cloze" ? "cloze" : "basic") as "basic" | "cloze", front: text(c.front, 2000, "Pergunta"), back: text(c.back ?? "-", 2000, "Resposta") }));
      const { created } = await ctx.study.createCards(items);
      return { message: `${created} ${created === 1 ? "card criado" : "cards criados"}.` };
    },
  },

  archive_capture: {
    spec: { name: "archive_capture", description: "Arquiva uma captura da Inbox (some da Inbox, dá para restaurar).", input_schema: obj({ id: str("Id da captura (de list_inbox)") }, ["id"]) },
    async prepare(input, ctx) {
      const c = await ctx.captures.get(uuid(input.id, "captura"));
      if (!c) throw new Error("Captura não encontrada.");
      return { summary: `Arquivar a captura “${clip(c.text)}”`, danger: false };
    },
    async run(input, ctx) {
      if ((await ctx.captures.bulk([uuid(input.id, "captura")], { action: "archive" })) === 0) throw new Error("Captura não encontrada.");
      return { message: "Captura arquivada." };
    },
  },
};

export const ACTION_NAMES = Object.keys(ACTIONS);
