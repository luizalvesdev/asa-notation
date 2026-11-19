import { isQuiet } from "../notifications/checkins.js";
import { generateCheckins, type CheckinDeps } from "../notifications/routes.js";
import type { PgPushStore } from "./store.js";
import { sendPush, type PushFetch } from "./webpush.js";

export interface PushDeps {
  push: PgPushStore;
  fetchImpl: PushFetch;
  /** Contato do servidor no VAPID: a URL do app (https) ou um mailto. */
  subject: string;
  now: () => number;
}

export interface PushMessage {
  title: string;
  body: string;
  link: string | null;
  /** Mesma tag substitui o aviso anterior no aparelho, em vez de empilhar. */
  tag: string;
}

export interface SendResult {
  sent: number;
  removed: number;
  failed: number;
}

/** Manda as mensagens para todos os navegadores inscritos. Inscrições que o serviço deu como mortas (404/410) saem da lista. */
export async function broadcast({ push, fetchImpl, subject, now }: PushDeps, messages: PushMessage[]): Promise<SendResult> {
  const result: SendResult = { sent: 0, removed: 0, failed: 0 };
  if (messages.length === 0) return result;
  const [subs, keys] = await Promise.all([push.list(), push.vapid()]);
  for (const sub of subs) {
    let alive = true;
    for (const message of messages) {
      if (!alive) break;
      let status: number;
      try {
        status = await sendPush(fetchImpl, sub, message, keys, subject, now());
      } catch (err) {
        console.error("push failed", err);
        result.failed++;
        continue;
      }
      if (status === 404 || status === 410) {
        await push.removeById(sub.id);
        result.removed++;
        alive = false;
      } else if (status >= 200 && status < 300) {
        result.sent++;
        await push.markOk(sub.id);
      } else {
        console.error(`push rejected with ${status}`);
        result.failed++;
      }
    }
  }
  return result;
}

const WINDOW_HOURS = 12;

/**
 * Rodado pelo agendador (`PushSchedule` no template): gera os check-ins que venceram e manda por push
 * os avisos ainda não lidos nem enviados. Sem navegador inscrito ou no horário de silêncio, não marca nada:
 * ficam para a próxima execução (dentro da janela de 12 h).
 */
export async function runPushJob(deps: PushDeps & { checkins: CheckinDeps }): Promise<SendResult & { pending: number; quiet?: true }> {
  await generateCheckins(deps.checkins);
  const none = { sent: 0, removed: 0, failed: 0, pending: 0 };
  if (isQuiet(deps.now(), await deps.checkins.settings.get())) return { ...none, quiet: true };
  if ((await deps.push.list()).length === 0) return none;
  const pending = await deps.push.pending(WINDOW_HOURS);
  const result = await broadcast(deps, pending.map((n) => ({ title: n.title, body: n.body, link: n.link, tag: n.id })));
  await deps.push.markPushed(pending.map((n) => n.id));
  return { ...result, pending: pending.length };
}
