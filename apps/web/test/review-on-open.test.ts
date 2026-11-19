// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { hasCardsToday, isStartHash, loadReviewOnOpen, saveReviewOnOpen } from "../src/review-on-open";

describe("revisão ao entrar", () => {
  beforeEach(() => localStorage.clear());

  it("só a raiz e Hoje viram revisão; link direto não é desviado", () => {
    for (const h of ["", "#", "#/", "#/hoje"]) expect(isStartHash(h), h).toBe(true);
    for (const h of ["#/semana", "#/p/123", "#/estudo/revisao", "#/hojex"]) expect(isStartHash(h), h).toBe(false);
  });

  it("abre quando há card vencido ou novo para hoje", () => {
    expect(hasCardsToday({ dueReview: 0, newAvailable: 0 })).toBe(false);
    expect(hasCardsToday({ dueReview: 2, newAvailable: 0 })).toBe(true);
    expect(hasCardsToday({ dueReview: 0, newAvailable: 3 })).toBe(true);
  });

  it("ligado por padrão; desligar fica guardado no aparelho", () => {
    expect(loadReviewOnOpen()).toBe(true);
    saveReviewOnOpen(false);
    expect(loadReviewOnOpen()).toBe(false);
    saveReviewOnOpen(true);
    expect(loadReviewOnOpen()).toBe(true);
  });
});
