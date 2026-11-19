import { describe, expect, it } from "vitest";
import { ActiveClock, DEFAULT_THRESHOLDS, IDLE_MS, checkAnswer, expectedAnswer, formatSeconds, normalizeAnswer, suggestGrade, thresholdsFrom } from "../src/typed-answer";

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

describe("tentativas e limites pessoais", () => {
  it("errou antes: uma vez sugere Difícil, duas ou mais De novo, mesmo acertando rápido", () => {
    expect(suggestGrade(true, 1_000, 1)).toBe(2);
    expect(suggestGrade(true, 1_000, 2)).toBe(1);
    expect(suggestGrade(true, null, 1)).toBe(2);
  });

  it("com 50 respostas medidas, os limites viram os seus quartis", () => {
    expect(thresholdsFrom(Array(49).fill(5_000))).toEqual(DEFAULT_THRESHOLDS);
    const mine = Array.from({ length: 100 }, (_, i) => 2_000 + i * 100); // 2 s a 11,9 s
    const t = thresholdsFrom(mine);
    expect(Math.round(t.fast)).toBe(4_475);
    expect(Math.round(t.slow)).toBe(9_425);
    expect(suggestGrade(true, 4_000, 0, t)).toBe(4);
    expect(suggestGrade(true, 10_000, 0, t)).toBe(2);
  });
});
