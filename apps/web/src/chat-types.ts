export type Agent = "hermes" | "renato" | "tutor";

export const AGENTS: Agent[] = ["hermes", "renato", "tutor"];

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

export const AGENT_NAME: Record<Agent, string> = { hermes: "Hermes", renato: "Renato", tutor: "Tutor" };

export const AGENT_HINT: Record<Agent, string[]> = {
  hermes: ["Organiza meu dia de amanhã com base nas metas", "O que está atrasado?", "Planeja minha semana de estudo"],
  renato: ["O que anotei sobre idempotência?", "Organiza minha Inbox", "Cria um mapa mental de Raft"],
  tutor: ["Me faça um quiz nos meus pontos fracos", "Quero entender melhor um tema das minhas notas", "Me ensine fazendo perguntas"],
};

/** Pede ao app para abrir o painel de chat com um agente (e, opcionalmente, já mandar uma pergunta). */
export interface OpenChatRequest {
  agent: Agent;
  prompt?: string;
}

export const OPEN_CHAT_EVENT = "asa:open-chat";

export function openChat(request: OpenChatRequest): void {
  window.dispatchEvent(new CustomEvent<OpenChatRequest>(OPEN_CHAT_EVENT, { detail: request }));
}
