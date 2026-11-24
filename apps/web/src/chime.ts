let context: AudioContext | null = null;
let lastAt = 0;

function audioContext(): AudioContext | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    context ??= new Ctx();
    return context;
  } catch {
    return null;
  }
}

/**
 * Os navegadores só liberam áudio depois de um toque na página. Prepara o áudio no primeiro clique ou tecla,
 * para o aviso tocar depois mesmo com a aba em segundo plano (como o Telegram Web).
 */
export function armChime(): () => void {
  const unlock = () => void audioContext()?.resume();
  const events = ["pointerdown", "keydown"] as const;
  for (const name of events) window.addEventListener(name, unlock, { once: true, passive: true });
  return () => events.forEach((name) => window.removeEventListener(name, unlock));
}

/** Toque curto de três notas ("plililin") para avisar no computador com o app aberto. */
export function playChime(): void {
  // Push e atualização da contagem podem chegar juntos: toca uma vez só.
  const now = Date.now();
  if (now - lastAt < 4000) return;
  lastAt = now;
  const ctx = audioContext();
  if (!ctx) return;
  try {
    void ctx.resume();
    [880, 1175, 1568].forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } catch {
    // sem permissão de áudio ainda (o navegador só libera depois de um toque na página)
  }
}
