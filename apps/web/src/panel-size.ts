export interface SizeLimits {
  min: number;
  max: number;
  initial: number;
}

export const SIDE_LIMITS: SizeLimits = { min: 200, max: 420, initial: 248 };
export const CHAT_LIMITS: SizeLimits = { min: 300, max: 720, initial: 380 };

/** Mantém a largura dentro dos limites (e nunca passa de `ceiling`, para o conteúdo não sumir em janelas estreitas). */
export function clampWidth(value: number, limits: SizeLimits, ceiling = Infinity): number {
  if (!Number.isFinite(value)) return limits.initial;
  return Math.round(Math.max(limits.min, Math.min(limits.max, ceiling, value)));
}

/** Nova largura durante o arrasto. `edge` é o lado da janela em que o painel fica: a barra lateral cresce para a direita, o chat para a esquerda. */
export function draggedWidth(start: number, dx: number, edge: "left" | "right"): number {
  return edge === "left" ? start + dx : start - dx;
}

/** Lê uma largura guardada; valor ausente, quebrado ou fora dos limites vira a largura padrão. */
export function readStoredWidth(raw: string | null, limits: SizeLimits): number {
  if (raw === null || raw.trim() === "") return limits.initial;
  const n = Number(raw);
  return Number.isFinite(n) ? clampWidth(n, limits) : limits.initial;
}
