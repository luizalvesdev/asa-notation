import { StreamError, assemble, type StreamEvent, streamErrorStatus } from "./stream.js";
import { DEFAULT_MAX_TOKENS, ProviderError, type ModelFn, type ModelRequest, type ModelResponse, type Block } from "./anthropic.js";

export type AiConfig = { provider: "anthropic" } | { provider: "bedrock"; modelId: string; region: string };

/** Uma chamada ao Bedrock já com o erro traduzido para um status HTTP. Troca-se nos testes. */
export type BedrockInvoke = (input: { modelId: string; body: string; signal: AbortSignal }) => Promise<{ status: number; json: unknown }>;

/** Mensagens do Claude no Bedrock usam o mesmo formato da API da Anthropic, com `anthropic_version` no corpo. */
export function bedrockBody(req: ModelRequest): string {
  return JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: req.system,
    messages: req.messages,
    ...(req.tools.length > 0 ? { tools: req.tools } : {}),
  });
}

/** Chamada em fluxo ao Bedrock: devolve os eventos já decodificados. Erros saem como ProviderError. */
export type BedrockStream = (input: { modelId: string; body: string; signal: AbortSignal }) => AsyncIterable<StreamEvent>;

export function createBedrockModel(modelId: string, invoke: BedrockInvoke, timeoutMs: number, stream?: BedrockStream): ModelFn {
  return async (req: ModelRequest): Promise<ModelResponse> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (req.onText && stream) {
        try {
          return await assemble(stream({ modelId, body: bedrockBody(req), signal: controller.signal }), req.onText);
        } catch (err) {
          if (err instanceof StreamError) throw new ProviderError(streamErrorStatus(err.kind), err.message);
          throw err;
        }
      }
      const res = await invoke({ modelId, body: bedrockBody(req), signal: controller.signal });
      const data = res.json as { content?: Block[]; stop_reason?: string; message?: string } | null;
      if (res.status < 200 || res.status >= 300) throw new ProviderError(res.status, data?.message ?? `HTTP ${res.status}`);
      return { content: data?.content ?? [], stopReason: data?.stop_reason ?? "end_turn" };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(0, err instanceof Error && err.name === "AbortError" ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Status HTTP que cada erro do Bedrock representa (acesso negado = chave/permissão ruim, limite = 429...). */
export function bedrockErrorStatus(name: string): number {
  switch (name) {
    case "AccessDeniedException":
    case "UnrecognizedClientException":
    case "ExpiredTokenException":
      return 403;
    case "ThrottlingException":
    case "TooManyRequestsException":
    case "ServiceQuotaExceededException":
      return 429;
    case "ValidationException":
    case "ResourceNotFoundException":
      return 400;
    default:
      return 500;
  }
}

/** Cliente de verdade, com o SDK da AWS carregado só quando é usado (fica fora do caminho de quem usa a Anthropic). */
export function sdkInvoke(region: string): BedrockInvoke {
  let client: Promise<{ send: (cmd: unknown, opts?: { abortSignal?: AbortSignal }) => Promise<{ body: Uint8Array }>; Command: new (input: unknown) => unknown }> | null = null;
  const load = () =>
    (client ??= import("@aws-sdk/client-bedrock-runtime").then((m) => ({
      send: (cmd, opts) => new m.BedrockRuntimeClient({ region }).send(cmd as never, opts as never) as Promise<{ body: Uint8Array }>,
      Command: m.InvokeModelCommand as never,
    })));
  return async ({ modelId, body, signal }) => {
    const { send, Command } = await load();
    try {
      const out = await send(new Command({ modelId, contentType: "application/json", accept: "application/json", body }), { abortSignal: signal });
      return { status: 200, json: JSON.parse(new TextDecoder().decode(out.body)) };
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") throw err;
      return { status: bedrockErrorStatus(name), json: { message: err instanceof Error ? err.message : "erro" } };
    }
  };
}

/** Fluxo de verdade (InvokeModelWithResponseStream). Cada pedaço traz um evento JSON no mesmo formato da API da Anthropic. */
export function sdkStream(region: string): BedrockStream {
  return async function* ({ modelId, body, signal }) {
    const m = await import("@aws-sdk/client-bedrock-runtime");
    let out: { body?: AsyncIterable<{ chunk?: { bytes?: Uint8Array } }> };
    try {
      out = (await new m.BedrockRuntimeClient({ region }).send(new m.InvokeModelWithResponseStreamCommand({ modelId, contentType: "application/json", accept: "application/json", body }), { abortSignal: signal })) as never;
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") throw err;
      throw new ProviderError(bedrockErrorStatus(name), err instanceof Error ? err.message : "erro");
    }
    const decoder = new TextDecoder();
    try {
      for await (const part of out.body ?? []) {
        if (part.chunk?.bytes) yield JSON.parse(decoder.decode(part.chunk.bytes)) as StreamEvent;
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError" || err instanceof ProviderError) throw err;
      // Erros no meio do fluxo (limite, indisponibilidade) vêm com o nome da exceção.
      throw new ProviderError(bedrockErrorStatus(name), err instanceof Error ? err.message : "erro");
    }
  };
}
