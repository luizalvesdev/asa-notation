export type Recurrence = "daily" | "weekdays" | "weekly";

const DAY_MS = 86_400_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Data civil válida no formato AAAA-MM-DD (rejeita 2026-02-30). */
export function isDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toMs(date: string): number {
  const m = DATE.exec(date)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromMs(toMs(date) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/** Dias em [from, to] em que a tarefa recorrente que começa em `start` acontece. */
export function occurrences(recurrence: Recurrence, start: string, from: string, to: string): string[] {
  const first = start > from ? start : from;
  const out: string[] = [];
  const startWeekday = new Date(toMs(start)).getUTCDay();
  for (let day = first; day <= to; day = addDays(day, 1)) {
    const weekday = new Date(toMs(day)).getUTCDay();
    const hit =
      recurrence === "daily" || (recurrence === "weekdays" ? weekday >= 1 && weekday <= 5 : weekday === startWeekday);
    if (hit) out.push(day);
  }
  return out;
}
