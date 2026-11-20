import { StreamError, assemble, parseSse, streamErrorStatus } from "./stream.js";

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; /** Corpo em pedaços, para respostas em fluxo. */ body?: AsyncIterable<Uint8Array> | null }>;

export interface TextBlock {
  type: "text";
  text: string;
}
export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
/** Raciocínio do modelo (modelos novos pensam por padrão). Volta igual nas chamadas seguintes do mesmo turno. */
export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}
export interface RedactedThinkingBlock {
  type: "redacted_thinking";
  data: string;
}
export type Block = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock | RedactedThinkingBlock;

export interface ModelMessage {
  role: "user" | "assistant";
  content: string | Block[];
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ModelRequest {
  system: string;
  messages: ModelMessage[];
  tools: ToolSpec[];
  maxTokens?: number;
  /** Cache de prompt (padrão: ligado). Desligue em chamadas avulsas, que pagariam a escrita sem nunca ler. */
  cache?: boolean;
  /** Se vier, o provedor responde em fluxo e avisa a cada pedaço de texto (a resposta completa ainda é devolvida no fim). */
  onText?: (delta: string) => void;
}

export interface ModelResponse {
  content: Block[];
  stopReason: string;
}

const EPHEMERAL = { type: "ephemeral" } as const;

/**
 * Corpo comum da API de Mensagens, com cache de prompt: marca o fim das ferramentas, do sistema e da última mensagem.
 * Assim, no laço de ferramentas e na conversa seguinte (até 5 minutos), o começo repetido sai pelo preço de leitura do cache.
 * Prefixos abaixo do mínimo do modelo (4096 tokens no Haiku 4.5) simplesmente não entram no cache, sem erro nem custo a mais.
 */
export function messagesBody(req: ModelRequest): Record<string, unknown> {
  const base = { max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS };
  if (req.cache === false) return { ...base, system: req.system, messages: req.messages, ...(req.tools.length > 0 ? { tools: req.tools } : {}) };
  const tools = req.tools.map((t, i) => (i === req.tools.length - 1 ? { ...t, cache_control: EPHEMERAL } : t));
  const messages = req.messages.map((m, i) => {
    if (i !== req.messages.length - 1) return m;
    const blocks: Block[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    const last = blocks.length - 1;
    // Blocos de raciocínio não aceitam marcação de cache.
    if (last < 0 || blocks[last]!.type === "thinking" || blocks[last]!.type === "redacted_thinking") return m;
    return { role: m.role, content: blocks.map((b, j) => (j === last ? { ...b, cache_control: EPHEMERAL } : b)) };
  });
  return {
    ...base,
    system: [{ type: "text", text: req.system, cache_control: EPHEMERAL }],
    messages,
    ...(tools.length > 0 ? { tools } : {}),
  };
}

/** Falha da chamada ao provedor, com o status que ele devolveu. */
export class ProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Espaço de saída de um turno: uma página documentada pede alguns milhares de tokens, e o raciocínio do Haiku 5.5 sai da mesma conta. */
export const DEFAULT_MAX_TOKENS = 6000;

/** Modelo padrão na API da Anthropic. Troca-se com ANTHROPIC_MODEL. */
export const DEFAULT_MODEL = "claude-haiku-5-5";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const URL = "https://api.anthropic.com/v1/messages";
export const TIMEOUT_MS = 60_000;

/** O API Gateway corta a requisição em 30 s: um turno de chat precisa terminar antes disso. */
export const TURN_BUDGET_MS = 24_000;
const MIN_CALL_MS = 3_000;

/** Chama a API de Mensagens do Claude. `fetchImpl` existe para os testes não saírem para a internet. */
export function createModel(apiKey: string, model: string, fetchImpl: FetchLike, timeoutMs: number = TIMEOUT_MS, effort?: Effort): (req: ModelRequest) => Promise<ModelResponse> {
  return async (req) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, ...messagesBody(req), ...(effort ? { output_config: { effort } } : {}), ...(req.onText ? { stream: true } : {}) }),
        signal: controller.signal,
      });
      if (req.onText && res.ok && res.body) {
        try {
          return await assemble(parseSse(res.body), req.onText);
        } catch (err) {
          if (err instanceof StreamError) throw new ProviderError(streamErrorStatus(err.kind), err.message);
          throw err;
        }
      }
      const data = (await res.json().catch(() => null)) as { content?: Block[]; stop_reason?: string; error?: { message?: string } } | null;
      if (!res.ok) throw new ProviderError(res.status, data?.error?.message ?? `HTTP ${res.status}`);
      return { content: data?.content ?? [], stopReason: data?.stop_reason ?? "end_turn" };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(0, err instanceof Error && err.name === "AbortError" ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
  };
}

export type ModelFn = (req: ModelRequest) => Promise<ModelResponse>;

/**
 * Orçamento de tempo para o turno inteiro: cada chamada usa só o que sobrou, e sem tempo útil
 * falha como "timeout" em vez de estourar o limite do API Gateway. Vale para qualquer provedor.
 */
export function withBudget(make: (timeoutMs: number) => ModelFn, budgetMs: number = TURN_BUDGET_MS, clock: () => number = Date.now): ModelFn {
  const deadline = clock() + budgetMs;
  return (req) => {
    const remaining = deadline - clock();
    if (remaining < MIN_CALL_MS) return Promise.reject(new ProviderError(0, "timeout"));
    return make(Math.min(TIMEOUT_MS, remaining))(req);
  };
}

export function createBudgetedModel(apiKey: string, model: string, fetchImpl: FetchLike, budgetMs: number = TURN_BUDGET_MS, clock: () => number = Date.now, effort?: Effort): ModelFn {
  return withBudget((timeoutMs) => createModel(apiKey, model, fetchImpl, timeoutMs, effort), budgetMs, clock);
}
