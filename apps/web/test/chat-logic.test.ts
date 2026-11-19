import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api";
import { classifyChatError, describeDraft, describeResult, draftTarget } from "../src/chat-logic";
import { NetworkError } from "../src/capture-outbox";

describe("describeDraft", () => {
  it("tarefas com data e hora", () => {
    const v = describeDraft({ kind: "tasks", payload: { tasks: [{ title: "Enviar proposta", date: "2026-11-19", time: "10:00" }, { title: "Treino", date: null, time: null }] } });
    expect(v).toEqual({ title: "Rascunho · 2 tarefas", lines: ["Enviar proposta · 19/11 10:00", "Treino"], approve: "Criar tarefas" });
  });
  it("uma tarefa só", () => {
    expect(describeDraft({ kind: "tasks", payload: { tasks: [{ title: "A" }] } })).toMatchObject({ title: "Rascunho · 1 tarefa", approve: "Criar tarefa" });
  });
  it("captura", () => {
    expect(describeDraft({ kind: "capture", payload: { text: "Estudar Raft #estudo" } })).toMatchObject({ lines: ["Estudar Raft #estudo"], approve: "Salvar na Inbox" });
  });
  it("página com markdown e com diagrama", () => {
    const page = describeDraft({ kind: "page", payload: { title: "Resumo", markdown: "# Resumo\n\n- a\n- b" } });
    expect(page.title).toBe("Rascunho · página “Resumo”");
    expect(page.lines).toEqual(["# Resumo · - a · - b"]);
    expect(describeDraft({ kind: "page", payload: { title: "Mapa", mermaid: "mindmap" } }).lines).toEqual(["Diagrama Mermaid"]);
  });
  it("payload estranho não quebra", () => {
    expect(describeDraft({ kind: "tasks", payload: {} }).title).toBe("Rascunho · 0 tarefas");
  });
});

describe("describeResult", () => {
  it("diz o que foi criado", () => {
    expect(describeResult({ kind: "tasks", result: { created: 3 } })).toBe("3 tarefas criadas");
    expect(describeResult({ kind: "tasks", result: { created: 1 } })).toBe("1 tarefa criada");
    expect(describeResult({ kind: "capture", result: { id: "x" } })).toBe("Salva na Inbox");
    expect(describeResult({ kind: "page", result: null })).toBe("Página criada");
  });
});

describe("classifyChatError", () => {
  it("traduz cada falha", () => {
    expect(classifyChatError(new ApiError(412, { error: "no_key" })).kind).toBe("no_key");
    expect(classifyChatError(new ApiError(502, { error: "invalid_key" })).kind).toBe("invalid_key");
    expect(classifyChatError(new ApiError(429, { error: "rate_limited" })).kind).toBe("rate_limited");
    expect(classifyChatError(new ApiError(504, { error: "provider_timeout" })).message).toContain("demorou");
    expect(classifyChatError(new ApiError(500, null)).kind).toBe("other");
    expect(classifyChatError(new ApiError(502, { error: "provider_error", status: 400, detail: "Your credit balance is too low to access the Anthropic API." })).message).toContain("sem créditos");
    expect(classifyChatError(new ApiError(502, { error: "provider_error", status: 404, detail: "model: x" })).message).toContain("model: x");
    expect(classifyChatError(new NetworkError("offline")).kind).toBe("offline");
  });
});

describe("ações gerais dos assistentes", () => {
  const action = (tool: string, extra: Record<string, unknown> = {}) => ({ kind: "action" as const, payload: { tool, summary: "Resumo do que vai acontecer", danger: false, ...extra }, result: null });

  it("mostra o resumo e o verbo certo no botão", () => {
    expect(describeDraft(action("append_to_page"))).toEqual({ title: "Rascunho", lines: ["Resumo do que vai acontecer"], approve: "Acrescentar" });
    expect(describeDraft(action("create_goal")).approve).toBe("Criar");
    expect(describeDraft(action("update_task")).approve).toBe("Aplicar");
  });

  it("apagar e reescrever destacam que precisam de aprovação", () => {
    const del = describeDraft(action("delete_page", { danger: true }));
    expect(del).toMatchObject({ title: "Precisa da sua aprovação", approve: "Apagar" });
    expect(describeDraft(action("rewrite_page", { danger: true })).approve).toBe("Reescrever");
  });

  it("depois de aprovar mostra a mensagem do servidor", () => {
    expect(describeResult({ kind: "action", result: { message: "Seção “Cache” reescrita." } })).toBe("Seção “Cache” reescrita.");
    expect(describeResult({ kind: "action", result: null })).toBe("Feito");
  });

  it("o Abrir leva à página, à tela certa ou a lugar nenhum", () => {
    expect(draftTarget({ ...action("append_to_page"), result: { pageId: "p1" } })).toEqual({ page: "p1" });
    expect(draftTarget(action("update_task"))).toEqual({ route: "hoje" });
    expect(draftTarget(action("create_goal"))).toEqual({ route: "metas" });
    expect(draftTarget(action("create_cards"))).toEqual({ route: "estudo" });
    expect(draftTarget(action("archive_capture"))).toEqual({ route: "inbox" });
    expect(draftTarget(action("delete_page", { danger: true }))).toBeNull();
    expect(draftTarget({ kind: "tasks", payload: {}, result: null })).toEqual({ route: "hoje" });
  });
});

describe("prévia do conteúdo no cartão", () => {
  it("página proposta mostra o Markdown; diagrama vira bloco mermaid", () => {
    expect(describeDraft({ kind: "page", payload: { title: "T", markdown: "# Oi\n\ntexto" } }).preview).toBe("# Oi\n\ntexto");
    expect(describeDraft({ kind: "page", payload: { title: "T", mermaid: "graph TD\n  A-->B" } }).preview).toBe("```mermaid\ngraph TD\n  A-->B\n```");
  });

  it("ações que escrevem conteúdo mostram o Markdown; as outras não têm prévia", () => {
    const append = describeDraft({ kind: "action", payload: { tool: "append_to_page", summary: "s", danger: false, input: { markdown: "## Novo\n\nx" } } });
    expect(append.preview).toBe("## Novo\n\nx");
    expect(describeDraft({ kind: "action", payload: { tool: "delete_page", summary: "s", danger: true, input: { id: "1" } } }).preview).toBeUndefined();
    expect(describeDraft({ kind: "tasks", payload: { tasks: [] } }).preview).toBeUndefined();
  });

  it("conteúdo muito grande é cortado", () => {
    const v = describeDraft({ kind: "page", payload: { title: "T", markdown: "x".repeat(5000) } });
    expect(v.preview!.length).toBeLessThan(3010);
    expect(v.preview!.endsWith("…")).toBe(true);
  });
});
