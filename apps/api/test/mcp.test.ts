import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.js";

describe("servidor MCP", () => {
  let app: TestApp;
  let write: string;
  let read: string;
  let nextId = 1;

  const token = async (scope: "read" | "write", cookies: Record<string, string>) =>
    ((await app.call("POST", "/tokens", { cookies, body: { name: `mcp ${scope}`, scope } })).body as { secret: string }).secret;

  /** Como o cliente MCP: POST com Bearer e sem Origin. */
  const rpc = (secret: string | null, method: string, params?: unknown, id: number | null = nextId++) =>
    app.call("POST", "/mcp", {
      origin: null,
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
      body: { jsonrpc: "2.0", ...(id === null ? {} : { id }), method, ...(params === undefined ? {} : { params }) },
    });

  const call = async (secret: string, name: string, args: Record<string, unknown> = {}) => {
    const res = await rpc(secret, "tools/call", { name, arguments: args });
    return (res.body as { result: { content: { text: string }[]; isError?: boolean } }).result;
  };

  beforeEach(async () => {
    app = await createTestApp();
    const cookies = await app.owner();
    write = await token("write", cookies);
    read = await token("read", cookies);
  });

  it("negocia a versão e se apresenta com instruções", async () => {
    const res = await rpc(write, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "1" } });
    expect(res.status).toBe(200);
    const result = (res.body as { result: Record<string, unknown> }).result;
    expect(result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "asa-notation" }, capabilities: { tools: {} } });
    expect(result.instructions).toContain("list_pages");
    expect(((await rpc(write, "initialize", { protocolVersion: "1999-01-01" })).body as { result: { protocolVersion: string } }).result.protocolVersion).toBe("2025-11-25");
  });

  it("notificação recebe 202 sem corpo de resposta e método desconhecido dá erro", async () => {
    expect((await rpc(write, "notifications/initialized", undefined, null)).status).toBe(202);
    expect((await rpc(write, "resources/list")).body).toMatchObject({ error: { code: -32601 } });
  });

  it("exige token", async () => {
    expect((await rpc(null, "tools/list")).status).toBe(401);
    expect((await rpc("asa_nao-existe", "tools/list")).status).toBe(401);
  });

  it("token de escrita vê tudo; de leitura só as ferramentas de leitura", async () => {
    const names = async (secret: string) => ((await rpc(secret, "tools/list")).body as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } }).result.tools;
    const all = await names(write);
    expect(all.map((t) => t.name)).toEqual(expect.arrayContaining(["search_notes", "read_note", "create_page", "append_to_page", "create_tasks", "delete_page"]));
    expect(all.map((t) => t.name)).not.toContain("propose_page");
    const readOnly = await names(read);
    expect(readOnly.every((t) => t.annotations.readOnlyHint)).toBe(true);
    expect(readOnly.map((t) => t.name)).toContain("search_notes");

    const denied = await call(read, "create_page", { title: "X", markdown: "y" });
    expect(denied.isError).toBe(true);
    expect(denied.content[0]!.text).toContain("leitura");
  });

  it("cria uma página de aprendizado, acha na busca e acrescenta uma seção", async () => {
    const created = await call(write, "create_page", { title: "Aprendizados de Kafka", markdown: "## Consumer groups\n\nCada partição vai para um consumidor do grupo." });
    expect(created.isError).toBeUndefined();
    expect(created.content[0]!.text).toContain("Feito");

    const hits = JSON.parse((await call(read, "search_notes", { query: "kafka" })).content[0]!.text) as { id: string; title: string }[];
    expect(hits[0]!.title).toBe("Aprendizados de Kafka");

    const appended = await call(write, "append_to_page", { id: hits[0]!.id, markdown: "## Rebalance\n\nAcontece quando entra ou sai um consumidor." });
    expect(appended.isError).toBeUndefined();
    const note = JSON.parse((await call(read, "read_note", { id: hits[0]!.id })).content[0]!.text) as { sections: string[] };
    expect(note.sections).toEqual(["## Consumer groups", "## Rebalance"]);
  });

  it("cria tarefas e lista as de hoje", async () => {
    await call(write, "create_tasks", { tasks: [{ title: "Revisar PR", date: "2026-11-18" }] });
    const list = JSON.parse((await call(read, "list_tasks", { from: "2026-11-18", to: "2026-11-18" })).content[0]!.text) as { days: { title: string }[] };
    expect(list.days.map((t) => t.title)).toEqual(["Revisar PR"]);
  });

  it("erro de validação volta como resultado com isError, não como falha do protocolo", async () => {
    const res = await call(write, "read_note", { id: "nao-e-uuid" });
    expect(res).toMatchObject({ isError: true, content: [{ text: "Id inválido." }] });
    expect((await rpc(write, "tools/call", { name: "nao_existe" })).body).toMatchObject({ error: { code: -32602 } });
  });
});
