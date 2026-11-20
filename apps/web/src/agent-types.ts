export type JobStatus = "queued" | "running" | "review" | "changes" | "approved" | "done" | "failed" | "canceled";

export interface AgentCard {
  ref: string;
  title: string;
  status: string;
  url: string | null;
}

export interface AgentRepo {
  name: string;
  base: string;
}

export interface AgentJob {
  id: string;
  ref: string;
  title: string;
  url: string | null;
  instruction: string;
  repos: string[];
  base: string | null;
  prs: { repo: string; url: string }[];
  status: JobStatus;
  cancelRequested: boolean;
  interruptRequested: boolean;
  pendingMessage: boolean;
  prUrl: string | null;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentEvent {
  id: number;
  kind: "created" | "started" | "progress" | "review" | "feedback" | "reply" | "approved" | "done" | "failed" | "canceled";
  text: string;
  createdAt: string;
}

export interface AgentState {
  runnerSeenAt: string | null;
  repos: AgentRepo[];
  cards: AgentCard[];
  jobs: AgentJob[];
}

/** Conversa de um card: os jobs dele, do mais antigo ao mais novo, cada um com seus eventos. */
export interface CardThread {
  card: AgentCard | null;
  repos: AgentRepo[];
  runnerSeenAt: string | null;
  thread: { job: AgentJob; events: AgentEvent[] }[];
}
