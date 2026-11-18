import type { Notification, Verdict } from "./routine-types";

export type Group = "Hoje" | "Ontem" | "Antes";

/** Agrupa por dia local: hoje, ontem e o resto. Mantém a ordem recebida. */
export function groupNotifications(items: readonly Notification[], now: Date = new Date()): { name: Group; items: Notification[] }[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const groups: Record<Group, Notification[]> = { Hoje: [], Ontem: [], Antes: [] };
  for (const item of items) {
    const day = startOfDay(new Date(item.createdAt));
    groups[day >= today ? "Hoje" : day === today - 86_400_000 ? "Ontem" : "Antes"].push(item);
  }
  return (["Hoje", "Ontem", "Antes"] as const).filter((name) => groups[name].length > 0).map((name) => ({ name, items: groups[name] }));
}

/** "6h40" para 24000 s; "45 min" abaixo de uma hora; "0 min" sem estudo. */
export function formatStudy(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export const VERDICT_TEXT: Record<Verdict, { title: string; text: string }> = {
  forte: { title: "Semana forte", text: "Você concluiu a maior parte do que planejou e manteve o ritmo na maioria dos dias." },
  boa: { title: "Semana boa", text: "Houve avanço, mas ainda há tarefas abertas ou dias sem atividade. Escolha uma delas para destravar." },
  abaixo: { title: "Abaixo do ritmo", text: "Poucas tarefas concluídas e poucos dias ativos. Reduzir o plano da próxima semana ajuda a retomar." },
};

/** Nível de 0 a 4 para colorir o mapa de constância, relativo ao maior dia do período. */
export function activityLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  return ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
}
