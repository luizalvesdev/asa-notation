/** Linguagens do seletor do bloco de código: o `value` é o nome registrado no destaque (ver code-highlight.ts). */
export const CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Shell" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "xml", label: "HTML / XML" },
  { value: "css", label: "CSS" },
  { value: "markdown", label: "Markdown" },
];

const ALIASES: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", py: "python", sh: "bash", shell: "bash", zsh: "bash", yml: "yaml", html: "xml", svg: "xml", md: "markdown", rs: "rust" };

/** Valor do seletor para o `language` guardado no bloco (apelidos viram o nome principal; desconhecida ou vazia = automático, ""). */
export function languageValue(language: unknown): string {
  if (typeof language !== "string" || language.trim() === "") return "";
  const key = language.trim().toLowerCase();
  const name = ALIASES[key] ?? key;
  return CODE_LANGUAGES.some((l) => l.value === name) ? name : "";
}

/** Rótulo para mostrar no modo leitura. */
export function languageLabel(language: unknown): string {
  const value = languageValue(language);
  return CODE_LANGUAGES.find((l) => l.value === value)?.label ?? (typeof language === "string" && language.trim() !== "" ? language : "");
}
