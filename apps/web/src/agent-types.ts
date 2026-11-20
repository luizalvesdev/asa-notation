export type JobStatus = "queued" | "running" | "review" | "changes" | "approved" | "done" | "failed" | "canceled";

export interface AgentCard {
  ref: string;
  title: string;
  status: string;
  url: string | null;
}

export interface AgentJob {
  id: string;
  ref: string;
  title: string;
  url: string | null;
  instruction: string;
  status: JobStatus;
  cancelRequested: boolean;
  prUrl: string | null;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentEvent {
  id: number;
  kind: "created" | "started" | "progress" | "review" | "feedback" | "approved" | "done" | "failed" | "canceled";
  text: string;
  createdAt: string;
}

export interface AgentState {
  runnerSeenAt: string | null;
  cards: AgentCard[];
  jobs: AgentJob[];
}
