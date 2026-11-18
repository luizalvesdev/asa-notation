import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaver, type SaveState } from "../src/autosave";
import type { PagePatch } from "../src/pages-types";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(send: (patch: PagePatch) => Promise<void>) {
  const states: SaveState[] = [];
  const saver = createAutosaver({ delayMs: 500, send, onState: (s) => states.push(s) });
  return { saver, states };
}

describe("createAutosaver", () => {
  it("espera o intervalo e envia uma vez com as alterações juntas", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { saver, states } = setup(send);
    saver.queue({ title: "a" });
    saver.queue({ body: { type: "doc" } });
    saver.queue({ title: "ab" });
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ title: "ab", body: { type: "doc" } });
    expect(states.at(-1)).toBe("salvo");
    expect(states).toContain("pendente");
    expect(states).toContain("salvando");
  });

  it("reinicia o intervalo a cada alteração (debounce)", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { saver } = setup(send);
    saver.queue({ title: "a" });
    await vi.advanceTimersByTimeAsync(400);
    saver.queue({ title: "ab" });
    await vi.advanceTimersByTimeAsync(400);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("flush envia já, sem esperar o intervalo", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { saver } = setup(send);
    saver.queue({ title: "a" });
    await saver.flush();
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("não envia envios em paralelo: o que chega durante o voo vai depois", async () => {
    let release: () => void = () => undefined;
    const calls: PagePatch[] = [];
    const send = vi.fn((patch: PagePatch) => {
      calls.push(patch);
      return calls.length === 1 ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve();
    });
    const { saver, states } = setup(send);
    saver.queue({ title: "um" });
    await vi.advanceTimersByTimeAsync(500);
    saver.queue({ title: "dois" });
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledTimes(1);
    release();
    await saver.flush();
    expect(calls).toEqual([{ title: "um" }, { title: "dois" }]);
    expect(states.at(-1)).toBe("salvo");
  });

  it("em caso de erro mantém o patch e o estado 'erro'; flush tenta de novo", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("rede")).mockResolvedValue(undefined);
    const { saver, states } = setup(send);
    saver.queue({ title: "a" });
    await vi.advanceTimersByTimeAsync(500);
    expect(states.at(-1)).toBe("erro");
    await saver.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ title: "a" });
    expect(states.at(-1)).toBe("salvo");
  });

  it("o que foi digitado depois da falha prevalece sobre o patch que falhou", async () => {
    let fail = true;
    const calls: PagePatch[] = [];
    const send = vi.fn(async (patch: PagePatch) => {
      calls.push(patch);
      if (fail) {
        fail = false;
        saver.queue({ title: "novo" });
        throw new Error("rede");
      }
    });
    const { saver } = setup(send);
    saver.queue({ title: "velho", icon: "📘" });
    await vi.advanceTimersByTimeAsync(500);
    await saver.flush();
    expect(calls.at(-1)).toEqual({ title: "novo", icon: "📘" });
  });

  it("discard cancela o que estava agendado", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { saver } = setup(send);
    saver.queue({ title: "a" });
    saver.discard();
    await vi.advanceTimersByTimeAsync(1000);
    await saver.flush();
    expect(send).not.toHaveBeenCalled();
  });
});
