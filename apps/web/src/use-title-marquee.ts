import { useEffect, type RefObject } from "react";

const PAUSE_MS = 1200;
/** Duração do deslize: proporcional ao que está escondido (~55 px/s), com piso. */
const msFor = (hidden: number) => Math.max(1500, hidden * 18);
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/**
 * Título comprido demais para o campo: desliza suave do começo ao fim e volta, em ciclo, para dar para ler
 * tudo. Para quando o campo ganha foco (quem digita controla a rolagem) e volta ao sair. Respeita
 * "reduzir movimento".
 */
export function useTitleMarquee(ref: RefObject<HTMLInputElement | null>, title: string): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let timer = 0;

    const stop = () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    const glide = (from: number, to: number, then: () => void) => {
      const start = performance.now();
      const duration = msFor(Math.abs(to - from));
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        el.scrollLeft = from + (to - from) * ease(p);
        if (p < 1) raf = requestAnimationFrame(tick);
        else timer = window.setTimeout(then, PAUSE_MS);
      };
      raf = requestAnimationFrame(tick);
    };
    const run = () => {
      stop();
      if (document.activeElement === el) return;
      el.scrollLeft = 0;
      const hidden = el.scrollWidth - el.clientWidth;
      if (hidden <= 2) return;
      timer = window.setTimeout(() => glide(0, hidden, () => glide(hidden, 0, run)), PAUSE_MS);
    };

    run();
    el.addEventListener("focus", stop);
    el.addEventListener("blur", run);
    const observer = new ResizeObserver(run);
    observer.observe(el);
    return () => {
      stop();
      observer.disconnect();
      el.removeEventListener("focus", stop);
      el.removeEventListener("blur", run);
    };
  }, [ref, title]);
}
