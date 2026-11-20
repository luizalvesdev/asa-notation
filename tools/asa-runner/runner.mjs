#!/usr/bin/env node
// Agente de trabalho do asa-notation. Roda na máquina do usuário e:
//  - sincroniza os cards do Jira atribuídos a ele com a tela Trabalho do asa (só chave, título, status e link);
//  - pega os jobs pedidos pelo celular, roda o Claude Code numa worktree do repositório e abre um PR em rascunho;
//  - aplica os pedidos de mudança na mesma sessão do Claude Code;
//  - na aprovação, tira o PR de rascunho e move o card no Jira.
// O código, a descrição dos cards e o relatório do Claude ficam aqui, no Jira e no GitHub. O asa recebe só status e números.
// Sem dependências: Node 22+, git, gh (logado) e claude no PATH. Configuração em ~/.config/asa-runner/env (veja README.md).

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

// ---------- configuração ----------

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

const ENV_FILE = process.env.ASA_RUNNER_ENV ?? join(homedir(), ".config", "asa-runner", "env");
const env = { ...loadEnvFile(ENV_FILE), ...process.env };
const need = (name) => {
  const v = env[name]?.trim();
  if (!v) {
    console.error(`Falta ${name} em ${ENV_FILE}`);
    process.exit(1);
  }
  return v;
};

const cfg = {
  asaUrl: need("ASA_URL").replace(/\/+$/, ""),
  asaToken: need("ASA_TOKEN"),
  repoDir: need("REPO_DIR"),
  baseBranch: need("BASE_BRANCH"),
  jiraSite: need("JIRA_SITE").replace(/\/+$/, ""),
  jiraEmail: need("JIRA_EMAIL"),
  jiraToken: need("JIRA_TOKEN"),
  jql: env.JQL || "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
  startStatus: env.JIRA_START_STATUS || "Em andamento",
  doneStatus: env.JIRA_DONE_STATUS || "Aguardando teste do QA",
  claudeBin: env.CLAUDE_BIN || "claude",
  claudeModel: env.CLAUDE_MODEL || "",
  allowedTools:
    env.CLAUDE_ALLOWED_TOOLS ||
    "Read Edit Write Glob Grep TodoWrite Bash(git status:*) Bash(git diff:*) Bash(git log:*) Bash(git show:*) Bash(git add:*) Bash(git commit:*) Bash(npm test:*) Bash(npm run:*) Bash(npx:*) Bash(bun test:*) Bash(bun run:*) Bash(bunx:*) Bash(ls:*) Bash(cat:*)",
  branchTemplate: env.BRANCH_TEMPLATE || "asa/{key}",
  setupCmd: env.SETUP_CMD || "",
  useWorktree: env.WORKTREE !== "0",
  pollMs: Number(env.POLL_SECONDS || 10) * 1000,
  syncMs: Number(env.SYNC_SECONDS || 120) * 1000,
  dryRun: env.DRY_RUN === "1",
  stateDir: env.STATE_DIR || join(homedir(), ".local", "state", "asa-runner"),
};

mkdirSync(join(cfg.stateDir, "logs"), { recursive: true });
mkdirSync(join(cfg.stateDir, "reports"), { recursive: true });
const STATE_FILE = join(cfg.stateDir, "state.json");
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : { jobs: {} };
const saveState = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const firstLine = (err) => String(err?.message ?? err).split("\n")[0].slice(0, 200);

// ---------- asa ----------

