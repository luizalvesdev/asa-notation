export interface Settings {
  timezone: string;
  /** 0 domingo, 1 segunda. */
  weekStart: 0 | 1;
  checkins: { plan: string; thursday: string; saturday: string };
  checkinsEnabled: { plan: boolean; thursday: boolean; saturday: boolean };
  quiet: { start: string; end: string };
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
  checkins: { plan: "08:30", thursday: "18:00", saturday: "10:00" },
  checkinsEnabled: { plan: true, thursday: true, saturday: true },
  quiet: { start: "22:00", end: "07:30" },
};
