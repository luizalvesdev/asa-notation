export type Agent = "hermes" | "renato";

export type DraftKind = "tasks" | "capture" | "page";
export type DraftStatus = "pending" | "approved" | "discarded";

export interface Draft {
  id: string;
  kind: DraftKind;
  payload: Record<string, unknown>;
  status: DraftStatus;
  result: Record<string, unknown> | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  drafts: Draft[];
}

export interface Conversation {
  id: string;
  agent: Agent;
  title: string;
  updatedAt: string;
}

export const AGENT_NAME: Record<Agent, string> = { hermes: "Hermes", renato: "Renato" };

export const AGENT_HINT: Record<Agent, string[]> = {
  hermes: ["Organiza meu dia de amanhã com base nas metas", "O que está atrasado?", "Planeja minha semana de estudo"],
  renato: ["O que anotei sobre idempotência?", "Organiza minha Inbox", "Cria um mapa mental de Raft"],
};
