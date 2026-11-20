import { broadcast, type PushDeps } from "../push/job.js";
import { UUID_SOURCE, badRequest, isRecord, json, notFound, type Route } from "../routing.js";
import type { AgentCard, AgentJob, AgentPr, AgentRepo, PgAgentStore } from "./store.js";

/**
 * Agente de trabalho. O celular cria jobs a partir dos cards do Jira e revisa; o script na máquina do usuário
 * (tools/asa-runner) busca o que fazer em POST /agent/poll e conta o andamento em POST /agent/jobs/:id/report.
 * Os dois lados usam as mesmas rotas: sessão no app, token de escrita no script.
 */

const ID = `(${UUID_SOURCE})`;
const REF = /^[A-Z][A-Z0-9]{0,15}-\d{1,8}$/;
const MAX_CARDS = 100;
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
/** Nome de branch do git, sem os casos que o git recusa ou que viram opção de linha de comando. */
const BRANCH = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,200}(?<![./])$/;

/** Lista de nomes de repo: undefined quando inválida. */
function repoList(v: unknown): string[] | undefined {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 5) return undefined;
  const names = v.map((x) => (typeof x === "string" ? x.trim() : ""));
  if (names.some((n) => !REPO.test(n))) return undefined;
  return [...new Set(names)];
}

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim().length <= max ? v.trim() : null);
const webUrl = (v: unknown): string | null | undefined => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || v.length > 500) return undefined;
  try {
    const protocol = new URL(v).protocol;
    return protocol === "https:" || protocol === "http:" ? v : undefined;
  } catch {
    return undefined;
  }
};

/** Aviso no celular quando o job precisa de você ou terminou. */
const PUSH: Partial<Record<string, (job: AgentJob) => string>> = {
  review: (j) => `${j.ref} pronto para revisar`,
  done: (j) => `${j.ref} finalizado`,
  failed: (j) => `${j.ref} parou com erro`,
};

