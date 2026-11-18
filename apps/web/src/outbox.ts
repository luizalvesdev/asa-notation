import { useEffect, useState } from "react";
import { capturesApi } from "./api";
import { createOutbox, type Pending } from "./capture-outbox";

const EVENT = "asa:outbox";

const outbox = createOutbox({
  storage: typeof localStorage === "undefined" ? { getItem: () => null, setItem: () => undefined } : localStorage,
  send: (item) => capturesApi.create({ id: item.id, text: item.text, createdAt: item.createdAt }),
  newId: () => crypto.randomUUID(),
  now: () => new Date(),
});

const changed = () => window.dispatchEvent(new Event(EVENT));

export async function submitCapture(text: string) {
  const result = await outbox.submit(text);
  changed();
  return result;
}

export async function flushOutbox(): Promise<number> {
  const sent = await outbox.flush();
  changed();
  return sent;
}

export function removePending(id: string): void {
  outbox.remove(id);
  changed();
}

/** Capturas que ainda não subiram. Atualiza quando a fila muda. */
export function usePending(): Pending[] {
  const [pending, setPending] = useState<Pending[]>(() => outbox.list());
  useEffect(() => {
    const update = () => setPending(outbox.list());
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return pending;
}
