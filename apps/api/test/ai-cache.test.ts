import { describe, expect, it } from "vitest";
import { messagesBody, type ModelMessage } from "../src/ai/anthropic.js";
import { assemble, type StreamEvent } from "../src/ai/stream.js";

const C = { type: "ephemeral" };

describe("cache de prompt", () => {
  it("marca só a última ferramenta, o sistema e o último bloco da última mensagem", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "oi" },
      { role: "assistant", content: [{ type: "tool_use", id: "a", name: "t1", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "r1" }, { type: "tool_result", tool_use_id: "b", content: "r2" }] },
    ];
    const body = messagesBody({ system: "s", messages, tools: [{ name: "t1", description: "", input_schema: {} }, { name: "t2", description: "", input_schema: {} }] }) as {
      tools: Record<string, unknown>[];
      messages: { content: Record<string, unknown>[] | string }[];
    };
    expect(body.tools.map((t) => t.cache_control)).toEqual([undefined, C]);
    expect(body.messages[0]!.content).toBe("oi");
    expect((body.messages[2]!.content as Record<string, unknown>[]).map((b) => b.cache_control)).toEqual([undefined, C]);
    // Não mexe no histórico original (ele é guardado e reenviado).
    expect(JSON.stringify(messages)).not.toContain("cache_control");
  });
});

describe("raciocínio no fluxo", () => {
  async function* events(list: StreamEvent[]) {
    yield* list;
  }

  it("guarda o bloco de raciocínio com a assinatura, mesmo sem texto, e não o mostra", async () => {
    const shown: string[] = [];
    const out = await assemble(
      events([
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
        { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "oi" } },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
      ]),
      (t) => shown.push(t),
    );
    expect(out.content).toEqual([{ type: "thinking", thinking: "", signature: "sig" }, { type: "text", text: "oi" }]);
    expect(shown).toEqual(["oi"]);
  });
});