export function agentRoutes(store: PgAgentStore, push: PushDeps): Route[] {
  async function notify(job: AgentJob, text: string) {
    const title = PUSH[job.status]?.(job);
    if (!title) return;
    try {
      await broadcast(push, [{ title, body: text || job.title, link: "#/agente", tag: `agent-${job.id}` }]);
    } catch (err) {
      console.error("agent push failed", err);
    }
  }

  const detail = async (job: AgentJob) => json(200, { job, events: await store.events(job.id) });

  return [
    {
      method: "GET",
      pattern: /^\/agent$/,
      access: "session",
      handle: async () => json(200, { runnerSeenAt: await store.seenAt(), repos: await store.repos(), cards: await store.cards(), jobs: await store.jobs() }),
    },
    {
      method: "GET",
      pattern: new RegExp(`^/agent/jobs/${ID}$`),
      access: "session",
      handle: async ({ match }) => {
        const job = await store.get(match[1]!);
        return job ? detail(job) : notFound();
      },
    },
    {
      method: "GET",
      pattern: /^\/agent\/cards\/([A-Za-z][A-Za-z0-9]{0,15}-\d{1,8})$/,
      access: "session",
      handle: async ({ match }) => {
        const ref = match[1]!.toUpperCase();
        const jobs = await store.jobsFor(ref);
        const thread = [];
        for (const job of jobs) thread.push({ job, events: await store.events(job.id) });
        return json(200, { card: await store.card(ref), repos: await store.repos(), runnerSeenAt: await store.seenAt(), thread });
      },
    },
    {
      method: "POST",
      pattern: /^\/agent\/jobs$/,
      access: "session",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        const ref = typeof body.ref === "string" ? body.ref.trim().toUpperCase() : "";
        if (!REF.test(ref)) return badRequest("invalid_ref");
        const instruction = str(body.instruction ?? "", 4000);
        if (instruction === null) return badRequest("invalid_instruction");
        const card = await store.card(ref);
        const title = str(body.title ?? card?.title ?? "", 300);
        if (title === null) return badRequest("invalid_title");
        const url = webUrl(body.url ?? card?.url);
        if (url === undefined) return badRequest("invalid_url");
        const repos = repoList(body.repos);
        if (repos === undefined) return badRequest("invalid_repos");
        const base = typeof body.base === "string" && body.base.trim() ? body.base.trim() : null;
        if (base !== null && !BRANCH.test(base)) return badRequest("invalid_base");
        const active = (await store.jobs(200)).find((j) => j.ref === ref && j.status !== "done" && j.status !== "failed" && j.status !== "canceled");
        if (active) return json(409, { error: "job_active", job: active });
        return json(201, { job: await store.create({ ref, title, url, instruction, repos, base }) });
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/agent/jobs/${ID}/approve$`),
      access: "session",
      handle: async ({ match }) => {
        const job = await store.transition(match[1]!, ["review"], "approved");
        if (!job) return json(409, { error: "not_in_review" });
        await store.addEvent(job.id, "approved");
        return detail(job);
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/agent/jobs/${ID}/feedback$`),
      access: "session",
      handle: async ({ req, match }) => {
        const text = isRecord(req.body) ? str(req.body.text, 4000) : null;
        if (!text) return badRequest("invalid_text");
        // Com o agente trabalhando, a mensagem pede a parada; ele lê assim que parar, na mesma sessão.
        const job = (await store.transition(match[1]!, ["review", "failed"], "changes", { feedback: text })) ?? (await store.requestInterrupt(match[1]!, text));
        if (!job) return json(409, { error: "not_in_review" });
        await store.addEvent(job.id, "feedback", text);
        return detail(job);
      },
    },
    {
      // Parar sem encerrar: o agente interrompe o Claude Code e espera a sua resposta.
      method: "POST",
      pattern: new RegExp(`^/agent/jobs/${ID}/interrupt$`),
      access: "session",
      handle: async ({ match }) => {
        const job = await store.requestInterrupt(match[1]!);
        return job ? detail(job) : json(409, { error: "not_running" });
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/agent/jobs/${ID}/cancel$`),
      access: "session",
      handle: async ({ match }) => {
        const id = match[1]!;
        // Sem o agente trabalhando (na fila, para revisar, com erro): cancela na hora. Trabalhando: ele para na próxima consulta.
        const queued = await store.transition(id, ["queued", "review", "failed"], "canceled", { feedback: null });
        if (queued) {
          await store.addEvent(id, "canceled");
          return detail(queued);
        }
        const job = await store.requestCancel(id);
        return job ? detail(job) : json(409, { error: "not_active" });
      },
    },

    // Lado do agente.
    {
      method: "PUT",
      pattern: /^\/agent\/cards$/,
      access: "session",
      handle: async ({ req }) => {
        const list = isRecord(req.body) ? req.body.cards : undefined;
        if (!Array.isArray(list) || list.length > MAX_CARDS) return badRequest("invalid_cards");
        const cards: AgentCard[] = [];
        for (const raw of list) {
          if (!isRecord(raw)) return badRequest("invalid_cards");
          const ref = typeof raw.ref === "string" ? raw.ref.trim().toUpperCase() : "";
          const title = str(raw.title ?? "", 300);
          const status = str(raw.status ?? "", 80);
          const url = webUrl(raw.url);
          if (!REF.test(ref) || title === null || status === null || url === undefined) return badRequest("invalid_cards");
          cards.push({ ref, title, status, url });
        }
        let repos: AgentRepo[] | null = null;
        if (isRecord(req.body) && req.body.repos !== undefined) {
          const raw = req.body.repos;
          if (!Array.isArray(raw) || raw.length > 10) return badRequest("invalid_repos");
          repos = [];
          for (const r of raw) {
            if (!isRecord(r) || typeof r.name !== "string" || !REPO.test(r.name) || typeof r.base !== "string" || !BRANCH.test(r.base)) return badRequest("invalid_repos");
            repos.push({ name: r.name, base: r.base });
          }
        }
        await store.replaceCards(cards);
        if (repos) await store.setRepos(repos);
        else await store.seen();
        return json(200, { cards: cards.length });
      },
    },
    {
      method: "POST",
      pattern: /^\/agent\/poll$/,
      access: "session",
      handle: async () => {
        await store.seen();
        return json(200, { next: await store.next() });
      },
    },
    {
      // O que o Claude Code escreve enquanto trabalha: vira mensagem no chat do card.
      method: "POST",
      pattern: new RegExp(`^/agent/jobs/${ID}/reply$`),
      access: "session",
      handle: async ({ req, match }) => {
        const text = isRecord(req.body) ? str(req.body.text, 20000) : null;
        if (!text) return badRequest("invalid_text");
        const job = await store.get(match[1]!);
        if (!job) return notFound();
        if (job.status !== "running") return json(409, { error: "not_running" });
        await store.addEvent(job.id, "reply", text);
        return json(200, { ok: true });
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/agent/jobs/${ID}/report$`),
      access: "session",
      handle: async ({ req, match }) => {
        const body = isRecord(req.body) ? req.body : {};
        const status = body.status;
        if (status !== "running" && status !== "review" && status !== "done" && status !== "failed") return badRequest("invalid_status");
        const text = str(body.text ?? "", 4000);
        const summary = body.summary === undefined ? undefined : str(body.summary, 1000);
        const prUrl = body.prUrl === undefined ? undefined : webUrl(body.prUrl);
        if (text === null || summary === null || prUrl === undefined && body.prUrl !== undefined) return badRequest("invalid_report");
        let prs: AgentPr[] | undefined;
        if (body.prs !== undefined) {
          if (!Array.isArray(body.prs) || body.prs.length > 5) return badRequest("invalid_report");
          prs = [];
          for (const p of body.prs) {
            const u = isRecord(p) ? webUrl(p.url) : undefined;
            if (!isRecord(p) || typeof p.repo !== "string" || !REPO.test(p.repo) || !u) return badRequest("invalid_report");
            prs.push({ repo: p.repo, url: u });
          }
        }
        await store.seen();
        const before = await store.get(match[1]!);
        const stopped = status !== "running";
        const job = await store.transition(match[1]!, ["running"], status, {
          ...(summary !== undefined ? { summary } : {}),
          ...(prUrl !== undefined ? { prUrl } : prs?.[0] ? { prUrl: prs[0].url } : {}),
          ...(prs !== undefined ? { prs } : {}),
          ...(stopped ? { interruptRequested: false } : {}),
        });
        if (!job) return json(409, { error: "not_running" });
        await store.addEvent(job.id, status === "running" ? "progress" : status, text);
        // Parou com mensagem sua na fila: volta direto para o agente ler, sem aviso no celular.
        if ((status === "review" || status === "failed") && job.pendingMessage) {
          const queued = await store.transition(job.id, [status], "changes");
          return detail(queued ?? job);
        }
        // Parada que você mesmo pediu também não precisa de aviso.
        if (!before?.interruptRequested) await notify(job, summary ?? text);
        return detail(job);
      },
    },
  ];
}
