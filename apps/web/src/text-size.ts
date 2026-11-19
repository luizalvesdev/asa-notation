/** Tamanho do texto da interface, guardado por aparelho (celular e computador podem querer tamanhos diferentes). */
export const TEXT_SIZES = [
  { value: 1, label: "Normal" },
  { value: 1.1, label: "Grande" },
  { value: 1.2, label: "Maior" },
] as const;

export type TextSize = (typeof TEXT_SIZES)[number]["value"];

const KEY = "asa-text-size";

export function parseTextSize(value: unknown): TextSize | null {
  const n = typeof value === "string" ? Number(value) : value;
  return TEXT_SIZES.find((s) => s.value === n)?.value ?? null;
}

export function loadTextSize(): TextSize {
  try {
    return parseTextSize(localStorage.getItem(KEY)) ?? 1;
  } catch {
    return 1;
  }
}

/** As fontes do CSS são `calc(Npx * var(--fs, 1))`: trocar a variável muda todo o texto, sem mexer em medidas nem posições. */
export function applyTextSize(size: TextSize): void {
  document.documentElement.style.setProperty("--fs", String(size));
  try {
    if (size === 1) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(size));
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}
