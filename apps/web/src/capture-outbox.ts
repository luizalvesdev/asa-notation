import type { Capture } from "./captures-types";

/** Captura que ainda não chegou ao servidor (sem rede). O `id` é gerado aqui, então reenviar não duplica. */
export interface Pending {
  id: string;
  text: string;
  createdAt: string;
}

export type SendResult = Capture;

export class NetworkError extends Error {}

export interface OutboxDeps {
  storage: Pick<Storage, "getItem" | "setItem">;
  /** Envia ao servidor. Deve lançar `NetworkError` quando faltar rede e outro erro quando o servidor recusar. */
  send: (item: Pending) => Promise<SendResult>;
  newId: () => string;
  now: () => Date;
  key?: string;
}

export type SubmitResult = { kind: "sent"; id: string } | { kind: "queued"; id: string };

export interface Outbox {
  list(): Pending[];
  /** Tenta enviar; se faltar rede, guarda na fila. */
  submit(text: string): Promise<SubmitResult>;
  /** Envia a fila em ordem. Para no primeiro erro de rede. Devolve quantas subiram. */
  flush(): Promise<number>;
  remove(id: string): void;
}

export function createOutbox({ storage, send, newId, now, key = "asa.capture-outbox" }: OutboxDeps): Outbox {
  const read = (): Pending[] => {
    try {
      const raw = storage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((p): p is Pending => typeof p?.id === "string" && typeof p?.text === "string" && typeof p?.createdAt === "string")
        : [];
    } catch {
      return [];
    }
  };
  const write = (items: Pending[]) => {
    try {
      storage.setItem(key, JSON.stringify(items));
    } catch {
      // Sem armazenamento (modo privado cheio): a fila vale só enquanto a página estiver aberta.
    }
  };
  let memory: Pending[] | null = null;
  const current = () => (memory ??= read());
  const save = (items: Pending[]) => {
    memory = items;
    write(items);
  };

  return {
    list: () => [...current()],
    remove: (id) => save(current().filter((p) => p.id !== id)),
    async submit(text) {
      const item: Pending = { id: newId(), text, createdAt: now().toISOString() };
      try {
        await send(item);
        return { kind: "sent", id: item.id };
      } catch (err) {
        if (!(err instanceof NetworkError)) throw err;
        save([...current(), item]);
        return { kind: "queued", id: item.id };
      }
    },
    async flush() {
      let sent = 0;
      for (const item of current()) {
        try {
          await send(item);
        } catch (err) {
          if (err instanceof NetworkError) break;
          // O servidor recusou (texto inválido): reenviar não adianta, descarta.
        }
        save(current().filter((p) => p.id !== item.id));
        sent += 1;
      }
      return sent;
    },
  };
}
