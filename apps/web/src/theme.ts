export type Theme = "claro" | "escuro";

export const THEME_KEY = "asa-theme";

export function parseTheme(value: unknown): Theme | null {
  return value === "claro" || value === "escuro" ? value : null;
}

export function initialTheme(stored: unknown, prefersDark: boolean): Theme {
  return parseTheme(stored) ?? (prefersDark ? "escuro" : "claro");
}

export function toggleTheme(theme: Theme): Theme {
  return theme === "claro" ? "escuro" : "claro";
}

export function loadTheme(): Theme {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    // armazenamento bloqueado: segue o tema do sistema
  }
  const prefersDark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  return initialTheme(stored, prefersDark);
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // sem persistência, o tema vale só nesta sessão
  }
}

/** O que a pessoa escolheu: um tema fixo ou "sistema" (segue o dispositivo). */
export type Preference = Theme | "sistema";

export function parsePreference(value: unknown): Preference | null {
  return value === "sistema" ? "sistema" : parseTheme(value);
}

export function resolveTheme(preference: Preference, prefersDark: boolean): Theme {
  return preference === "sistema" ? (prefersDark ? "escuro" : "claro") : preference;
}

export function loadPreference(): Preference {
  try {
    return parsePreference(localStorage.getItem(THEME_KEY)) ?? "sistema";
  } catch {
    return "sistema";
  }
}

export function savePreference(preference: Preference): void {
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    // sem persistência, vale só nesta sessão
  }
}

export const REDUCE_MOTION_KEY = "asa-reduce-motion";

export function loadReduceMotion(): boolean {
  try {
    return localStorage.getItem(REDUCE_MOTION_KEY) === "1";
  } catch {
    return false;
  }
}

/** Liga ou desliga o movimento reduzido (além do que o sistema já pede). */
export function applyReduceMotion(on: boolean): void {
  if (on) document.documentElement.dataset.reduceMotion = "1";
  else delete document.documentElement.dataset.reduceMotion;
  try {
    localStorage.setItem(REDUCE_MOTION_KEY, on ? "1" : "0");
  } catch {
    // sem persistência
  }
}
