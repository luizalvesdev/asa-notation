export interface SnippetPart {
  text: string;
  hit: boolean;
}

const START = "\u0001";
const STOP = "\u0002";

/** Divide o trecho da busca em partes, marcando as que são o termo. Nunca interpreta HTML. */
export function splitSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let hit = false;
  let buffer = "";
  const flush = () => {
    if (buffer) parts.push({ text: buffer, hit });
    buffer = "";
  };
  for (const char of snippet) {
    if (char === START) {
      flush();
      hit = true;
    } else if (char === STOP) {
      flush();
      hit = false;
    } else {
      buffer += char;
    }
  }
  flush();
  return parts;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "hoje, 14:32", "ontem, 09:10" ou "15 nov" (com o ano se for de outro ano). */
export function formatDeleted(iso: string, nowMs: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(at);
  const days = Math.round((startOfDay(nowMs) - startOfDay(at)) / DAY_MS);
  if (days === 0) return `hoje, ${time}`;
  if (days === 1) return `ontem, ${time}`;
  const sameYear = new Date(at).getFullYear() === new Date(nowMs).getFullYear();
  const parts = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" }).formatToParts(at);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${pick("day")} ${pick("month").replace(/\./g, "")}`;
  return sameYear ? date : `${date} ${pick("year")}`;
}
