import { describe, expect, it } from "vitest";
import { applyGrade, clozeAnswers, fillDays, clozeSegments, current, estimateMinutes, formatClock, formatInterval, isFinished, reveal, startSession, summarize } from "../src/study-logic";
import type { QueueCard } from "../src/study-types";

const NOW = Date.parse("2026-11-18T12:00:00.000Z");
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const card = (id: string, front = id): QueueCard => ({
  id, deckId: null, kind: "basic", front, back: "b", sourcePageId: null, sourceTitle: null, state: 0, dueAt: iso(0),
  preview: { 1: iso(60_000), 2: iso(600_000), 3: iso(86_400_000), 4: iso(4 * 86_400_000) },
});
const later = (dueInMs: number, state = 2) => ({ dueAt: iso(dueInMs), state, preview: card("x").preview });

describe("formatInterval", () => {
  it("escolhe a unidade certa", () => {
    const from = new Date(NOW);
    expect(formatInterval(from, iso(20_000))).toBe("< 1 min");
    expect(formatInterval(from, iso(60_000))).toBe("1 min");
    expect(formatInterval(from, iso(10 * 60_000))).toBe("10 min");
    expect(formatInterval(from, iso(3 * 3_600_000))).toBe("3 h");
    expect(formatInterval(from, iso(4 * 86_400_000))).toBe("4 d");
    expect(formatInterval(from, iso(35 * 86_400_000))).toBe("1 mês");
    expect(formatInterval(from, iso(90 * 86_400_000))).toBe("3 meses");
    expect(formatInterval(from, iso(400 * 86_400_000))).toBe("1,1 anos");
  });
  it("data no passado vira zero", () => {
    expect(formatInterval(iso(1000), iso(0))).toBe("< 1 min");
  });
});

describe("estimateMinutes", () => {
  it("arredonda e garante 1 minuto", () => {
    expect(estimateMinutes(12, 40)).toBe(8);
    expect(estimateMinutes(1, 10)).toBe(1);
    expect(estimateMinutes(0, 40)).toBe(0);
  });
});

describe("cloze", () => {
  it("separa texto e lacunas", () => {
    expect(clozeSegments("O líder envia {{heartbeats}} a cada {{150 ms}}.")).toEqual([
      { text: "O líder envia ", blank: false },
      { text: "heartbeats", blank: true },
      { text: " a cada ", blank: false },
      { text: "150 ms", blank: true },
      { text: ".", blank: false },
    ]);
  });
  it("junta as respostas", () => {
    expect(clozeAnswers("{{a}} e {{b}}")).toBe("a · b");
    expect(clozeAnswers("sem lacuna")).toBe("");
  });
});

describe("sessão", () => {
  it("começa no primeiro card, escondido", () => {
    const s = startSession([card("a"), card("b")], NOW);
    expect(current(s)?.id).toBe("a");
    expect(s.revealed).toBe(false);
    expect(s.total).toBe(2);
  });

  it("virar mostra a resposta e é idempotente", () => {
    const s = reveal(startSession([card("a")], NOW));
    expect(s.revealed).toBe(true);
    expect(reveal(s)).toBe(s);
  });

  it("avaliar com vencimento distante avança e esconde de novo", () => {
    let s = reveal(startSession([card("a"), card("b")], NOW));
    s = applyGrade(s, 3, later(3 * 86_400_000), NOW + 5000);
    expect(current(s)?.id).toBe("b");
    expect(s.revealed).toBe(false);
    expect(s.results).toEqual([{ cardId: "a", front: "a", grade: 3, seconds: 5 }]);
    expect(s.shownAt).toBe(NOW + 5000);
  });

  it("errar volta o card ao fim com o novo agendamento", () => {
    let s = startSession([card("a"), card("b")], NOW);
    s = applyGrade(s, 1, later(60_000, 1), NOW + 1000);
    expect(s.queue.map((c) => c.id)).toEqual(["b", "a"]);
    expect(s.queue[1]).toMatchObject({ state: 1 });
    expect(s.total).toBe(2);
  });

  it("termina quando a fila esvazia", () => {
    let s = startSession([card("a")], NOW);
    expect(isFinished(s)).toBe(false);
    s = applyGrade(s, 4, later(10 * 86_400_000), NOW + 2000);
    expect(isFinished(s)).toBe(true);
    expect(current(s)).toBeNull();
    expect(applyGrade(s, 3, later(1), NOW)).toBe(s);
  });
});

describe("summarize", () => {
  it("conta cards pela última nota e lista os que erraram", () => {
    const results = [
      { cardId: "a", front: "A", grade: 1 as const, seconds: 10 },
      { cardId: "b", front: "B", grade: 3 as const, seconds: 20 },
      { cardId: "a", front: "A", grade: 3 as const, seconds: 5 },
    ];
    expect(summarize(results)).toEqual({ cards: 2, remembered: 100, seconds: 35, struggled: ["A"] });
  });
  it("sessão vazia", () => {
    expect(summarize([])).toEqual({ cards: 0, remembered: 0, seconds: 0, struggled: [] });
  });
  it("percentual com erro final", () => {
    expect(summarize([{ cardId: "a", front: "A", grade: 1, seconds: 1 }, { cardId: "b", front: "B", grade: 4, seconds: 1 }]).remembered).toBe(50);
  });
});

describe("formatClock", () => {
  it("minutos e segundos", () => {
    expect(formatClock(192)).toBe("3:12");
    expect(formatClock(5)).toBe("0:05");
  });
});

describe("fillDays", () => {
  it("completa os dias sem revisão e termina em hoje", () => {
    const out = fillDays({ days: [{ day: "2026-11-17", reviews: 5, seconds: 100, remembered: 4 }] }, "2026-11-18", 3);
    expect(out).toEqual([
      { day: "2026-11-16", reviews: 0, remembered: 0 },
      { day: "2026-11-17", reviews: 5, remembered: 4 },
      { day: "2026-11-18", reviews: 0, remembered: 0 },
    ]);
  });
});
