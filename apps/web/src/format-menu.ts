/**
 * Endereço digitado no campo de link: "site.com" vira https://site.com; só http(s) e mailto são aceitos.
 * Devolve null se não der para usar (vazio, javascript:, texto sem cara de endereço).
 */
export function normalizeHref(value: string): string | null {
  const text = value.trim();
  if (text === "" || /\s/.test(text)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return /^(https?:|mailto:)/i.test(text) ? text : null;
  // Link interno do app (#/p/...) também vale.
  if (text.startsWith("#/")) return text;
  return /^[^.\s]+\.[^.\s]{2,}/.test(text) ? `https://${text}` : null;
}
