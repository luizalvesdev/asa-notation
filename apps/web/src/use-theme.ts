import { useCallback, useState } from "react";
import { loadTheme, saveTheme, toggleTheme, type Theme } from "./theme";

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = toggleTheme(current);
      saveTheme(next);
      return next;
    });
  }, []);
  return [theme, toggle];
}
