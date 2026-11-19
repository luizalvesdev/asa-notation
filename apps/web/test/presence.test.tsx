// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT_MS, Presence } from "../src/Presence";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.useRealTimers());

describe("Presence", () => {
  it("abre na hora, e ao fechar fica com .leaving até a saída terminar", () => {
    vi.useFakeTimers();
    const box = document.createElement("div");
    const root = createRoot(box);
    const view = (show: boolean, text: string) => act(() => root.render(<Presence show={show}><p className="menu">{text}</p></Presence>));

    view(false, "a");
    expect(box.innerHTML).toBe("");
    view(true, "menu aberto");
    expect(box.querySelector(".presence:not(.leaving) .menu")?.textContent).toBe("menu aberto");

    const node = box.querySelector(".menu");
    view(false, "mudou depois de fechar");
    // O mesmo elemento continua montado (nada remonta, o que reiniciaria a animação de entrada).
    expect(box.querySelector(".menu")).toBe(node);
    // Continua na tela, congelado como estava, marcado para a animação de saída.
    expect(box.querySelector(".presence.leaving .menu")?.textContent).toBe("menu aberto");
    act(() => vi.advanceTimersByTime(EXIT_MS + 1));
    expect(box.innerHTML).toBe("");

    // Reabrir no meio da saída volta a ficar aberto.
    view(true, "de novo");
    view(false, "x");
    view(true, "de novo");
    expect(box.querySelector(".presence.leaving")).toBeNull();
    expect(box.querySelector(".menu")?.textContent).toBe("de novo");
    act(() => root.unmount());
  });
});

describe("Reveal", () => {
  it("abre crescendo, fecha encolhendo e só então sai da página", async () => {
    vi.useFakeTimers();
    const { Reveal, REVEAL_MS } = await import("../src/Reveal");
    const box = document.createElement("div");
    const root = createRoot(box);
    const view = (show: boolean, text: string) => act(() => root.render(<Reveal show={show}><form>{text}</form></Reveal>));

    view(false, "x");
    expect(box.innerHTML).toBe("");
    view(true, "nova trilha");
    expect(box.querySelector(".reveal")?.className).toBe("reveal");
    act(() => vi.advanceTimersByTime(REVEAL_MS + 50));
    expect(box.querySelector(".reveal")?.className).toBe("reveal on done");

    view(false, "mudou");
    expect(box.querySelector(".reveal")?.className).toBe("reveal");
    expect(box.querySelector("form")?.textContent).toBe("nova trilha");
    act(() => vi.advanceTimersByTime(REVEAL_MS + 1));
    expect(box.innerHTML).toBe("");
    act(() => root.unmount());
  });
});

describe("confirmação de exclusão", () => {
  it("sem modal montado confirma; com modal, espera a resposta", async () => {
    const { askConfirm, setConfirmHost } = await import("../src/confirm");
    expect(await askConfirm({ title: "x" })).toBe(true);
    let pending: ((ok: boolean) => void) | null = null;
    setConfirmHost((req) => (pending = req.resolve));
    const answer = askConfirm({ title: "Apagar?" });
    pending!(false);
    expect(await answer).toBe(false);
    setConfirmHost(null);
  });
});
