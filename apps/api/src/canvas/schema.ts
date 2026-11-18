export const CANVAS_COLORS = ["ink", "red", "orange", "green", "blue", "purple"] as const;
export type CanvasColor = (typeof CANVAS_COLORS)[number];

export type Shape =
  | { id: string; type: "rect" | "ellipse"; color: CanvasColor; stroke: number; x: number; y: number; w: number; h: number }
  | { id: string; type: "line" | "arrow"; color: CanvasColor; stroke: number; x1: number; y1: number; x2: number; y2: number }
  | { id: string; type: "pen"; color: CanvasColor; stroke: number; points: number[] }
  | { id: string; type: "text"; color: CanvasColor; stroke: number; x: number; y: number; text: string; size: number };

export interface CanvasBody {
  type: "canvas";
  shapes: Shape[];
}

export const MAX_SHAPES = 3000;
const MAX_BYTES = 500_000;
const MAX_POINTS = 6000;
const MAX_TEXT = 500;
const LIMIT = 1_000_000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= LIMIT;
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(v);

/** Confere um quadro inteiro. Devolve o quadro limpo (só os campos conhecidos) ou o código do erro. */
export function parseCanvas(raw: unknown): CanvasBody | string {
  if (!isRecord(raw) || raw.type !== "canvas" || !Array.isArray(raw.shapes) || raw.shapes.length > MAX_SHAPES) return "invalid_canvas";
  const shapes: Shape[] = [];
  const seen = new Set<string>();
  for (const s of raw.shapes) {
    if (!isRecord(s) || !id(s.id) || seen.has(s.id)) return "invalid_shape";
    seen.add(s.id);
    if (!(CANVAS_COLORS as readonly unknown[]).includes(s.color)) return "invalid_shape";
    if (!num(s.stroke) || s.stroke < 1 || s.stroke > 24) return "invalid_shape";
    const base = { id: s.id, color: s.color as CanvasColor, stroke: s.stroke };
    switch (s.type) {
      case "rect":
      case "ellipse":
        if (!num(s.x) || !num(s.y) || !num(s.w) || !num(s.h)) return "invalid_shape";
        shapes.push({ ...base, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h });
        break;
      case "line":
      case "arrow":
        if (!num(s.x1) || !num(s.y1) || !num(s.x2) || !num(s.y2)) return "invalid_shape";
        shapes.push({ ...base, type: s.type, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 });
        break;
      case "pen":
        if (!Array.isArray(s.points) || s.points.length < 2 || s.points.length > MAX_POINTS || s.points.length % 2 !== 0 || !s.points.every(num)) return "invalid_shape";
        shapes.push({ ...base, type: "pen", points: s.points as number[] });
        break;
      case "text":
        if (!num(s.x) || !num(s.y) || typeof s.text !== "string" || s.text.length > MAX_TEXT || !num(s.size) || s.size < 8 || s.size > 96) return "invalid_shape";
        shapes.push({ ...base, type: "text", x: s.x, y: s.y, text: s.text, size: s.size });
        break;
      default:
        return "invalid_shape";
    }
  }
  const body: CanvasBody = { type: "canvas", shapes };
  return JSON.stringify(body).length > MAX_BYTES ? "canvas_too_large" : body;
}

/** Texto dos blocos de texto do quadro, para a busca. */
export function canvasText(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.shapes)) return "";
  return body.shapes
    .map((s) => (isRecord(s) && s.type === "text" && typeof s.text === "string" ? s.text : ""))
    .filter(Boolean)
    .join(" ");
}

export const COVERS = ["sunrise", "ocean", "forest", "dusk", "slate", "rose"] as const;

/** Capa: um degradê da lista (`grad:ocean`) ou o endereço http(s) de uma imagem. */
export function validCover(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || value.length > 300) return false;
  if (value.startsWith("grad:")) return (COVERS as readonly string[]).includes(value.slice(5));
  return /^https?:\/\/\S+$/i.test(value);
}
