import type { FetchLike } from "./ai/anthropic.js";

/**
 * Provedor de IA de mentira, só para desenvolvimento (`ASA_AI_MOCK=1`): responde sem internet e sem chave de verdade.
 * Hermes propõe duas tarefas; Renato propõe uma captura. Depois do resultado da ferramenta, só confirma.
 */
export const mockProvider: FetchLike = async (_url, init) => {
  const body = JSON.parse(init.body) as { messages: { role: string; content: unknown }[]; tools?: { name: string }[] };
  const reply = (content: unknown[], stop = "end_turn") => ({ ok: true, status: 200, json: async () => ({ content, stop_reason: stop }) });
  const last = body.messages[body.messages.length - 1];
  const tools = (body.tools ?? []).map((t) => t.name);

  if (tools.length === 0) return reply([{ type: "text", text: "ok" }]);
  if (tools.includes("save_cards")) {
    const cards = [
      { kind: "basic", front: "Para que serve um consumer group?", back: "Dividir as partições de um tópico entre consumidores" },
      { kind: "cloze", front: "Cada partição vai para {{um único}} consumidor do grupo." },
    ];
    return reply([{ type: "tool_use", id: "mock1", name: "save_cards", input: { cards } }], "tool_use");
  }
  if (Array.isArray(last?.content) && last.content.some((b: { type?: string }) => b.type === "tool_result")) {
    return reply([{ type: "text", text: "Pronto: deixei um rascunho para você aprovar." }]);
  }
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (tools.includes("propose_tasks")) {
    return reply([{ type: "tool_use", id: "mock1", name: "propose_tasks", input: { tasks: [{ title: "Enviar proposta revisada", date: tomorrow, time: "10:00" }, { title: "Revisar 20 cards de Raft", date: tomorrow, time: "14:00" }] } }], "tool_use");
  }
  return reply([{ type: "tool_use", id: "mock1", name: "propose_capture", input: { text: "Estudar idempotência em filas #estudo", kind: "study" } }], "tool_use");
};