async function asa(method, path, body) {
  const res = await fetch(`${cfg.asaUrl}/api${path}`, {
    method,
    headers: { authorization: `Bearer ${cfg.asaToken}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(`asa ${method} ${path}: ${res.status} ${JSON.stringify(data)}`), { status: res.status });
  return data;
}

const report = (jobId, status, extra = {}) => asa("POST", `/agent/jobs/${jobId}/report`, { status, ...extra });

// ---------- Jira ----------

async function jira(method, path, body) {
  const res = await fetch(`${cfg.jiraSite}${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${cfg.jiraEmail}:${cfg.jiraToken}`).toString("base64")}`,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Jira ${method} ${path}: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

/** Texto puro de um documento ADF (descrição e comentários do Jira). */
function adfText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = (node.content ?? []).map(adfText).join("");
  const block = ["paragraph", "heading", "listItem", "codeBlock", "blockquote", "tableRow"].includes(node.type);
  return node.type === "listItem" ? `- ${inner}\n` : block ? `${inner}\n` : inner;
}

async function myCards() {
  const data = await jira("POST", "/rest/api/3/search/jql", { jql: cfg.jql, fields: ["summary", "status"], maxResults: 50 });
  return (data.issues ?? []).map((i) => ({ ref: i.key, title: String(i.fields?.summary ?? "").slice(0, 300), status: String(i.fields?.status?.name ?? "").slice(0, 80), url: `${cfg.jiraSite}/browse/${i.key}` }));
}

async function cardDetails(ref) {
  const i = await jira("GET", `/rest/api/3/issue/${ref}?fields=summary,description,status,issuetype,comment`);
  const comments = (i.fields?.comment?.comments ?? []).slice(-5).map((c) => `${c.author?.displayName ?? "?"}: ${adfText(c.body).trim()}`);
  return { title: i.fields?.summary ?? "", status: i.fields?.status?.name ?? "", type: i.fields?.issuetype?.name ?? "", description: adfText(i.fields?.description).trim(), comments };
}

const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Move o card para o status `target`. Devolve uma frase curta para o histórico do job. */
async function moveCard(ref, target) {
  const issue = await jira("GET", `/rest/api/3/issue/${ref}?fields=status`);
  if (norm(issue.fields?.status?.name ?? "") === norm(target)) return `card já estava em ${target}`;
  const { transitions = [] } = await jira("GET", `/rest/api/3/issue/${ref}/transitions`);
  const t = transitions.find((x) => norm(x.to?.name ?? "") === norm(target) || norm(x.name ?? "") === norm(target));
  if (!t) return `não achei a transição para ${target} (opções: ${transitions.map((x) => x.to?.name).join(", ")})`;
  if (cfg.dryRun) return `[teste] moveria o card para ${target}`;
  await jira("POST", `/rest/api/3/issue/${ref}/transitions`, { transition: { id: t.id } });
  return `card movido para ${target}`;
}

// ---------- processos ----------

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 || opts.allowFail ? resolve({ code, out: out.trim(), err: err.trim() }) : reject(new Error(`${cmd} ${args.join(" ")}: ${err.trim() || out.trim()}`))));
  });
}

const git = (args, cwd, opts) => run("git", args, { cwd, ...opts });

// ---------- worktree ----------

async function prepareWorkspace(job) {
  const key = job.ref.toLowerCase();
  const branch = cfg.branchTemplate.replaceAll("{key}", key).replaceAll("{KEY}", job.ref);
  await git(["fetch", "-q", "origin", cfg.baseBranch], cfg.repoDir);
  if (!cfg.useWorktree) {
    const dirty = (await git(["status", "--porcelain"], cfg.repoDir)).out;
    if (dirty) throw new Error("o repositório tem alterações sem commit; o agente não mexe nele assim");
    const exists = (await git(["rev-parse", "--verify", "--quiet", branch], cfg.repoDir, { allowFail: true })).code === 0;
    await git(exists ? ["checkout", "-q", branch] : ["checkout", "-q", "-b", branch, `origin/${cfg.baseBranch}`], cfg.repoDir);
    return { dir: cfg.repoDir, branch };
  }
  const dir = join(dirname(cfg.repoDir), ".asa-worktrees", `${basename(cfg.repoDir)}-${key}`);
  if (!existsSync(dir)) {
    mkdirSync(dirname(dir), { recursive: true });
    const exists = (await git(["rev-parse", "--verify", "--quiet", branch], cfg.repoDir, { allowFail: true })).code === 0;
    await git(exists ? ["worktree", "add", "-q", dir, branch] : ["worktree", "add", "-q", "-b", branch, dir, `origin/${cfg.baseBranch}`], cfg.repoDir);
    if (cfg.setupCmd) await run("sh", ["-c", cfg.setupCmd], { cwd: dir });
  }
  return { dir, branch };
}

async function changes(dir) {
  const ahead = Number((await git(["rev-list", "--count", `origin/${cfg.baseBranch}..HEAD`], dir)).out || 0);
  const stat = (await git(["diff", "--shortstat", `origin/${cfg.baseBranch}...HEAD`], dir)).out;
  const files = /(\d+) files? changed/.exec(stat)?.[1] ?? "0";
  const plus = /(\d+) insertions?/.exec(stat)?.[1] ?? "0";
  const minus = /(\d+) deletions?/.exec(stat)?.[1] ?? "0";
  const dirty = (await git(["status", "--porcelain"], dir)).out !== "";
  const summary = `${ahead} commit${ahead === 1 ? "" : "s"} · ${files} arquivo${files === "1" ? "" : "s"} · +${plus} −${minus}${dirty ? " · há alterações sem commit" : ""}`;
  return { ahead, summary };
}

// ---------- Claude Code ----------

let current = null; // { jobId, child }

