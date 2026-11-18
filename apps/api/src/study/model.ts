import type { Grade } from "./scheduler.js";

export type CardKind = "basic" | "cloze";

export interface Card {
  id: string;
  deckId: string | null;
  kind: CardKind;
  front: string;
  back: string;
  sourcePageId: string | null;
  sourceTitle: string | null;
  /** 0 novo, 1 aprendendo, 2 revisão, 3 reaprendendo. */
  state: number;
  dueAt: string;
}

export interface QueueCard extends Card {
  /** Quando o card volta para cada nota. */
  preview: Record<Grade, string>;
}

export interface Deck {
  id: string;
  title: string;
  goalId: string | null;
  goalTitle: string | null;
  cards: number;
  due: number;
  /** Cards já em revisão (aprendidos), de 0 a `cards`. */
  learned: number;
}

export interface WeakCard {
  id: string;
  front: string;
  kind: CardKind;
  lapses: number;
}

export interface Overview {
  dueReview: number;
  newAvailable: number;
  totalCards: number;
  /** Média de segundos por card, nas últimas revisões (padrão 40). */
  avgSeconds: number;
  decks: Deck[];
  weak: WeakCard[];
}

export interface NewCardInput {
  deckId: string | null;
  kind: CardKind;
  front: string;
  back: string;
  sourcePageId?: string | null;
  sourceKey?: string | null;
}

export interface DayStat {
  day: string;
  reviews: number;
  seconds: number;
  remembered: number;
}

export interface Stats {
  days: DayStat[];
  /** Revisões de cards em revisão que foram lembradas (nota 2 a 4), de 0 a 1. Null sem dados. */
  retention: number | null;
  reviews: number;
  seconds: number;
  states: { new: number; learning: number; review: number; relearning: number };
  hardest: WeakCard[];
  /** Cards que vencem em cada um dos próximos 7 dias (hoje inclui os atrasados). */
  upcoming: { day: string; due: number }[];
}
