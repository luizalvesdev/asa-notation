let context: AudioContext | null = null;
let lastAt = 0;

/** Toque curto de três notas ("plililin") para avisar no computador com o app aberto. */
export function playChime(): void {
  // Push e atualização da contagem podem chegar juntos: toca uma vez só.
  const now = Date.now();
  if (now - lastAt < 4000) return;
  lastAt = now;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  try {
    context ??= new Ctx();
    const ctx = context;
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
