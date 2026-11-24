export const KINDS = ["idea", "study", "work", "project", "reference"] as const;
export type Kind = (typeof KINDS)[number];

export interface Capture {
  id: string;
  text: string;
  kind: Kind | null;
  tags: string[];
  createdAt: string;
}

export interface NewCapture {
  /** Gerado pelo cliente: reenviar a mesma captura (fila offline) não duplica. */
  id?: string;
  text: string;
  kind: Kind | null;
  createdAt?: string;
}

export interface CapturePatch {
  text?: string;
  kind?: Kind | null;
}

export type Counts = Record<Kind | "none" | "total" | "done", number>;
