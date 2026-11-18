export type Grade = 1 | 2 | 3 | 4;
export type CardKind = "basic" | "cloze";

export interface StudyCard {
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

export interface QueueCard extends StudyCard {
  preview: Record<Grade, string>;
}

export interface Deck {
  id: string;
  title: string;
  goalId: string | null;
  goalTitle: string | null;
  cards: number;
  due: number;
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
  avgSeconds: number;
  decks: Deck[];
  weak: WeakCard[];
}

export interface Candidate {
  kind: CardKind;
  front: string;
  back: string;
  sourceKey: string;
  exists: boolean;
}

export interface NewCardInput {
  deckId?: string | null;
  kind: CardKind;
  front: string;
  back?: string;
  sourcePageId?: string | null;
  sourceKey?: string | null;
}

export interface ReviewResponse {
  dueAt: string;
  state: number;
  preview: Record<Grade, string>;
}

export interface DayStat {
  day: string;
  reviews: number;
  seconds: number;
  remembered: number;
}

export interface Stats {
  days: DayStat[];
  retention: number | null;
  reviews: number;
  seconds: number;
  states: { new: number; learning: number; review: number; relearning: number };
  hardest: WeakCard[];
  upcoming: { day: string; due: number }[];
}
