import { addDays } from "./tasks-dates";
import type { Grade, QueueCard, ReviewResponse, Stats } from "./study-types";

/** "1 min", "10 min", "3 h", "4 d", "2 meses". Mostra quanto falta até `to`. */
export function formatInterval(from: Date | string, to: Date | string): string {
  const ms = Math.max(0, new Date(to).getTime() - new Date(from).getTime());
  const min = ms / 60_000;
  if (min < 1) return "< 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const hours = min / 60;
  if (hours < 24) return `${Math.round(hours)} h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} d`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} ${months === 1 ? "mês" : "meses"}`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  return `${String(years).replace(".", ",")} ${years === 1 ? "ano" : "anos"}`;
}

/** Minutos estimados para `count` cards, com no mínimo 1. */
export function estimateMinutes(count: number, avgSeconds: number): number {
  return count === 0 ? 0 : Math.max(1, Math.round((count * avgSeconds) / 60));
}

export interface Segment {
  text: string;
  blank: boolean;
}

/** Quebra "O líder envia {{heartbeats}}" em trechos, marcando as lacunas. */
export function clozeSegments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(/\{\{([^{}]+)\}\}/g)) {
    if (match.index! > last) out.push({ text: text.slice(last, match.index), blank: false });
    out.push({ text: match[1]!.trim(), blank: true });
    last = match.index! + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), blank: false });
  return out;
}

/** Texto da resposta de um card de lacuna: as respostas, na ordem. */
export function clozeAnswers(text: string): string {
  return clozeSegments(text)
    .filter((s) => s.blank)
    .map((s) => s.text)
    .join(" · ");
}

// ---- sessão de revisão -------------------------------------------------------

export interface Result {
  cardId: string;
  front: string;
  grade: Grade;
  seconds: number;
}

export interface Session {
  queue: QueueCard[];
  /** Quantos cards diferentes a sessão começou com. */
  total: number;
  /** Cards diferentes já avaliados ao menos uma vez. */
  seen: ReadonlySet<string>;
  revealed: boolean;
  results: Result[];
  /** Instante (ms) em que o card atual apareceu. */
  shownAt: number;
}

/** Cards que erram voltam ao fim da fila se vencerem dentro desta janela. */
export const REQUEUE_WINDOW_MS = 20 * 60_000;

export function startSession(queue: QueueCard[], now: number): Session {
  return { queue, total: queue.length, seen: new Set(), revealed: false, results: [], shownAt: now };
}

export const current = (s: Session): QueueCard | null => s.queue[0] ?? null;
export const isFinished = (s: Session): boolean => s.queue.length === 0;

/** Troca o texto do card atual depois de editado, sem mexer na ordem da sessão. */
export function replaceCurrent(s: Session, card: Pick<QueueCard, "id" | "front" | "back">): Session {
  const first = s.queue[0];
  if (!first || first.id !== card.id) return s;
  return { ...s, queue: [{ ...first, front: card.front, back: card.back }, ...s.queue.slice(1)] };
}

export function reveal(s: Session): Session {
  return s.queue.length === 0 || s.revealed ? s : { ...s, revealed: true };
}

/** Registra a nota do card atual e passa ao próximo, recolocando-o no fim se vai vencer logo. */
export function applyGrade(s: Session, grade: Grade, response: ReviewResponse, now: number): Session {
  const card = s.queue[0];
  if (!card) return s;
  const rest = s.queue.slice(1);
  const soon = new Date(response.dueAt).getTime() - now <= REQUEUE_WINDOW_MS;
  const queue = soon ? [...rest, { ...card, state: response.state, dueAt: response.dueAt, preview: response.preview }] : rest;
  return {
    queue,
    total: s.total,
    seen: new Set([...s.seen, card.id]),
    revealed: false,
    results: [...s.results, { cardId: card.id, front: card.front, grade, seconds: Math.max(0, Math.round((now - s.shownAt) / 1000)) }],
    shownAt: now,
  };
}

export interface Summary {
  cards: number;
  /** Percentual de cards cuja avaliação final foi 2 a 4. */
  remembered: number;
  seconds: number;
  struggled: string[];
}

export function summarize(results: readonly Result[]): Summary {
  const last = new Map<string, Result>();
  const struggled = new Set<string>();
  for (const r of results) {
    last.set(r.cardId, r);
    if (r.grade === 1) struggled.add(r.front);
  }
  const finals = [...last.values()];
  const ok = finals.filter((r) => r.grade >= 2).length;
  return {
    cards: finals.length,
    remembered: finals.length === 0 ? 0 : Math.round((ok / finals.length) * 100),
    seconds: results.reduce((sum, r) => sum + r.seconds, 0),
    struggled: [...struggled],
  };
}

/** "3:12" */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Uma coluna por dia, mesmo nos dias sem revisão, terminando em `today`. */
export function fillDays(stats: Pick<Stats, "days">, today: string, days: number): { day: string; reviews: number; remembered: number }[] {
  const byDay = new Map(stats.days.map((d) => [d.day, d]));
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - (days - 1));
    const found = byDay.get(day);
    return { day, reviews: found?.reviews ?? 0, remembered: found?.remembered ?? 0 };
  });
}
