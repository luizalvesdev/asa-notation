/** Build da demo (`vite --mode demo`): a API roda no navegador e a IA, o push e os tokens ficam desligados. */
export const DEMO = import.meta.env.VITE_DEMO === "1";

export const DEMO_AI_OFF = "Na demo a IA fica desligada: os assistentes usam a conta do autor.";

/** Volta a demo ao conteúdo inicial. A função é registrada por src/demo/main.ts, que só existe no build da demo. */
export function resetDemo(): void {
  (window as unknown as { __asaDemoReset?: () => void }).__asaDemoReset?.();
}
