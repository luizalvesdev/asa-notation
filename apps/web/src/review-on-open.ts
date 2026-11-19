/**
 * Ao entrar no app (ou voltar depois de um tempo longe), abre a revisão se há cards para hoje.
 * Só quando a entrada é a tela inicial: um link direto para uma página não é desviado.
 * Ligado por padrão; a escolha fica por aparelho.
 */
const KEY = "asa-review-on-open";

/** Tempo fora do app que conta como "entrar de novo" (app aberto em segundo plano, PWA no celular). */
export const AWAY_MS = 30 * 60_000;

export function loadReviewOnOpen(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveReviewOnOpen(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

/** Entradas que podem virar revisão: a raiz e a tela Hoje. */
export function isStartHash(hash: string): boolean {
  return /^(#\/?)?(hoje)?$/.test(hash);
}

export function hasCardsToday(overview: { dueReview: number; newAvailable: number }): boolean {
  return overview.dueReview + overview.newAvailable > 0;
}
