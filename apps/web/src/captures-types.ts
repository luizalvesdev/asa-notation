export const KINDS = ["idea", "study", "work", "project", "reference"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABEL: Record<Kind, string> = {
  idea: "Ideia",
  study: "Estudo",
  work: "Trabalho",
  project: "Projeto",
  reference: "Referência",
};

/** Cor do ponto de cada tipo (usa os tokens do design). */
export const KIND_COLOR: Record<Kind, string> = {
  idea: "var(--warning)",
  study: "var(--accent)",
  work: "var(--text-2)",
  project: "var(--success)",
  reference: "var(--renato)",
};

export interface Capture {
  id: string;
  text: string;
  kind: Kind | null;
  tags: string[];
  createdAt: string;
}

export type Counts = Record<Kind | "none" | "total" | "done", number>;

export const EMPTY_COUNTS: Counts = { idea: 0, study: 0, work: 0, project: 0, reference: 0, none: 0, total: 0, done: 0 };

export type KindFilter = Kind | "none" | "all";

/** Pendentes ficam na Inbox; finalizadas saem dela e moram na aba Finalizadas. */
export type InboxView = "pending" | "done";
