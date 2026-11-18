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

export type Tool = "select" | "hand" | "pen" | "rect" | "ellipse" | "line" | "arrow" | "text" | "eraser";

export const TOOL_LABEL: Record<Tool, string> = {
  select: "Selecionar",
  hand: "Mover a vista",
  pen: "Caneta",
  rect: "Retângulo",
  ellipse: "Elipse",
  line: "Linha",
  arrow: "Seta",
  text: "Texto",
  eraser: "Borracha",
};

export const TOOL_KEY: Record<string, Tool> = { v: "select", h: "hand", p: "pen", r: "rect", o: "ellipse", l: "line", a: "arrow", t: "text", e: "eraser" };

/** Cor de cada nome, nos dois temas. `ink` segue o texto do app. */
export const COLOR_CSS: Record<CanvasColor, string> = {
  ink: "var(--text)",
  red: "#E5484D",
  orange: "#F5A524",
  green: "#30A46C",
  blue: "#3E63DD",
  purple: "#8E4EC6",
};

export interface ViewState {
  /** Deslocamento do mundo na tela, em pixels. */
  x: number;
  y: number;
  /** 1 = tamanho real. */
  zoom: number;
}
