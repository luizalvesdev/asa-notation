const DAY_MS = 86_400_000;

function utc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Data local do navegador no formato AAAA-MM-DD (não usa UTC: "hoje" é o dia de quem usa). */
export function localDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  return fmt(new Date(utc(date).getTime() + days * DAY_MS));
}

/** Primeiro dia da semana de `date`: segunda-feira (padrão) ou domingo (`first` = 0). */
export function weekStart(date: string, first: 0 | 1 = 1): string {
  const weekday = utc(date).getUTCDay(); // 0 = domingo
  return addDays(date, -((weekday - first + 7) % 7));
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const clean = (text: string) => text.replace(/\./g, "");

function parts(date: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: "UTC" }).formatToParts(utc(date))) {
    out[p.type] = clean(p.value);
  }
  return out;
}

/** "quarta, 18 de novembro" */
export function formatHeading(date: string): string {
  const p = parts(date, { weekday: "long", day: "numeric", month: "long" });
  return `${p.weekday!.replace("-feira", "")}, ${p.day} de ${p.month}`;
}

/** "16 a 22 de novembro", ou "30 de nov a 6 de dez" quando a semana cruza o mês. */
export function formatWeekRange(start: string): string {
  const end = addDays(start, 6);
  const a = parts(start, { day: "numeric", month: "long" });
  const b = parts(end, { day: "numeric", month: "long" });
  if (a.month === b.month) return `${a.day} a ${b.day} de ${b.month}`;
  const short = (d: string) => parts(d, { day: "numeric", month: "short" });
  return `${short(start).day} de ${short(start).month} a ${short(end).day} de ${short(end).month}`;
}

/** Nome curto do dia da semana: "seg", "ter", ... */
export function weekdayShort(date: string): string {
  return parts(date, { weekday: "short" }).weekday!;
}

export function dayOfMonth(date: string): string {
  return String(utc(date).getUTCDate());
}

/** "hoje", "ontem", "amanhã" ou "seg, 16 nov". */
export function formatWhen(date: string, today: string): string {
  if (date === today) return "hoje";
  if (date === addDays(today, -1)) return "ontem";
  if (date === addDays(today, 1)) return "amanhã";
  const p = parts(date, { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday}, ${p.day} ${p.month}`;
}

/** "31 mar 2027" */
export function formatDate(date: string): string {
  const p = parts(date, { day: "numeric", month: "short", year: "numeric" });
  return `${p.day} ${p.month} ${p.year}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / DAY_MS);
}

/** Início do dia local (meia-noite) como ISO, para o servidor contar "hoje" no fuso de quem usa. */
export function localDayStartIso(now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
