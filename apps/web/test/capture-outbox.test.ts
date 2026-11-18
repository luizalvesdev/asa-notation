import { describe, expect, it } from "vitest";
import { createOutbox, NetworkError, type Pending } from "../src/capture-outbox";
import type { Capture } from "../src/captures-types";

function setup(send: (p: Pending) => Promise<Capture>) {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  let n = 0;
  const outbox = createOutbox({ storage, send, newId: () => `id-${++n}`, now: () => new Date("2026-11-18T12:00:00.000Z") });
  return { outbox, store, storage };
}

const ok = async (p: Pending): Promise<Capture> => ({ id: p.id, text: p.text, kind: null, tags: [], createdAt: p.createdAt });
const offline = async (): Promise<Capture> => {
  throw new NetworkError("offline");
};

describe("outbox", () => {
  it("envia direto quando há rede e não guarda nada", async () => {
    const { outbox } = setup(ok);
    expect(await outbox.submit("oi")).toEqual({ kind: "sent", id: "id-1" });
    expect(outbox.list()).toEqual([]);
  });

  it("guarda na fila sem rede, com id e hora", async () => {
    const { outbox } = setup(offline);
    expect(await outbox.submit("oi")).toEqual({ kind: "queued", id: "id-1" });
    expect(outbox.list()).toEqual([{ id: "id-1", text: "oi", createdAt: "2026-11-18T12:00:00.000Z" }]);
  });

  it("erro do servidor sobe para quem chamou e não entra na fila", async () => {
    const { outbox } = setup(async () => {
      throw new Error("400");
    });
    await expect(outbox.submit("oi")).rejects.toThrow("400");
    expect(outbox.list()).toEqual([]);
  });

  it("a fila sobrevive a recarregar a página", async () => {
    const first = setup(offline);
    await first.outbox.submit("a");
    const second = createOutbox({ storage: first.storage, send: ok, newId: () => "x", now: () => new Date() });
    expect(second.list().map((p) => p.text)).toEqual(["a"]);
  });

  it("flush envia em ordem e esvazia a fila", async () => {
    const sent: string[] = [];
    let online = false;
    const { outbox } = setup(async (p) => {
      if (!online) throw new NetworkError("offline");
      sent.push(p.text);
      return ok(p);
    });
    await outbox.submit("a");
    await outbox.submit("b");
    online = true;
    expect(await outbox.flush()).toBe(2);
    expect(sent).toEqual(["a", "b"]);
    expect(outbox.list()).toEqual([]);
  });

  it("flush para no primeiro erro de rede e mantém o resto", async () => {
    let calls = 0;
    const { outbox } = setup(async (p) => {
      calls += 1;
      if (calls <= 2) throw new NetworkError("offline"); // as duas primeiras entram na fila
      if (calls === 4) throw new NetworkError("caiu");
      return ok(p);
    });
    await outbox.submit("a");
    await outbox.submit("b");
    expect(await outbox.flush()).toBe(1); // a sobe, b falha por rede
    expect(outbox.list().map((p) => p.text)).toEqual(["b"]);
  });

  it("flush descarta o que o servidor recusa", async () => {
    let online = false;
    const { outbox } = setup(async (p) => {
      if (!online) throw new NetworkError("offline");
      throw new Error("400");
    });
    await outbox.submit("ruim");
    online = true;
    expect(await outbox.flush()).toBe(1);
    expect(outbox.list()).toEqual([]);
  });

  it("remove tira um item da fila (desfazer)", async () => {
    const { outbox } = setup(offline);
    const { id } = await outbox.submit("a");
    outbox.remove(id);
    expect(outbox.list()).toEqual([]);
  });

  it("ignora armazenamento corrompido", () => {
    const storage = { getItem: () => "{não é json", setItem: () => undefined };
    expect(createOutbox({ storage, send: ok, newId: () => "x", now: () => new Date() }).list()).toEqual([]);
  });
});
