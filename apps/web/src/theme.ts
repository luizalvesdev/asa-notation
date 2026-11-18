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
