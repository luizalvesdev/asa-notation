import type { Shape, ViewState } from "./canvas-types";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 6;

export function newShapeId(random: () => number = Math.random): string {
  let out = "";
  while (out.length < 10) out += Math.floor(random() * 36).toString(36);
  return out;
}

export function screenToWorld(view: ViewState, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom };
}

/** Muda o zoom mantendo o ponto (sx, sy) da tela parado. */
export function zoomAt(view: ViewState, sx: number, sy: number, factor: number): ViewState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const world = screenToWorld(view, sx, sy);
  return { zoom, x: sx - world.x * zoom, y: sy - world.y * zoom };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Retângulo com largura e altura positivas a partir de dois cantos quaisquer. */
export function normalizeBox(x1: number, y1: number, x2: number, y2: number): Box {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

/** Largura aproximada do texto (sem medir a fonte): serve para a seleção e o ajuste de enquadramento. */
export function textBox(s: Extract<Shape, { type: "text" }>): Box {
  const lines = s.text.split("\n");
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { x: s.x, y: s.y, w: longest * s.size * 0.58, h: lines.length * s.size * 1.3 };
}

export function bbox(s: Shape): Box {
  switch (s.type) {
    case "rect":
    case "ellipse":
      return normalizeBox(s.x, s.y, s.x + s.w, s.y + s.h);
    case "line":
    case "arrow":
      return normalizeBox(s.x1, s.y1, s.x2, s.y2);
    case "pen": {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < s.points.length; i += 2) {
        minX = Math.min(minX, s.points[i]!);
        maxX = Math.max(maxX, s.points[i]!);
        minY = Math.min(minY, s.points[i + 1]!);
        maxY = Math.max(maxY, s.points[i + 1]!);
      }
      return normalizeBox(minX, minY, maxX, maxY);
    }
    case "text":
      return textBox(s);
  }
}

/** Retângulo que contém todas as formas, ou null se não há nenhuma. */
export function boundsOf(shapes: readonly Shape[]): Box | null {
  if (shapes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    const b = bbox(s);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** A forma está no ponto (x, y)? `tol` é a folga em unidades do mundo. Contornos contam; o miolo de retângulo e elipse também. */
export function hitTest(s: Shape, x: number, y: number, tol: number): boolean {
  switch (s.type) {
    case "line":
    case "arrow":
      return distToSegment(x, y, s.x1, s.y1, s.x2, s.y2) <= tol + s.stroke / 2;
    case "pen": {
      if (s.points.length === 2) return Math.hypot(x - s.points[0]!, y - s.points[1]!) <= tol + s.stroke;
      for (let i = 0; i + 3 < s.points.length; i += 2) {
        if (distToSegment(x, y, s.points[i]!, s.points[i + 1]!, s.points[i + 2]!, s.points[i + 3]!) <= tol + s.stroke / 2) return true;
      }
      return false;
    }
    case "ellipse": {
      const b = bbox(s);
      const rx = b.w / 2 + tol;
      const ry = b.h / 2 + tol;
      if (rx === 0 || ry === 0) return false;
      const nx = (x - (b.x + b.w / 2)) / rx;
      const ny = (y - (b.y + b.h / 2)) / ry;
      return nx * nx + ny * ny <= 1;
    }
    case "rect":
    case "text": {
      const b = bbox(s);
      return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
    }
  }
}

/** A forma mais de cima (a última desenhada) no ponto. */
export function topShapeAt(shapes: readonly Shape[], x: number, y: number, tol: number): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) if (hitTest(shapes[i]!, x, y, tol)) return shapes[i]!;
  return null;
}

export function translate(s: Shape, dx: number, dy: number): Shape {
  switch (s.type) {
    case "rect":
    case "ellipse":
    case "text":
      return { ...s, x: s.x + dx, y: s.y + dy };
    case "line":
    case "arrow":
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
    case "pen":
      return { ...s, points: s.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) };
  }
}

/** Tira pontos muito próximos de um traço à mão, mantendo o último. Menos pontos, arquivo menor. */
export function thin(points: readonly number[], minDistance: number): number[] {
  if (points.length <= 4) return [...points];
  const out = [points[0]!, points[1]!];
  for (let i = 2; i < points.length - 2; i += 2) {
    if (Math.hypot(points[i]! - out[out.length - 2]!, points[i + 1]! - out[out.length - 1]!) >= minDistance) out.push(points[i]!, points[i + 1]!);
  }
  out.push(points[points.length - 2]!, points[points.length - 1]!);
  return out;
}

/** Pontos da ponta da seta: dois traços curtos saindo de (x2, y2) para trás. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): [number, number, number, number] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  return [x2 - size * Math.cos(angle - spread), y2 - size * Math.sin(angle - spread), x2 - size * Math.cos(angle + spread), y2 - size * Math.sin(angle + spread)];
}

/** Vista que enquadra `box` num espaço de `width` x `height` pixels, com margem. */
export function fitView(box: Box | null, width: number, height: number, margin = 48): ViewState {
  if (!box || box.w === 0 && box.h === 0) return { x: width / 2, y: height / 2, zoom: 1 };
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((width - margin * 2) / Math.max(box.w, 1), (height - margin * 2) / Math.max(box.h, 1), 1.5)));
  return { zoom, x: width / 2 - (box.x + box.w / 2) * zoom, y: height / 2 - (box.y + box.h / 2) * zoom };
}

// ---- desfazer e refazer ---------------------------------------------------------------------

export interface History {
  past: Shape[][];
  present: Shape[];
  future: Shape[][];
}

const LIMIT = 100;

export const startHistory = (present: Shape[]): History => ({ past: [], present, future: [] });

/** Registra uma mudança: o estado de agora vai para o passado e o futuro some. */
export function commit(h: History, next: Shape[]): History {
  return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
}

export function undo(h: History): History {
  const previous = h.past[h.past.length - 1];
  return previous ? { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] } : h;
}

export function redo(h: History): History {
  const [next, ...rest] = h.future;
  return next ? { past: [...h.past, h.present], present: next, future: rest } : h;
}
