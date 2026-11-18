import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isDate, isTime, occurrences } from "../src/tasks/recurrence.js";

describe("datas", () => {
  it("valida datas civis", () => {
    expect(isDate("2026-11-18")).toBe(true);
    expect(isDate("2028-02-29")).toBe(true);
    expect(isDate("2026-02-29")).toBe(false);
    expect(isDate("2026-13-01")).toBe(false);
    expect(isDate("18/11/2026")).toBe(false);
    expect(isDate(20261118)).toBe(false);
  });

  it("valida horas", () => {
    expect(isTime("09:30")).toBe(true);
    expect(isTime("24:00")).toBe(false);
    expect(isTime("9:30")).toBe(false);
  });

  it("soma dias atravessando mês e ano", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-16", "2026-11-22")).toBe(6);
  });
});

describe("occurrences", () => {
  // 2026-11-16 é segunda-feira; 2026-11-22 é domingo.
  it("daily cobre todos os dias a partir do início", () => {
    expect(occurrences("daily", "2026-11-18", "2026-11-16", "2026-11-20")).toEqual(["2026-11-18", "2026-11-19", "2026-11-20"]);
  });

  it("weekdays pula sábado e domingo", () => {
    expect(occurrences("weekdays", "2026-11-01", "2026-11-19", "2026-11-24")).toEqual([
      "2026-11-19",
      "2026-11-20",
      "2026-11-23",
      "2026-11-24",
    ]);
  });

  it("weekly repete no dia da semana do início", () => {
    // início numa quarta (18/11)
    expect(occurrences("weekly", "2026-11-18", "2026-11-16", "2026-12-05")).toEqual(["2026-11-18", "2026-11-25", "2026-12-02"]);
  });

  it("não devolve nada antes do início nem com intervalo vazio", () => {
    expect(occurrences("daily", "2026-12-01", "2026-11-16", "2026-11-22")).toEqual([]);
    expect(occurrences("daily", "2026-11-01", "2026-11-22", "2026-11-16")).toEqual([]);
  });
});
