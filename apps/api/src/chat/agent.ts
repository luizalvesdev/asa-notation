import type { Block, ModelMessage, ModelRequest, ModelResponse, ToolResultBlock, ToolSpec, ToolUseBlock } from "../ai/anthropic.js";

export const MAX_STEPS = 6;
export const TRUNCATED = "A resposta ficou grande demais para caber de uma vez, então não criei nada. Peça por partes: por exemplo, primeiro a explicação e o diagrama, depois o código.";
const MAX_TOOL_RESULT = 8000;

export type ToolHandler = (input: Record<string, unknown>) => Promise<string>;

export interface AgentConfig {
  system: string;
  specs: ToolSpec[];
  handlers: Record<string, ToolHandler>;
  model: (req: ModelRequest) => Promise<ModelResponse>;
  /** Pedaços de texto do modelo, conforme chegam (só se o provedor responde em fluxo). */
  onText?: (delta: string) => void;
  /** Uma nova ida ao modelo começou (depois de ferramentas): o texto parcial anterior deixa de valer. */
  onStep?: () => void;
  /** Uma ferramenta vai rodar / terminou. */
  onTool?: (event: { name: string; phase: "start" | "end" }) => void;
}

export interface TurnResult {
  /** Mensagens novas do turno, em ordem: a do usuário (se veio), chamadas e resultados de ferramenta, resposta final. */
  messages: ModelMessage[];
  /** Texto da resposta final para mostrar. */
  text: string;
}

const textOf = (blocks: Block[]) => blocks.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n").trim();

/**
 * Um turno: manda o histórico mais a pergunta ao modelo e, enquanto ele pedir ferramentas, executa e devolve o resultado.
 * Ferramenta que dá erro vira um `tool_result` com `is_error`: o modelo se explica em vez de a conversa quebrar.
 */
export async function runTurn(history: ModelMessage[], userText: string, config: AgentConfig): Promise<TurnResult> {
  const fresh: ModelMessage[] = [{ role: "user", content: userText }];
  const all = () => [...history, ...fresh];

  for (let step = 0; step < MAX_STEPS; step++) {
    if (step > 0) config.onStep?.();
    const response = await config.model({ system: config.system, messages: all(), tools: config.specs, ...(config.onText ? { onText: config.onText } : {}) });

    // Resposta cortada no limite de tokens: uma chamada de ferramenta no meio fica incompleta e não pode ser executada.
    if (response.stopReason === "max_tokens") {
      const said = textOf(response.content);
      const text = said ? `${said}\n\n${TRUNCATED}` : TRUNCATED;
      fresh.push({ role: "assistant", content: [{ type: "text", text }] });
      return { messages: fresh, text };
    }

    fresh.push({ role: "assistant", content: response.content });

    const calls = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (response.stopReason !== "tool_use" || calls.length === 0) {
      return { messages: fresh, text: textOf(response.content) };
    }

    const results: ToolResultBlock[] = [];
    for (const call of calls) {
      const handler = config.handlers[call.name];
      if (!handler) {
        results.push({ type: "tool_result", tool_use_id: call.id, content: `Ferramenta desconhecida: ${call.name}`, is_error: true });
        continue;
      }
      config.onTool?.({ name: call.name, phase: "start" });
      try {
        results.push({ type: "tool_result", tool_use_id: call.id, content: (await handler(call.input)).slice(0, MAX_TOOL_RESULT) });
      } catch (err) {
        results.push({ type: "tool_result", tool_use_id: call.id, content: err instanceof Error ? err.message : "Erro na ferramenta", is_error: true });
      }
      config.onTool?.({ name: call.name, phase: "end" });
    }
    fresh.push({ role: "user", content: results });
  }

  // Passou do limite de idas e vindas: fecha com o que o modelo já tinha dito.
  const lastAssistant = [...fresh].reverse().find((m) => m.role === "assistant");
  const spoken = lastAssistant && Array.isArray(lastAssistant.content) ? textOf(lastAssistant.content) : "";
  return { messages: fresh, text: spoken || "Não consegui concluir. Tente pedir de outro jeito." };
}

/** Prepara o histórico guardado para reenvio: corta no começo de um turno e garante pares chamada/resultado completos. */
export function trimHistory(stored: { role: "user" | "assistant"; content: string | Block[] }[], maxUserTurns = 12): ModelMessage[] {
  const isUserText = (m: { role: string; content: string | Block[] }) => m.role === "user" && (typeof m.content === "string" || m.content.some((b) => b.type === "text"));
  const starts = stored.map((m, i) => (isUserText(m) ? i : -1)).filter((i) => i >= 0);
  const from = starts.length > maxUserTurns ? starts[starts.length - maxUserTurns]! : 0;
  // Blocos de raciocínio guardados ficam amarrados ao prefixo exato (sistema + ferramentas) em que nasceram: reenviados depois de
  // uma mudança nas ferramentas ou no prompt, a API recusa ("Invalid `signature` in `thinking` block"). Os de turnos antigos não
  // fazem falta, então saem do histórico; os do turno em andamento (em `fresh`) continuam, pois o prefixo é o mesmo.
  const withoutThinking = (content: string | Block[]) => (typeof content === "string" ? content : content.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking"));
  return stored
    .slice(from)
    .map((m) => ({ role: m.role, content: withoutThinking(m.content) }))
    .filter((m) => typeof m.content === "string" || m.content.length > 0);
}
