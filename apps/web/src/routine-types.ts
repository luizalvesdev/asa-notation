export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export interface WeeklyReview {
  weekStart: string;
  rating: number | null;
  worked: string;
  blocked: string;
  focus: string[];
  applied: boolean;
}

export interface WeekMetrics {
  tasksDone: number;
  tasksTotal: number;
  studySeconds: number;
  cardsReviewed: number;
  activeDays: number;
  days: number;
}

export type Verdict = "forte" | "boa" | "abaixo";

export interface RoutineWeek {
  start: string;
  metrics: WeekMetrics;
  verdict: Verdict;
  score: number;
  review: WeeklyReview | null;
}

export interface ProgressWeek {
  start: string;
  tasks: number;
  reviews: number;
  seconds: number;
  activeDays: number;
}

export interface ProgressData {
  weeks: ProgressWeek[];
  days: { day: string; tasks: number; reviews: number }[];
  streak: number;
}
