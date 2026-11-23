/** Endereço de origem sem query, sem âncora e sem barra final: serve para reconhecer a mesma página de curso. */
export function normalizeSourceUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return null;
  }
}
