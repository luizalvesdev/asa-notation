import { DefaultScheduler, Rating } from "ts-fsrs";

type Scheduler = Awaited<ReturnType<typeof DefaultScheduler>>;

/** Estado do cartão como guardamos no banco (datas em ISO). */
export type StoredCard = Record<string, unknown> & { dueAt: string; state: number };

export type Grade = 1 | 2 | 3 | 4;
export const GRADES: Grade[] = [1, 2, 3, 4];

let scheduler: Promise<Scheduler> | null = null;
const get = () => (scheduler ??= DefaultScheduler());

// O tipo do card do ts-fsrs muda conforme o modelo (FSRS-6/7); aqui guardamos e devolvemos o objeto como veio.
function revive(stored: StoredCard): never {
  const card = { ...stored, dueAt: new Date(stored.dueAt) } as Record<string, unknown>;
  card.lastReviewAt = typeof stored.lastReviewAt === "string" ? new Date(stored.lastReviewAt) : null;
  return card as never;
}

const store = (card: unknown): StoredCard => JSON.parse(JSON.stringify(card)) as StoredCard;

export async function newCard(now: Date): Promise<StoredCard> {
  return store((await get()).newCard({ now }));
}

/** Quando o cartão volta para cada nota (Errei, Difícil, Bom, Fácil). */
export async function preview(stored: StoredCard, now: Date): Promise<Record<Grade, string>> {
  const s = await get();
  const out = {} as Record<Grade, string>;
  for (const item of s.preview({ card: revive(stored), now })) {
    out[item.grade as Grade] = new Date(item.card.dueAt).toISOString();
  }
  return out;
}

export async function review(stored: StoredCard, grade: Grade, now: Date): Promise<StoredCard> {
  const s = await get();
  const rating = ({ 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy } as const)[grade];
  return store(s.review({ card: revive(stored), grade: rating, now }).card);
}
