export interface CheckinTimes {
  /** HH:MM */
  plan: string;
  thursday: string;
  saturday: string;
  /** Lembrete de revisão do estudo (só avisa se houver cards para hoje). */
  study: string;
}

/** Check-in criado pelo usuário: um aviso com título, num horário, em certos dias da semana. */
export interface CustomCheckin {
  id: string;
  title: string;
  /** HH:MM */
  time: string;
  /** Dias da semana (0 domingo a 6 sábado). Vazio = todo dia. */
  days: number[];
  enabled: boolean;
}

export const MAX_CUSTOM_CHECKINS = 20;

export interface Settings {
  /** Fuso IANA, usado em check-ins, lembretes e datas. */
  timezone: string;
  /** 0 domingo a 6 sábado. */
  weekStart: 0 | 1;
  checkins: CheckinTimes;
  /** Quais check-ins estão ligados. */
  checkinsEnabled: Record<keyof CheckinTimes, boolean>;
  quiet: { start: string; end: string };
  customCheckins: CustomCheckin[];
  /** Assistentes executam criar/editar direto, sem cartão de aprovação (apagar sempre pede). */
  aiAutoApply: boolean;
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
