import type { PagePatch } from "./pages-types";

export type SaveState = "salvo" | "pendente" | "salvando" | "erro";

export interface Autosaver {
  /** Junta a alteração às pendentes e agenda o envio. */
  queue(patch: PagePatch): void;
  /** Envia já o que estiver pendente. Resolve quando não houver mais nada em voo. */
  flush(): Promise<void>;
  /** Descarta o que está pendente e cancela o agendamento. */
  discard(): void;
}

interface Options {
  delayMs: number;
  /** Envia o patch. Se lançar, o patch volta para a fila e o estado vira "erro". */
  send: (patch: PagePatch) => Promise<void>;
  onState: (state: SaveState) => void;
}

export function createAutosaver({ delayMs, send, onState }: Options): Autosaver {
  let pending: PagePatch | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;

  const merge = (a: PagePatch | null, b: PagePatch): PagePatch => ({ ...a, ...b });

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  async function run(): Promise<void> {
    while (pending) {
      const patch = pending;
      pending = null;
      onState("salvando");
      try {
        await send(patch);
      } catch (err) {
        // Mantém o que o usuário digitou depois do envio que falhou por cima do que falhou.
        pending = merge(patch, pending ?? {});
        onState("erro");
        throw err;
      }
    }
    onState("salvo");
  }

  function start(): Promise<void> {
    clearTimer();
    if (!running) {
      running = run().finally(() => {
        running = null;
      });
    }
    return running;
  }

  return {
    queue(patch) {
      pending = merge(pending, patch);
      onState("pendente");
      clearTimer();
      timer = setTimeout(() => {
        start().catch(() => undefined);
      }, delayMs);
    },
    async flush() {
      if (running) await running.catch(() => undefined);
      if (pending) await start();
    },
    discard() {
      clearTimer();
      pending = null;
    },
  };
}
