import type { Block, ModelResponse, RedactedThinkingBlock, ThinkingBlock } from "./anthropic.js";

/** Evento do fluxo de mensagens do Claude (o mesmo formato na API da Anthropic e no Bedrock). */
export type StreamEvent = {
  type?: string;
  index?: number;
  content_block?: { type?: string; id?: string; name?: string; text?: string; thinking?: string; signature?: string; data?: string };
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string; thinking?: string; signature?: string };
  error?: { type?: string; message?: string };
};

/** Falha que veio dentro do fluxo (o HTTP já tinha respondido 200). */
export class StreamError extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message);
  }
}

/** Lê um corpo `text/event-stream` e devolve cada `data:` como objeto. Linhas quebradas entre pedaços são juntadas. */
export async function* parseSse(body: AsyncIterable<Uint8Array | string>): AsyncGenerator<StreamEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = function* (block: string): Generator<StreamEvent> {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (data === "" || data === "[DONE]") return;
    try {
      yield JSON.parse(data) as StreamEvent;
    } catch {
      // linha de comentário ou pedaço quebrado: ignora
    }
  };
  for await (const chunk of body) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    let at: number;
    while ((at = buffer.indexOf("\n\n")) >= 0) {
      yield* flush(buffer.slice(0, at));
      buffer = buffer.slice(at + 2);
    }
  }
  if (buffer.trim() !== "") yield* flush(buffer);
}

/**
 * Monta a resposta completa a partir dos eventos, avisando `onText` a cada pedaço de texto.
 * Chamadas de ferramenta chegam em pedaços de JSON e só valem no fim do bloco.
 */
export async function assemble(events: AsyncIterable<StreamEvent>, onText?: (delta: string) => void): Promise<ModelResponse> {
  const blocks: ({ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; json: string } | ThinkingBlock | RedactedThinkingBlock)[] = [];
  let stopReason = "end_turn";

  for await (const event of events) {
    if (event.type === "error") throw new StreamError(event.error?.type ?? "error", event.error?.message ?? "Falha no fluxo");
    const index = event.index ?? blocks.length - 1;
    if (event.type === "content_block_start" && event.content_block) {
      const b = event.content_block;
      if (b.type === "tool_use") blocks[index] = { type: "tool_use", id: b.id ?? "", name: b.name ?? "", json: "" };
      else if (b.type === "thinking") blocks[index] = { type: "thinking", thinking: b.thinking ?? "", signature: b.signature ?? "" };
      else if (b.type === "redacted_thinking") blocks[index] = { type: "redacted_thinking", data: b.data ?? "" };
      else {
        blocks[index] = { type: "text", text: b.text ?? "" };
        if (b.text) onText?.(b.text);
      }
    } else if (event.type === "content_block_delta" && event.delta) {
      const block = blocks[index];
      if (event.delta.type === "text_delta" && block?.type === "text" && event.delta.text) {
        block.text += event.delta.text;
        onText?.(event.delta.text);
      } else if (event.delta.type === "input_json_delta" && block?.type === "tool_use") {
        block.json += event.delta.partial_json ?? "";
      } else if (event.delta.type === "thinking_delta" && block?.type === "thinking") {
        block.thinking += event.delta.thinking ?? "";
      } else if (event.delta.type === "signature_delta" && block?.type === "thinking") {
        block.signature += event.delta.signature ?? "";
      }
    } else if (event.type === "message_delta" && event.delta?.stop_reason) {
      stopReason = event.delta.stop_reason;
    }
  }

  const content: Block[] = [];
  for (const block of blocks) {
    if (!block) continue;
    if (block.type === "text") {
      if (block.text !== "") content.push({ type: "text", text: block.text });
    } else if (block.type === "thinking" || block.type === "redacted_thinking") {
      // Mesmo vazio (texto omitido), o bloco volta inteiro com a assinatura.
      content.push(block);
    } else {
      let input: Record<string, unknown> = {};
      try {
        const parsed: unknown = block.json.trim() === "" ? {} : JSON.parse(block.json);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) input = parsed as Record<string, unknown>;
      } catch {
        // chamada cortada no meio: segue com entrada vazia e deixa a ferramenta reclamar
      }
      content.push({ type: "tool_use", id: block.id, name: block.name, input });
    }
  }
  return { content, stopReason };
}

/** Status HTTP equivalente a um tipo de erro que chegou dentro do fluxo. */
export function streamErrorStatus(kind: string): number {
  switch (kind) {
    case "overloaded_error":
    case "rate_limit_error":
      return 429;
    case "authentication_error":
    case "permission_error":
      return 403;
    case "invalid_request_error":
      return 400;
    default:
      return 500;
  }
}
