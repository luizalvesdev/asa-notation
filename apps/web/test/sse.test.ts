import { describe, expect, it } from "vitest";
import { SseParser } from "../src/sse";

const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

describe("SseParser", () => {
  it("devolve cada evento completo", () => {
    expect(new SseParser().push(ev({ a: 1 }) + ev({ b: 2 }))).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("junta eventos partidos em qualquer ponto", () => {
    const text = ev({ type: "delta", text: "olá ação" }) + ev({ type: "done" });
    for (const size of [1, 2, 5, 11, 1000]) {
      const p = new SseParser();
      const out: unknown[] = [];
      for (let i = 0; i < text.length; i += size) out.push(...p.push(text.slice(i, i + size)));
      expect(out).toEqual([{ type: "delta", text: "olá ação" }, { type: "done" }]);
    }
  });

  it("aceita CRLF e ignora comentários e JSON inválido", () => {
    expect(new SseParser().push(': ping\r\n\r\ndata: {"x":1}\r\n\r\ndata: nada\n\n')).toEqual([{ x: 1 }]);
  });

  it("flush entrega o evento final sem linha em branco", () => {
    const p = new SseParser();
    expect(p.push('data: {"type":"done"}')).toEqual([]);
    expect(p.flush()).toEqual([{ type: "done" }]);
    expect(p.flush()).toEqual([]);
  });
});
