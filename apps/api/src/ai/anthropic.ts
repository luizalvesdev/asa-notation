export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

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
export type Block = TextBlock | ToolUseBlock | ToolResultBlock;

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
}

export interface ModelResponse {
  content: Block[];
  stopReason: string;
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

export const DEFAULT_MODEL = "claude-sonnet-5-5";
const URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 60_000;

/** Chama a API de Mensagens do Claude. `fetchImpl` existe para os testes não saírem para a internet. */
export function createModel(apiKey: string, model: string, fetchImpl: FetchLike): (req: ModelRequest) => Promise<ModelResponse> {
  return async (req) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: req.maxTokens ?? 1500, system: req.system, messages: req.messages, ...(req.tools.length > 0 ? { tools: req.tools } : {}) }),
        signal: controller.signal,
      });
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
