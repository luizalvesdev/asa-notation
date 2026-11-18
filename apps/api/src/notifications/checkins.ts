import type { Settings } from "../settings/model.js";

export type CheckinKind = "plan" | "thursday" | "saturday";

export interface DueCheckin {
  kind: CheckinKind;
  /** Dia local (AAAA-MM-DD) a que o check-in pertence. */
  date: string;
  /** 0 para hoje, 1 para ontem. */
  daysAgo: 0 | 1;
  dedupeKey: string;
}

/** Dia, dia da semana (0 = domingo) e minutos desde a meia-noite, no fuso `tz`. */
export function localParts(ms: number, tz: string): { date: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const WEEKDAY: Record<CheckinKind, number | null> = { plan: null, thursday: 4, saturday: 6 };

/**
 * Check-ins ligados cujo horário já passou hoje (no fuso das configurações).
 * Quinta e sábado olham também um dia para trás, para quem só abriu o app no dia seguinte.
 * O plano diário vale só para hoje: um plano de ontem já não serve.
 */
export function dueCheckins(nowMs: number, settings: Settings): DueCheckin[] {
  const today = localParts(nowMs, settings.timezone);
  const yesterday = localParts(nowMs - 24 * 3_600_000, settings.timezone);
  const out: DueCheckin[] = [];
  for (const [day, isToday] of [[yesterday, false], [today, true]] as const) {
    for (const kind of ["plan", "thursday", "saturday"] as const) {
      if (!settings.checkinsEnabled[kind]) continue;
      if (kind === "plan" && !isToday) continue;
      const weekday = WEEKDAY[kind];
      if (weekday !== null && day.weekday !== weekday) continue;
      if (isToday && minutesOf(settings.checkins[kind]) > today.minutes) continue;
      out.push({ kind, date: day.date, daysAgo: isToday ? 0 : 1, dedupeKey: `${kind}:${day.date}` });
    }
  }
  return out;
}