function startPrompt(job, card) {
  return [
    "Você é um agente de desenvolvimento rodando sozinho: ninguém vai responder perguntas durante esta execução.",
    `Card ${job.ref} (${card.type || "card"}): ${card.title}`,
    card.description ? `Descrição do card:\n${card.description}` : "O card não tem descrição.",
    card.comments.length ? `Últimos comentários:\n${card.comments.join("\n")}` : "",
    job.instruction ? `Instruções do dono do card para esta execução:\n${job.instruction}` : "",
    "",
    "O que fazer:",
    "1. Entenda o card e o código. Leia o CLAUDE.md do repositório, se existir, e siga as convenções do projeto.",
    `2. Implemente na branch atual (já criada a partir de origin/${cfg.baseBranch}). Não troque de branch, não faça push e não abra PR: isso é feito depois.`,
    "3. Rode os testes e o lint que cobrem o que você mudou.",
    `4. Faça commits pequenos com mensagem começando por "${job.ref}: ".`,
    "5. Se faltar informação para decidir, escolha o caminho mais seguro e anote a dúvida no relatório. Não invente regra de negócio.",
    "",
    "No final, responda apenas com o relatório em Markdown que vai na descrição do PR, com as seções: ## O que mudou, ## Como testar, ## Dúvidas e pendências.",
  ]
    .filter(Boolean)
    .join("\n");
}

const feedbackPrompt = (job, text) =>
  [
    `Pedido de mudança na revisão do ${job.ref}:`,
    text,
    "",
    `Ajuste, rode os testes, faça commit (mensagem começando por "${job.ref}: ") e responda apenas com o relatório atualizado, no mesmo formato de antes.`,
  ].join("\n");

/** Roda o Claude Code e conta o andamento ao asa (só o número de ações). Devolve o relatório final. */
function runClaude(job, cwd, prompt, resumeSession) {
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--allowedTools", ...cfg.allowedTools.split(/\s+(?![^(]*\))/).filter(Boolean)];
  if (cfg.claudeModel) args.push("--model", cfg.claudeModel);
  if (resumeSession) args.push("--resume", resumeSession);
  const logFile = join(cfg.stateDir, "logs", `${job.ref}-${Date.now()}.jsonl`);

  return new Promise((resolve, reject) => {
    const child = spawn(cfg.claudeBin, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    current = { jobId: job.id, child, canceled: false };
    let buffer = "";
    let actions = 0;
    let lastSent = 0;
    let sessionId = resumeSession ?? null;
    let result = null;
    let stderr = "";

    const progress = setInterval(() => {
      if (actions !== lastSent) {
        lastSent = actions;
        report(job.id, "running", { text: `${actions} ações até agora` }).catch(() => undefined);
      }
      // Cancelado pelo celular: para o Claude agora.
      asa("GET", `/agent/jobs/${job.id}`)
        .then((d) => {
          if (d.job.cancelRequested || d.job.status === "canceled") {
            current.canceled = true;
            child.kill("SIGTERM");
          }
        })
        .catch(() => undefined);
    }, 30_000);

    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        appendFileSync(logFile, `${line}\n`);
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.session_id) sessionId = msg.session_id;
        if (msg.type === "assistant") actions += (msg.message?.content ?? []).filter((b) => b.type === "tool_use").length;
        if (msg.type === "result") result = msg;
      }
    });
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearInterval(progress);
      reject(err);
    });
    child.on("close", (code) => {
      clearInterval(progress);
      const canceled = current?.canceled ?? false;
      current = null;
      if (canceled) return resolve({ canceled: true, sessionId });
      if (code !== 0 || !result || result.is_error) return reject(new Error(`o Claude Code terminou com erro (log: ${logFile})${stderr ? `: ${stderr.split("\n")[0].slice(0, 120)}` : ""}`));
      resolve({ canceled: false, sessionId, report: String(result.result ?? "").trim(), actions });
    });
  });
}

// ---------- GitHub ----------

async function openOrUpdatePr(job, ws, reportFile) {
  if (cfg.dryRun) return null;
  await git(["push", "-q", "-u", "origin", ws.branch], ws.dir);
  const existing = await run("gh", ["pr", "view", ws.branch, "--json", "url", "-q", ".url"], { cwd: ws.dir, allowFail: true });
  if (existing.code === 0 && existing.out.startsWith("https://")) {
    await run("gh", ["pr", "edit", existing.out, "--body-file", reportFile], { cwd: ws.dir });
    return existing.out;
  }
  const created = await run("gh", ["pr", "create", "--draft", "--base", cfg.baseBranch, "--head", ws.branch, "--title", `${job.ref}: ${job.title}`.slice(0, 250), "--body-file", reportFile], { cwd: ws.dir });
  return created.out.split("\n").find((l) => l.startsWith("https://")) ?? null;
}

