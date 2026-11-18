const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "agora", "há 5 min", "há 3 h", "ontem" ou "16 nov". */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  if (diff < MIN) return "agora";
  if (diff < HOUR) return `há ${Math.floor(diff / MIN)} min`;
  if (diff < DAY) return `há ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor((startOfDay(now) - startOfDay(then)) / DAY);
  if (days === 1) return "ontem";
  const p = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).formatToParts(then);
  return p.filter((x) => x.type === "day" || x.type === "month").map((x) => x.value.replace(".", "")).join(" ");
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
