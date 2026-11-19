import { describe, expect, it } from "vitest";
import { ActiveClock, IDLE_MS, checkAnswer, expectedAnswer, formatSeconds, normalizeAnswer, suggestGrade } from "../src/typed-answer";

describe("conferir a resposta digitada", () => {
  it("ignora acento, maiúscula e pontuação", () => {
    expect(normalizeAnswer("  Partição, Única! ")).toBe("particao unica");
    expect(checkAnswer("particao unica", "Partição única")).toBe(true);
  });

  it("aceita erro pequeno de digitação conforme o tamanho", () => {
    expect(checkAnswer("5432", "5432")).toBe(true);
    expect(checkAnswer("5433", "5432")).toBe(false); // curto: tem que ser exato
    expect(checkAnswer("Canbera", "Canberra")).toBe(true);
    expect(checkAnswer("Sydney", "Canberra")).toBe(false);
    expect(checkAnswer("", "Canberra")).toBe(false);
  });

  it("resposta longa: as palavras importantes, em qualquer ordem", () => {
    const want = "Dividir as partições de um tópico entre os consumidores do grupo";
    expect(checkAnswer("divide as particoes do topico entre consumidores do grupo", want)).toBe(true);
    expect(checkAnswer("consumidores do grupo", want)).toBe(false);
  });

  it("lacuna: as lacunas em ordem", () => {
    expect(expectedAnswer({ kind: "cloze", front: "O {{Raft}} elege um {{líder}}", back: "" })).toBe("Raft líder");
    expect(expectedAnswer({ kind: "basic", front: "Porta?", back: "5432" })).toBe("5432");
  });
});

describe("nota sugerida pelo tempo", () => {
  it("errou é De novo; certo depende de quanto levou para começar", () => {
    expect(suggestGrade(false, 500)).toBe(1);
    expect(suggestGrade(true, 2_000)).toBe(4);
    expect(suggestGrade(true, 8_000)).toBe(3);
    expect(suggestGrade(true, 20_000)).toBe(2);
    expect(suggestGrade(true, null)).toBeNull();
    expect(suggestGrade(false, null)).toBe(1);
  });

  it("formata o tempo", () => {
    expect(formatSeconds(4_230)).toBe("4,2 s");
    expect(formatSeconds(23_400)).toBe("23 s");
  });
});

describe("cronômetro só com o Asa em foco", () => {
  it("pausa fora do app e mede até a primeira tecla", () => {
    let t = 0;
    const clock = new ActiveClock(() => t);
    clock.start();
    t = 2_000;
    clock.pause(); // trocou de aba
    t = 100_000; // 98 s fora: não conta
    clock.start();
    t = 103_000;
    clock.key();
    t = 104_000;
    clock.key();
    expect(clock.latency()).toBe(5_000);
    expect(clock.elapsed()).toBe(6_000);
  });

  it("parado em foco por mais de um minuto: não vale como medida", () => {
    let t = 0;
    const clock = new ActiveClock(() => t);
    clock.start();
    t = IDLE_MS + 1;
    expect(clock.latency()).toBeNull();
  });

  it("parada longa no meio da digitação também invalida", () => {
    let t = 0;
    const clock = new ActiveClock(() => t);
    clock.start();
    t = 1_000;
    clock.key();
    t = 1_000 + IDLE_MS + 1;
    clock.key();
    expect(clock.latency()).toBeNull();
  });
});
