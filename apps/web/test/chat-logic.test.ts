import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api";
import { classifyChatError, describeDraft, describeResult } from "../src/chat-logic";
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
    expect(classifyChatError(new NetworkError("offline")).kind).toBe("offline");
  });
});
