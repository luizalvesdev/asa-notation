import { useCallback, useEffect, useState } from "react";
import { loadPreference, resolveTheme, savePreference, type Preference, type Theme } from "./theme";

const query = () => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null);

export interface ThemeState {
  /** O tema que vale agora. */
  theme: Theme;
  /** Alterna entre claro e escuro e fixa a escolha. */
  toggle: () => void;
  preference: Preference;
  setPreference: (preference: Preference) => void;
}

export function useTheme(): ThemeState {
  const [preference, setPreferenceState] = useState<Preference>(loadPreference);
  const [prefersDark, setPrefersDark] = useState(() => query()?.matches ?? false);

  useEffect(() => {
    const media = query();
    if (!media) return;
    const onChange = () => setPrefersDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const theme = resolveTheme(preference, prefersDark);
  const setPreference = useCallback((next: Preference) => {
    savePreference(next);
    setPreferenceState(next);
  }, []);
  const toggle = useCallback(() => setPreference(theme === "claro" ? "escuro" : "claro"), [setPreference, theme]);
  return { theme, toggle, preference, setPreference };
}
