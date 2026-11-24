import { isQuiet, localParts } from "../notifications/checkins.js";
import type { PgSettingsStore } from "../settings/store.js";
import type { PgTaskStore } from "../tasks/store.js";
import { addDays } from "../tasks/recurrence.js";

/** Até onde à frente o servidor agenda disparos exatos (cada disparo roda de novo e agenda os seguintes). */
export const HORIZON_MS = 36 * 3_600_000;
const MINUTE_MS = 60_000;

/** O instante (UTC, em ms) em que o relógio de parede de `tz` marca `date` `hhmm`. */
export function zonedToUtcMs(date: string, hhmm: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)));
  let guess = wall;
  // Duas passadas bastam: o deslocamento do fuso só muda na virada do horário de verão.
  for (let i = 0; i < 2; i++) {
    const shown = localParts(guess, tz);
    const [sy, sm, sd] = shown.date.split("-").map(Number) as [number, number, number];
    guess += wall - (Date.UTC(sy, sm - 1, sd) + shown.minutes * MINUTE_MS);
  }
  return guess;
}

const weekdayOf = (date: string) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/**
 * Os minutos (UTC, em ms) em que algo deve avisar nas próximas 36 h: tarefas com hora ainda abertas,
 * check-ins próprios e os check-ins da rotina. Fora do horário de silêncio, pois nele nada é enviado.
 */
export async function upcomingFireTimes({ settings, tasks, now }: { settings: PgSettingsStore; tasks: PgTaskStore; now: () => number }): Promise<number[]> {
  const cfg = await settings.get();
  const from = now();
  const to = from + HORIZON_MS;
  const first = localParts(from, cfg.timezone).date;
  const last = addDays(localParts(to, cfg.timezone).date, 1);
  const dates: string[] = [];
  for (let day = addDays(first, -1); day <= last; day = addDays(day, 1)) dates.push(day);

  const times = new Set<number>();
  const add = (date: string, hhmm: string) => {
    const at = zonedToUtcMs(date, hhmm, cfg.timezone);
    if (at > from && at <= to && !isQuiet(at, cfg)) times.add(at);
  };

  for (const task of (await tasks.list(dates[0]!, last, first)).days) {
    if (!task.done && task.date && task.time) add(task.date, task.time);
  }
  const routineWeekday = { plan: null, study: null, thursday: 4, saturday: 6 } as const;
  for (const date of dates) {
    const weekday = weekdayOf(date);
    for (const item of cfg.customCheckins) {
      if (item.enabled && (item.days.length === 0 || item.days.includes(weekday))) add(date, item.time);
    }
    for (const kind of ["plan", "study", "thursday", "saturday"] as const) {
      const only = routineWeekday[kind];
      if (cfg.checkinsEnabled[kind] && (only === null || only === weekday)) add(date, cfg.checkins[kind]);
    }
  }
  return [...times].sort((a, b) => a - b);
}
