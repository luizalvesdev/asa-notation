export interface View {
  /** Deslocamento em pixels (canto superior esquerdo do conteúdo em relação ao quadro). */
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 5;
export const INITIAL_VIEW: View = { x: 0, y: 0, scale: 1 };

export const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Muda a escala mantendo o ponto (px, py) do quadro parado debaixo do cursor. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return { scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}

export const panBy = (view: View, dx: number, dy: number): View => ({ ...view, x: view.x + dx, y: view.y + dy });

/** Fator de zoom de um evento de roda: suave no trackpad (deltas pequenos) e firme no mouse. */
export function wheelFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaY;
  return Math.exp(-Math.max(-120, Math.min(120, pixels)) * 0.0025);
}

export const isInitial = (view: View) => view.scale === 1 && view.x === 0 && view.y === 0;
