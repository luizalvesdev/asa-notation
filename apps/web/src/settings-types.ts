export interface CustomCheckin {
  id: string;
  title: string;
  time: string;
  /** 0 domingo a 6 sábado; vazio = todo dia. */
  days: number[];
  enabled: boolean;
}

export interface Settings {
  timezone: string;
  /** 0 domingo, 1 segunda. */
  weekStart: 0 | 1;
  checkins: { plan: string; thursday: string; saturday: string; study: string };
  checkinsEnabled: { plan: boolean; thursday: boolean; saturday: boolean; study: boolean };
  quiet: { start: string; end: string };
  customCheckins: CustomCheckin[];
  /** Assistentes criam e editam na hora, sem cartão de aprovação (apagar sempre pede). */
  aiAutoApply: boolean;
}

export interface ApiToken {
  id: string;
  name: string;
  scope: "read" | "write";
  createdAt: string;
  lastUsedAt: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  timezone: "America/Sao_Paulo",
  weekStart: 1,
  checkins: { plan: "08:30", thursday: "18:00", saturday: "10:00", study: "19:00" },
  checkinsEnabled: { plan: true, thursday: true, saturday: true, study: true },
  quiet: { start: "22:00", end: "07:30" },
  customCheckins: [],
  aiAutoApply: false,
};