// ---------- ações ----------

async function afterClaude(job, ws, outcome) {
  if (outcome.canceled) return log(job.ref, "cancelado");
  state.jobs[job.id] = { ...state.jobs[job.id], sessionId: outcome.sessionId };
  saveState();
  const reportFile = join(cfg.stateDir, "reports", `${job.ref}.md`);
  writeFileSync(reportFile, `${outcome.report}\n\n---\n_Feito pelo agente do asa a partir do ${job.ref}._\n`);
  const { ahead, summary } = await changes(ws.dir);
  if (ahead === 0) {
    await report(job.id, "review", { summary: `Nenhum commit. O relatório ficou em ${reportFile}`, text: "O agente terminou sem alterar o código. Peça uma mudança para ele continuar." });
    return;
  }
  const prUrl = await openOrUpdatePr(job, ws, reportFile);
  await report(job.id, "review", { summary, ...(prUrl ? { prUrl } : {}), text: prUrl ? "PR em rascunho atualizado com o relatório." : "[teste] sem push nem PR." });
}

async function start(job) {
  log(job.ref, "começando");
  const card = await cardDetails(job.ref);
  job = { ...job, title: job.title || card.title };
  const moved = await moveCard(job.ref, cfg.startStatus).catch((e) => `não consegui mover o card: ${firstLine(e)}`);
  await report(job.id, "running", { text: moved });
  const ws = await prepareWorkspace(job);
  state.jobs[job.id] = { ref: job.ref, title: job.title, dir: ws.dir, branch: ws.branch };
  saveState();
  await afterClaude(job, ws, await runClaude(job, ws.dir, startPrompt(job, card), null));
}

async function feedback(job, text) {
  log(job.ref, "pedido de mudança");
  const saved = state.jobs[job.id];
  job = { ...job, title: job.title || saved?.title || "" };
  const ws = saved?.dir && existsSync(saved.dir) ? { dir: saved.dir, branch: saved.branch } : await prepareWorkspace(job);
  // Sem a sessão (outra máquina, estado apagado), começa uma nova com o card e o pedido.
  const prompt = saved?.sessionId ? feedbackPrompt(job, text) : `${startPrompt(job, await cardDetails(job.ref))}\n\n${feedbackPrompt(job, text)}`;
  await afterClaude(job, ws, await runClaude(job, ws.dir, prompt, saved?.sessionId ?? null));
}

async function approve(job) {
  log(job.ref, "aprovado");
  const notes = [];
  if (job.prUrl && !cfg.dryRun) {
    await run("gh", ["pr", "ready", job.prUrl], { cwd: cfg.repoDir });
    notes.push("PR pronto para revisão");
  }
  notes.push(await moveCard(job.ref, cfg.doneStatus).catch((e) => `não consegui mover o card: ${firstLine(e)}`));
  const saved = state.jobs[job.id];
  if (cfg.useWorktree && saved?.dir && existsSync(saved.dir)) await git(["worktree", "remove", saved.dir], cfg.repoDir, { allowFail: true });
  delete state.jobs[job.id];
  saveState();
  await report(job.id, "done", { text: notes.join(" · "), summary: notes.join(" · ") });
}

async function handle(next) {
  const { action, job } = next;
  try {
    if (action === "start") await start(job);
    else if (action === "feedback") await feedback(job, next.feedback);
    else if (action === "approve") await approve(job);
    else if (action === "cancel") log(job.ref, "cancelado pelo celular");
  } catch (err) {
    log(job.ref, "erro:", err.message);
    await report(job.id, "failed", { text: firstLine(err), summary: "Parou com erro" }).catch(() => undefined);
  }
}

// ---------- laço ----------

let lastSync = 0;
async function syncCards() {
  try {
    const cards = await myCards();
    await asa("PUT", "/agent/cards", { cards });
    log(`cards sincronizados: ${cards.length}`);
  } catch (err) {
    log("falha ao sincronizar cards:", firstLine(err));
  }
}

async function main() {
  log(`asa-runner ${cfg.dryRun ? "(modo teste) " : ""}· ${cfg.asaUrl} · repo ${cfg.repoDir} (${cfg.baseBranch})`);
  const stop = () => {
    current?.child.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  for (;;) {
    if (Date.now() - lastSync > cfg.syncMs) {
      lastSync = Date.now();
      await syncCards();
    }
    let next = null;
    try {
      next = (await asa("POST", "/agent/poll")).next;
    } catch (err) {
      log("asa indisponível:", firstLine(err));
    }
    if (next) await handle(next);
    else await sleep(cfg.pollMs);
  }
}

if (process.argv[2] === "--once-sync") await syncCards();
else await main();
