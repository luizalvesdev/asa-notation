import { badRequest, json, type Route } from "../routing.js";
import { validTimeZone } from "../settings/routes.js";
import { addDays, isDate } from "../tasks/recurrence.js";
import type { SqlClient } from "../sql.js";
import { dailyActivity } from "./activity.js";

const MAX_WEEKS = 26;

/** Segunda-feira da semana de `date`. */
function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export function progressRoutes(sql: SqlClient): Route[] {
  return [
    {
      method: "GET",
      pattern: /^\/progress$/,
      access: "session",
      handle: async ({ req }) => {
        const today = req.query.today;
        const tz = req.query.tz ?? "UTC";
        const weeks = req.query.weeks === undefined ? 12 : Number(req.query.weeks);
        if (!isDate(today) || !validTimeZone(tz) || !Number.isInteger(weeks) || weeks < 1 || weeks > MAX_WEEKS) return badRequest("invalid_query");

        const lastWeek = mondayOf(today);
        const firstWeek = addDays(lastWeek, -7 * (weeks - 1));
        const activity = await dailyActivity(sql, firstWeek, addDays(lastWeek, 6), tz);

        const days: { day: string; tasks: number; reviews: number }[] = [];
        const series = [];
        for (let w = 0; w < weeks; w++) {
          const start = addDays(firstWeek, 7 * w);
          let tasks = 0;
          let reviews = 0;
          let seconds = 0;
          let activeDays = 0;
          for (let d = 0; d < 7; d++) {
            const day = addDays(start, d);
            const a = activity.get(day);
            days.push({ day, tasks: a?.tasks ?? 0, reviews: a?.reviews ?? 0 });
            if (!a) continue;
            tasks += a.tasks;
            reviews += a.reviews;
            seconds += a.seconds;
            if (a.tasks > 0 || a.reviews > 0) activeDays += 1;
          }
          series.push({ start, tasks, reviews, seconds, activeDays });
        }

        // Sequência atual: dias seguidos com atividade, contando de hoje (ou de ontem, se hoje ainda está vazio).
        let streak = 0;
        let cursor = today;
        const active = (day: string) => {
          const a = activity.get(day);
          return !!a && (a.tasks > 0 || a.reviews > 0);
        };
        if (!active(cursor)) cursor = addDays(cursor, -1);
        while (cursor >= firstWeek && active(cursor)) {
          streak += 1;
          cursor = addDays(cursor, -1);
        }
        return json(200, { weeks: series, days, streak });
      },
    },
  ];
}
