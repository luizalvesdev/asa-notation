export interface CheckinTimes {
  /** HH:MM */
  plan: string;
  thursday: string;
  saturday: string;
}

export interface Settings {
  /** Fuso IANA, usado em check-ins, lembretes e datas. */
  timezone: string;
  /** 0 domingo a 6 sábado. */
  weekStart: 0 | 1;
  checkins: CheckinTimes;
  /** Quais check-ins estão ligados. */
  checkinsEnabled: Record<keyof CheckinTimes, boolean>;
  quiet: { start: string; end: string };
}

export const DEFAULT_SETTINGS: Settings = {
  timezone: "America/Sao_Paulo",
  weekStart: 1,
  checkins: { plan: "08:30", thursday: "18:00", saturday: "10:00" },
  checkinsEnabled: { plan: true, thursday: true, saturday: true },
  quiet: { start: "22:00", end: "07:30" },
};
