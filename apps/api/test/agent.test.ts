import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.js";

let app: TestApp;
let cookies: Record<string, string>;
let bearer: Record<string, string>;

beforeEach(async () => {
  app = await createTestApp();
  cookies = await app.owner();
  const res = await app.call("POST", "/tokens", { cookies, body: { name: "runner", scope: "write" } });
  bearer = { authorization: `Bearer ${(res.body as { secret: string }).secret}` };
});

interface Job {
  id: string;
  ref: string;
  title: string;
  status: string;
  prUrl: string | null;
  summary: string;
  cancelRequested: boolean;
}

const runner = (method: string, path: string, body?: unknown) => app.call(method, path, { headers: bearer, body, origin: null });

async function create(body: Record<string, unknown>): Promise<Job> {
  const res = await app.call("POST", "/agent/jobs", { cookies, body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { job: Job }).job;
}

async function poll() {
  const res = await runner("POST", "/agent/poll");
  expect(res.status).toBe(200);
  return (res.body as { next: { action: string; job: Job; feedback?: string } | null }).next;
}

describe("agent", () => {
  it("syncs cards from the runner and uses them to fill a new job", async () => {
    const put = await runner("PUT", "/agent/cards", { cards: [{ ref: "ibr-10", title: "Frete grátis", status: "Pendente", url: "https://x.atlassian.net/browse/IBR-10" }] });
    expect(put.status).toBe(200);
    const job = await create({ ref: "IBR-10", instruction: "faz o card" });
    expect(job).toMatchObject({ ref: "IBR-10", title: "Frete grátis", status: "queued" });
    const res = await app.call("GET", "/agent", { cookies });
    const body = res.body as { runnerSeenAt: string | null; cards: unknown[]; jobs: Job[] };
    expect(body.runnerSeenAt).not.toBeNull();
    expect(body.cards).toHaveLength(1);
    expect(body.jobs.map((j) => j.id)).toEqual([job.id]);
  });

  it("rejects bad refs, non-web links and a second active job for the same card", async () => {
    expect((await app.call("POST", "/agent/jobs", { cookies, body: { ref: "nada" } })).status).toBe(400);
    expect((await app.call("POST", "/agent/jobs", { cookies, body: { ref: "IBR-1", url: "javascript:alert(1)" } })).status).toBe(400);
    await create({ ref: "IBR-1" });
    expect((await app.call("POST", "/agent/jobs", { cookies, body: { ref: "IBR-1" } })).status).toBe(409);
  });

  it("runs the whole loop: start, review, feedback, review again, approve, done", async () => {
    const job = await create({ ref: "IBR-2", title: "Cupom", instruction: "" });
    const start = await poll();
    expect(start).toMatchObject({ action: "start", job: { id: job.id, status: "running" } });
    expect(await poll()).toBeNull();

    expect((await runner("POST", `/agent/jobs/${job.id}/report`, { status: "running", text: "12 ações" })).status).toBe(200);
    const review = await runner("POST", `/agent/jobs/${job.id}/report`, { status: "review", summary: "3 arquivos, +40 −2", prUrl: "https://github.com/o/r/pull/1" });
    expect((review.body as { job: Job }).job).toMatchObject({ status: "review", prUrl: "https://github.com/o/r/pull/1", summary: "3 arquivos, +40 −2" });

    expect((await app.call("POST", `/agent/jobs/${job.id}/feedback`, { cookies, body: { text: "faltou o teste" } })).status).toBe(200);
    expect(await poll()).toMatchObject({ action: "feedback", feedback: "faltou o teste", job: { status: "running" } });
    await runner("POST", `/agent/jobs/${job.id}/report`, { status: "review", summary: "4 arquivos" });

    expect((await app.call("POST", `/agent/jobs/${job.id}/approve`, { cookies })).status).toBe(200);
    expect((await app.call("POST", `/agent/jobs/${job.id}/approve`, { cookies })).status).toBe(409);
    expect(await poll()).toMatchObject({ action: "approve", job: { status: "running" } });
    const done = await runner("POST", `/agent/jobs/${job.id}/report`, { status: "done" });
    expect((done.body as { job: Job }).job.status).toBe("done");

    const detail = await app.call("GET", `/agent/jobs/${job.id}`, { cookies });
    const kinds = (detail.body as { events: { kind: string }[] }).events.map((e) => e.kind);
    expect(kinds).toEqual(["created", "started", "progress", "review", "feedback", "review", "approved", "done"]);
    // Terminado, o card pode ganhar um job novo.
    await create({ ref: "IBR-2" });
  });

  it("cancels a queued job at once and a running one through the runner", async () => {
    const queued = await create({ ref: "IBR-3" });
    const res = await app.call("POST", `/agent/jobs/${queued.id}/cancel`, { cookies });
    expect((res.body as { job: Job }).job.status).toBe("canceled");
    expect(await poll()).toBeNull();

    const running = await create({ ref: "IBR-4" });
    await poll();
    const asked = await app.call("POST", `/agent/jobs/${running.id}/cancel`, { cookies });
    expect((asked.body as { job: Job }).job).toMatchObject({ status: "running", cancelRequested: true });
    expect(await poll()).toMatchObject({ action: "cancel", job: { id: running.id, status: "canceled" } });
    expect((await runner("POST", `/agent/jobs/${running.id}/report`, { status: "review" })).status).toBe(409);
  });

  it("keeps the repos the runner offers, the repos and base of a job, and one PR per repo", async () => {
    const repos = [{ name: "ibr-v2", base: "homolog" }, { name: "nx", base: "homo" }];
    expect((await runner("PUT", "/agent/cards", { cards: [], repos })).status).toBe(200);
    expect(((await app.call("GET", "/agent", { cookies })).body as { repos: unknown }).repos).toEqual(repos);
    expect((await runner("PUT", "/agent/cards", { cards: [], repos: [{ name: "x", base: "--upload-pack=evil" }] })).status).toBe(400);

    expect((await app.call("POST", "/agent/jobs", { cookies, body: { ref: "IBR-7", repos: ["../etc"] } })).status).toBe(400);
    expect((await app.call("POST", "/agent/jobs", { cookies, body: { ref: "IBR-7", base: "-x" } })).status).toBe(400);
    expect((await app.call("POST", "/agent/jobs", { cookies, body: { ref: "IBR-7", base: "a..b" } })).status).toBe(400);
    const job = await create({ ref: "IBR-7", repos: ["nx", "dotnet", "nx"], base: "feature/IBR-6193/dre-tela-propria" });
    expect(job).toMatchObject({ repos: ["nx", "dotnet"], base: "feature/IBR-6193/dre-tela-propria", prs: [] });

    expect(await poll()).toMatchObject({ action: "start", job: { repos: ["nx", "dotnet"] } });
    const prs = [{ repo: "nx", url: "https://github.com/o/nx/pull/1" }, { repo: "dotnet", url: "https://github.com/o/dotnet/pull/2" }];
    const res = await runner("POST", `/agent/jobs/${job.id}/report`, { status: "review", prs });
    expect((res.body as { job: Job }).job).toMatchObject({ prs, prUrl: "https://github.com/o/nx/pull/1" });
  });

  it("only accepts reports for running jobs and needs a login", async () => {
    const job = await create({ ref: "IBR-5" });
    expect((await runner("POST", `/agent/jobs/${job.id}/report`, { status: "review" })).status).toBe(409);
    expect((await app.call("GET", "/agent")).status).toBe(401);
  });
});
