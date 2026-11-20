#!/usr/bin/env node
// Agente de trabalho do asa-notation. Roda na máquina do usuário e:
//  - sincroniza os cards do Jira atribuídos a ele com a tela Trabalho do asa (só chave, título, status e link);
//  - pega os jobs pedidos pelo celular, roda o Claude Code em worktrees dos repositórios escolhidos e abre um PR em rascunho por repo;
//  - aplica os pedidos de mudança na mesma sessão do Claude Code;
//  - na aprovação, tira o PR de rascunho e move o card no Jira.
// O código, a descrição dos cards e o relatório do Claude ficam aqui, no Jira e no GitHub. O asa recebe só status e números.
// Sem dependências: Node 22+, git, gh (logado) e claude no PATH. Configuração em ~/.config/asa-runner/env (veja README.md).

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

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
  jiraSite: need("JIRA_SITE").replace(/\/+$/, ""),
  // Sem token, o Jira é acessado pelo MCP da Atlassian do Claude Code (OAuth), configurado no REPO_DIR.
  jiraToken: env.JIRA_TOKEN || "",
  jiraEmail: env.JIRA_TOKEN ? need("JIRA_EMAIL") : env.JIRA_EMAIL || "",
  jiraCloudId: env.JIRA_CLOUD_ID || "",
  jiraMcpModel: env.JIRA_MCP_MODEL || "haiku",
  // Passado a toda chamada do Claude Code: assim o MCP da Atlassian funciona em qualquer pasta (worktrees novas inclusive).
  jiraMcpUrl: env.JIRA_MCP_URL || "https://mcp.atlassian.com/v2/mcp",
  jql: env.JQL || "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
  startStatus: env.JIRA_START_STATUS || "Em andamento",
  doneStatus: env.JIRA_DONE_STATUS || "Aguardando teste do QA",
  claudeBin: env.CLAUDE_BIN || "claude",
  claudeModel: env.CLAUDE_MODEL || "",
  allowedTools:
    env.CLAUDE_ALLOWED_TOOLS ||
    "Read Edit Write Glob Grep TodoWrite Bash(cd:*) Bash(git status:*) Bash(git diff:*) Bash(git log:*) Bash(git show:*) Bash(git add:*) Bash(git commit:*) Bash(npm test:*) Bash(npm run:*) Bash(npx:*) Bash(nx:*) Bash(bun test:*) Bash(bun run:*) Bash(bun install:*) Bash(bunx:*) Bash(npm ci:*) Bash(npm install:*) Bash(dotnet build:*) Bash(dotnet test:*) Bash(dotnet format:*) Bash(osweb-dotnet-user:*) Bash(sh tools/guarded-test.sh:*) Bash(sh tools/sonar-local-guard.sh:*) Bash(ls:*) Bash(cat:*) Bash(head:*) Bash(tail:*) Bash(wc:*) Bash(grep:*) Bash(rtk read:*)",
  pollMs: Number(env.POLL_SECONDS || 10) * 1000,
  // Pelo MCP cada sincronização é uma chamada ao Claude: vai com mais calma.
  syncMs: Number(env.SYNC_SECONDS || (env.JIRA_TOKEN ? 120 : 600)) * 1000,
  dryRun: env.DRY_RUN === "1",
  stateDir: env.STATE_DIR || join(homedir(), ".local", "state", "asa-runner"),
};

/**
 * Repositórios em que o agente pode trabalhar. Vêm de ~/.config/asa-runner/repos.json (ou REPOS_FILE):
 * [{ "name": "nx", "dir": "/caminho/Nx-Workspace", "base": "homo", "branch": "{type}/{KEY}/{slug}", "setup": "npm ci" }]
 * Sem o arquivo, vale um repo só, de REPO_DIR, BASE_BRANCH, BRANCH_TEMPLATE e SETUP_CMD.
 */
function loadRepos() {
  const file = env.REPOS_FILE || join(dirname(ENV_FILE), "repos.json");
  const list = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : [{ name: basename(need("REPO_DIR")), dir: need("REPO_DIR"), base: need("BASE_BRANCH"), branch: env.BRANCH_TEMPLATE, setup: env.SETUP_CMD }];
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${file}: esperado uma lista de repositórios`);
  return list.map((r) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(r.name ?? "") || !r.dir || !r.base) throw new Error(`${file}: cada repo precisa de name, dir e base (${JSON.stringify(r)})`);
    if (!existsSync(join(r.dir, ".git"))) throw new Error(`${r.dir} não é um repositório git`);
    return { name: r.name, dir: resolve(r.dir), base: r.base, branch: r.branch || "{type}/{KEY}/{slug}", setup: r.setup || "" };
  });
}
const repos = loadRepos();
const repoByName = new Map(repos.map((r) => [r.name, r]));

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

// ---------- Jira pelo MCP da Atlassian ----------

const mcp = !cfg.jiraToken;
const MCP = "mcp__atlassian__";
const cloudId = () => cfg.jiraCloudId || new URL(cfg.jiraSite).host;

const mcpConfigArgs = () => (mcp ? ["--mcp-config", JSON.stringify({ mcpServers: { atlassian: { type: "http", url: cfg.jiraMcpUrl } } })] : []);

/** Épicos agrupam cards; o agente trabalha nos cards, então eles ficam fora da tela. */
const isEpic = (type) => /^(epic|[ée]pico)$/i.test(String(type ?? "").trim());

/** Título e tipo (Bug, História...) de cada card na última sincronização: dão o nome da branch e o título do PR. */
const cardInfo = new Map();

/** Pede ao Claude Code uma tarefa curta de Jira pelo MCP da Atlassian e lê o JSON da resposta. */
async function jiraViaClaude(task, tools) {
  const prompt = [
    `Use only the Atlassian MCP tools. cloudId: ${cloudId()}.`,
    task,
    "Reply with the JSON only: no Markdown fence, no text before or after it.",
  ].join("\n");
  const args = ["-p", prompt, "--output-format", "json", "--model", cfg.jiraMcpModel, ...mcpConfigArgs(), "--allowedTools", ...tools.map((t) => MCP + t)];
  const res = await run(cfg.claudeBin, args, { cwd: cfg.stateDir, timeoutMs: 180_000 });
  const outer = JSON.parse(res.out);
  if (outer.is_error) throw new Error(`Claude: ${String(outer.result).slice(0, 200)}`);
  const text = String(outer.result ?? "");
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
  if (start < 0 || end < start) throw new Error(`resposta sem JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

async function myCardsMcp() {
  const list = await jiraViaClaude(
    `Call searchJiraIssuesUsingJql with jql ${JSON.stringify(cfg.jql)}, fields ["summary","status","issuetype"] and maxResults 50. Return a JSON array with one object per issue: {"key": issue key, "summary": summary, "status": status name, "type": issue type name}.`,
    ["searchJiraIssuesUsingJql"],
  );
  if (!Array.isArray(list)) throw new Error("a busca não devolveu uma lista");
  for (const i of list) if (typeof i?.key === "string") cardInfo.set(i.key, { title: String(i.summary ?? ""), type: String(i.type ?? "") });
  return list
    .filter((i) => typeof i?.key === "string" && !isEpic(i.type))
    .map((i) => ({ ref: i.key, title: String(i.summary ?? "").slice(0, 300), status: String(i.status ?? "").slice(0, 80), url: `${cfg.jiraSite}/browse/${i.key}` }));
}

async function moveCardMcp(ref, target) {
  const tools = cfg.dryRun ? ["getJiraIssue"] : ["getJiraIssue", "transitionJiraIssue"];
  const r = await jiraViaClaude(
    [
      `Issue ${ref}. Call getJiraIssue with expand "transitions" and fields ["status"].`,
      `If its status already matches ${JSON.stringify(target)} (ignore case and accents), return {"result":"already"}.`,
      `Otherwise find the transition whose name or target status matches ${JSON.stringify(target)} (ignore case and accents).`,
      `If there is none, return {"result":"missing","options":[target status names]}.`,
      cfg.dryRun ? `If there is one, do NOT transition the issue; return {"result":"dry"}.` : `If there is one, call transitionJiraIssue with its id and return {"result":"moved"}.`,
      "Do not edit, comment on, or change anything else.",
    ].join("\n"),
    tools,
  );
  if (r.result === "already") return `card já estava em ${target}`;
  if (r.result === "dry") return `[teste] moveria o card para ${target}`;
  if (r.result === "moved") return `card movido para ${target}`;
  if (r.result === "missing") return `não achei a transição para ${target} (opções: ${(r.options ?? []).join(", ")})`;
  throw new Error(`resposta inesperada: ${JSON.stringify(r).slice(0, 200)}`);
}

async function myCards() {
  if (mcp) return myCardsMcp();
  const data = await jira("POST", "/rest/api/3/search/jql", { jql: cfg.jql, fields: ["summary", "status", "issuetype"], maxResults: 50 });
  for (const i of data.issues ?? []) cardInfo.set(i.key, { title: String(i.fields?.summary ?? ""), type: String(i.fields?.issuetype?.name ?? "") });
  return (data.issues ?? []).filter((i) => !isEpic(i.fields?.issuetype?.name)).map((i) => ({ ref: i.key, title: String(i.fields?.summary ?? "").slice(0, 300), status: String(i.fields?.status?.name ?? "").slice(0, 80), url: `${cfg.jiraSite}/browse/${i.key}` }));
}

async function cardDetails(ref) {
  // Pelo MCP, o próprio agente lê o card no começo do trabalho (veja startPrompt).
  if (mcp) return { title: "", status: "", type: "", description: "", comments: [], viaMcp: true };
  const i = await jira("GET", `/rest/api/3/issue/${ref}?fields=summary,description,status,issuetype,comment`);
  const comments = (i.fields?.comment?.comments ?? []).slice(-5).map((c) => `${c.author?.displayName ?? "?"}: ${adfText(c.body).trim()}`);
  return { title: i.fields?.summary ?? "", status: i.fields?.status?.name ?? "", type: i.fields?.issuetype?.name ?? "", description: adfText(i.fields?.description).trim(), comments };
}

const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Move o card para o status `target`. Devolve uma frase curta para o histórico do job. */
async function moveCard(ref, target) {
  if (mcp) return moveCardMcp(ref, target);
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
    const timer = opts.timeoutMs ? setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs) : null;
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (timer && clearTimeout(timer), code === 0 || opts.allowFail ? resolve({ code, out: out.trim(), err: err.trim() }) : reject(new Error(`${cmd} ${args[0] ?? ""} falhou (código ${code}): ${(err.trim() || out.trim() || "sem saída").replace(/\s+/g, " ").slice(0, 300)}`))));
  });
}

const git = (args, cwd, opts) => run("git", args, { cwd, ...opts });

// ---------- worktrees ----------

const slug = (text) =>
  norm(text || "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "") || "ajuste";

function branchName(repo, job) {
  const type = /bug|defeito|erro|falha/i.test(cardInfo.get(job.ref)?.type ?? "") ? "fix" : "feature";
  return repo.branch.replaceAll("{key}", job.ref.toLowerCase()).replaceAll("{KEY}", job.ref).replaceAll("{slug}", slug(job.title)).replaceAll("{type}", type);
}

const commonDir = async (dir) => realpathSync(resolve(dir, (await git(["rev-parse", "--git-common-dir"], dir)).out));

/** Repos do job: os escolhidos no celular ou, sem escolha, o primeiro configurado. */
function jobRepos(job) {
  const names = job.repos?.length ? job.repos : [repos[0].name];
  const unknown = names.filter((n) => !repoByName.has(n));
  if (unknown.length) throw new Error(`repo não configurado no agente: ${unknown.join(", ")}`);
  return names.map((n) => repoByName.get(n));
}

/**
 * Worktree do card ao lado do repo, no padrão <Repo>-<CARD> (ex.: Nx-Workspace-IBR-6564).
 * Se já existe uma worktree desse repo para o card, o agente continua nela, na branch em que está, desde que esteja limpa.
 */
async function prepareRepo(job, repo) {
  const base = job.base || repo.base;
  await git(["fetch", "-q", "origin", base], repo.dir);
  const dir = join(dirname(repo.dir), `${basename(repo.dir)}-${job.ref}`);
  if (existsSync(dir)) {
    const isWorktree = existsSync(join(dir, ".git")) && (await commonDir(dir).catch(() => "")) === (await commonDir(repo.dir));
    if (!isWorktree) throw new Error(`${dir} já existe e não é uma worktree de ${repo.name}`);
    if ((await git(["status", "--porcelain"], dir)).out) throw new Error(`${dir} tem alterações sem commit que não são do agente. Faça commit ou descarte e mande de novo.`);
    const branch = (await git(["branch", "--show-current"], dir)).out;
    if (!branch) throw new Error(`${dir} não está numa branch`);
    return { name: repo.name, dir, branch, base, created: false };
  }
  const branch = branchName(repo, job);
  const exists = (await git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], repo.dir, { allowFail: true })).code === 0;
  await git(exists ? ["worktree", "add", "-q", dir, branch] : ["worktree", "add", "-q", "-b", branch, dir, `origin/${base}`], repo.dir);
  if (repo.setup) await run("sh", ["-c", repo.setup], { cwd: dir });
  return { name: repo.name, dir, branch, base, created: true };
}

async function prepareWorkspaces(job) {
  const list = [];
  for (const repo of jobRepos(job)) list.push(await prepareRepo(job, repo));
  return list;
}

async function changes(ws) {
  const ahead = Number((await git(["rev-list", "--count", `origin/${ws.base}..HEAD`], ws.dir)).out || 0);
  const stat = (await git(["diff", "--shortstat", `origin/${ws.base}...HEAD`], ws.dir)).out;
  const files = /(\d+) files? changed/.exec(stat)?.[1] ?? "0";
  const plus = /(\d+) insertions?/.exec(stat)?.[1] ?? "0";
  const minus = /(\d+) deletions?/.exec(stat)?.[1] ?? "0";
  const dirty = (await git(["status", "--porcelain"], ws.dir)).out !== "";
  const summary = `${ahead} commit${ahead === 1 ? "" : "s"} · ${files} arquivo${files === "1" ? "" : "s"} · +${plus} −${minus}${dirty ? " · há alterações sem commit" : ""}`;
  return { ahead, summary };
}

// ---------- Claude Code ----------

let current = null; // { jobId, child }

function startPrompt(job, card, workspaces) {
  return [
    "Você é um agente de desenvolvimento rodando sozinho: ninguém vai responder perguntas durante esta execução.",
    `Card ${job.ref} (${card.type || cardInfo.get(job.ref)?.type || "card"}): ${card.title || job.title}`,
    card.viaMcp
      ? `Antes de tudo, leia o card com a ferramenta mcp__atlassian__getJiraIssue (cloudId ${cloudId()}, issue ${job.ref}) e os comentários com mcp__atlassian__listJiraIssueComments. Só leia: não edite, não comente e não mude o status do card.`
      : card.description ? `Descrição do card:\n${card.description}` : "O card não tem descrição.",
    card.comments.length ? `Últimos comentários:\n${card.comments.join("\n")}` : "",
    job.instruction ? `Mensagem do dono do card:\n${job.instruction}\n\nSe a mensagem for uma pergunta ou um pedido de análise, responda e pare: não mexa no código até ele pedir.` : "",
    "",
    workspaces.length > 1 ? "Repositórios deste trabalho (cada um numa worktree própria, já na branch certa):" : "Repositório deste trabalho (numa worktree própria, já na branch certa):",
    ...workspaces.map((w) => `- ${w.name}: ${w.dir} (branch ${w.branch}, a partir de origin/${w.base})`),
    "",
    "O que fazer:",
    "1. Entenda o card e o código. Leia o CLAUDE.md e o AGENTS.md de cada repositório que for mexer e siga as convenções deles (testes, build, padrão de commit).",
    "2. Implemente nas branches atuais. Não troque de branch, não faça push e não abra PR: isso é feito depois.",
    workspaces.length > 1 ? "3. Mexa só nos repositórios que o card precisa. Nem todos precisam mudar." : "",
    "4. Rode os testes, o lint e o build que cobrem o que você mudou.",
    `5. Faça commits pequenos no padrão de cada repositório, citando ${job.ref}. Se um repositório pede uma validação antes do commit e ela não puder rodar, não faça o commit e explique no relatório.`,
    "6. Se faltar informação para decidir, escolha o caminho mais seguro e anote a dúvida no relatório. Não invente regra de negócio.",
    "",
    "O dono acompanha pelo celular o que você escreve. Entre as etapas, escreva frases curtas dizendo o que está fazendo e o que descobriu.",
    "No final, responda com o relatório em Markdown que vai na descrição do PR, com as seções: ## O que mudou, ## Como testar, ## Dúvidas e pendências.",
  ]
    .filter(Boolean)
    .join("\n");
}

const feedbackPrompt = (job, text) =>
  [
    `Mensagem do dono do ${job.ref}, enviada pelo celular:`,
    text,
    "",
    "Responda em português, direto. Se for só uma pergunta, responda sem mexer no código.",
    `Se ele pedir mudança: ajuste, rode os testes, faça commit (no padrão de cada repositório, citando ${job.ref}) e termine com o relatório atualizado, começando por "## O que mudou", no mesmo formato de antes.`,
  ].join("\n");

/** Roda o Claude Code e conta o andamento ao asa (só o número de ações). Devolve o relatório final. */
/**
 * Ferramentas liberadas para o Claude Code. Hooks como o do RTK reescrevem `git add` para `rtk git add`,
 * então cada regra de Bash também vale com o prefixo `rtk`.
 */
function allowedTools() {
  const tools = cfg.allowedTools.split(/\s+(?![^(]*\))/).filter(Boolean);
  const withRtk = tools.flatMap((t) => {
    const m = /^Bash\((?!rtk )(.+)\)$/.exec(t);
    return m ? [t, `Bash(rtk ${m[1]})`] : [t];
  });
  return [...new Set(withRtk)];
}

function runClaude(job, workspaces, prompt, resumeSession) {
  const tools = allowedTools();
  if (mcp) tools.push(`${MCP}getJiraIssue`, `${MCP}listJiraIssueComments`);
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", ...mcpConfigArgs()];
  for (const w of workspaces.slice(1)) args.push("--add-dir", w.dir);
  args.push("--allowedTools", ...tools);
  if (cfg.claudeModel) args.push("--model", cfg.claudeModel);
  if (resumeSession) args.push("--resume", resumeSession);
  const logFile = join(cfg.stateDir, "logs", `${job.ref}-${Date.now()}.jsonl`);
  const cwd = workspaces[0].dir;

  return new Promise((resolve, reject) => {
    const child = spawn(cfg.claudeBin, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    current = { jobId: job.id, child, canceled: false, interrupted: false };
    let buffer = "";
    let actions = 0;
    let lastSent = 0;
    let sessionId = resumeSession ?? null;
    let result = null;
    let stderr = "";
    // O texto do Claude vai para o chat do card, na ordem em que saiu.
    let replies = Promise.resolve();
    const sendReply = (text) => {
      replies = replies.then(() => asa("POST", `/agent/jobs/${job.id}/reply`, { text: text.slice(0, 20000) })).catch((err) => log(job.ref, "falha ao mandar resposta:", firstLine(err)));
    };

    const progress = setInterval(() => {
      if (actions !== lastSent) {
        lastSent = actions;
        report(job.id, "running", { text: `${actions} ações até agora` }).catch(() => undefined);
      }
    }, 30_000);
    // Cancelar ou parar pelo celular: interrompe o Claude em poucos segundos.
    const stop = (signal) => {
      child.kill(signal);
      setTimeout(() => child.exitCode === null && child.kill("SIGKILL"), 10_000).unref();
    };
    const watch = setInterval(() => {
      if (!current || current.canceled || current.interrupted) return;
      asa("GET", `/agent/jobs/${job.id}`)
        .then((d) => {
          if (!current) return;
          if (d.job.cancelRequested || d.job.status === "canceled") {
            current.canceled = true;
            stop("SIGTERM");
          } else if (d.job.interruptRequested) {
            current.interrupted = true;
            stop("SIGINT");
          }
        })
        .catch(() => undefined);
    }, 5_000);

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
        if (msg.session_id && msg.session_id !== sessionId) {
          sessionId = msg.session_id;
          // Guarda a sessão já no começo: se o runner cair no meio, dá para retomar a conversa.
          state.jobs[job.id] = { ...state.jobs[job.id], sessionId };
          saveState();
        }
        if (msg.type === "assistant") {
          const content = msg.message?.content ?? [];
          actions += content.filter((b) => b.type === "tool_use").length;
          for (const b of content) if (b.type === "text" && b.text?.trim()) sendReply(b.text.trim());
        }
        if (msg.type === "result") result = msg;
      }
    });
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearInterval(progress);
      clearInterval(watch);
      reject(err);
    });
    child.on("close", async (code) => {
      clearInterval(progress);
      clearInterval(watch);
      await replies;
      const canceled = current?.canceled ?? false;
      const interrupted = current?.interrupted ?? false;
      current = null;
      if (canceled) return resolve({ canceled: true, sessionId });
      if (interrupted) return resolve({ canceled: false, interrupted: true, sessionId });
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
  const created = await run("gh", ["pr", "create", "--draft", "--base", ws.base, "--head", ws.branch, "--title", (job.title ? `${job.ref}: ${job.title}` : job.ref).slice(0, 250), "--body-file", reportFile], { cwd: ws.dir });
  return created.out.split("\n").find((l) => l.startsWith("https://")) ?? null;
}

// ---------- ações ----------

async function afterClaude(job, workspaces, outcome) {
  if (outcome.canceled) return log(job.ref, "cancelado");
  state.jobs[job.id] = { ...state.jobs[job.id], sessionId: outcome.sessionId };
  saveState();
  if (outcome.interrupted) {
    // Parado por você: guarda a sessão e não mexe em PR; a próxima mensagem continua de onde parou.
    log(job.ref, "parado pelo celular");
    const lines = [];
    for (const ws of workspaces) {
      const { ahead, summary } = await changes(ws);
      if (ahead > 0 || summary.includes("sem commit")) lines.push(workspaces.length > 1 ? `${ws.name}: ${summary}` : summary);
    }
    await report(job.id, "review", { text: "Você parou o agente.", summary: lines.join(" · ").slice(0, 1000) || "Parado antes de mudar o código." });
    return;
  }
  const reportFile = join(cfg.stateDir, "reports", `${job.ref}.md`);
  // A descrição do PR muda só quando vem relatório novo; uma resposta a uma pergunta não apaga o relatório anterior.
  const at = outcome.report.indexOf("## O que mudou");
  const body = at >= 0 ? outcome.report.slice(at) : existsSync(reportFile) ? null : outcome.report;
  if (body !== null) writeFileSync(reportFile, `${body}\n\n---\n_Feito pelo agente do asa a partir do ${job.ref}._\n`);
  const lines = [];
  const prs = [];
  const dirtyOnly = [];
  for (const ws of workspaces) {
    const { ahead, summary } = await changes(ws);
    if (ahead === 0) {
      if (summary.includes("sem commit")) dirtyOnly.push(ws.name);
      continue;
    }
    lines.push(workspaces.length > 1 ? `${ws.name}: ${summary}` : summary);
    const url = await openOrUpdatePr(job, ws, reportFile);
    if (url) prs.push({ repo: ws.name, url });
  }
  state.jobs[job.id] = { ...state.jobs[job.id], prs };
  saveState();
  if (lines.length === 0) {
    await report(job.id, "review", { summary: dirtyOnly.length ? `Alterações sem commit em ${dirtyOnly.join(", ")}` : "Sem mudanças no código", text: "" });
    return;
  }
  const text = cfg.dryRun ? "[teste] sem push nem PR." : prs.length ? `PR em rascunho atualizado com o relatório: ${prs.map((p) => p.repo).join(", ")}.` : "Sem PR.";
  await report(job.id, "review", { summary: lines.join(" · ").slice(0, 1000), text, ...(prs.length ? { prs } : {}) });
}

async function start(job) {
  log(job.ref, "começando");
  const card = await cardDetails(job.ref);
  job = { ...job, title: job.title || card.title || cardInfo.get(job.ref)?.title || "" };
  const moved = await moveCard(job.ref, cfg.startStatus).catch((e) => `não consegui mover o card: ${firstLine(e)}`);
  await report(job.id, "running", { text: moved });
  // Trabalho anterior do agente neste card (cancelado ou com erro): continua nas mesmas worktrees e na mesma sessão,
  // mesmo com alterações sem commit, porque elas são dele.
  const previous = Object.entries(state.jobs).find(([id, j]) => id !== job.id && j.ref === job.ref && j.workspaces?.some((w) => existsSync(w.dir)));
  const workspaces = [];
  for (const repo of jobRepos(job)) {
    const kept = previous?.[1].workspaces.find((w) => w.name === repo.name && existsSync(w.dir));
    workspaces.push(kept ?? (await prepareRepo(job, repo)));
  }
  const session = previous && previous[1].workspaces[0]?.dir === workspaces[0].dir ? previous[1].sessionId : null;
  if (previous) {
    delete state.jobs[previous[0]];
    log(job.ref, `continuando o trabalho anterior${session ? " na mesma sessão" : ""}`);
  }
  state.jobs[job.id] = { ref: job.ref, title: job.title, workspaces, ...(session ? { sessionId: session } : {}), prs: previous?.[1].prs ?? [] };
  saveState();
  const prompt = session ? feedbackPrompt(job, job.instruction || "Continue o trabalho deste card de onde parou.") : startPrompt(job, card, workspaces);
  await afterClaude(job, workspaces, await runClaude(job, workspaces, prompt, session));
}

async function feedback(job, text) {
  log(job.ref, "pedido de mudança");
  const saved = state.jobs[job.id];
  job = { ...job, title: job.title || saved?.title || "" };
  const kept = saved?.workspaces?.every((w) => existsSync(w.dir)) ? saved.workspaces : null;
  const workspaces = kept ?? (await prepareWorkspaces(job));
  if (!kept) {
    state.jobs[job.id] = { ...saved, ref: job.ref, title: job.title, workspaces, sessionId: undefined };
    saveState();
  }
  // Sem a sessão (outra máquina, estado apagado, worktrees refeitas), começa uma nova com o card e o pedido.
  const session = kept ? saved?.sessionId : null;
  const prompt = session ? feedbackPrompt(job, text) : `${startPrompt(job, await cardDetails(job.ref), workspaces)}\n\n${feedbackPrompt(job, text)}`;
  await afterClaude(job, workspaces, await runClaude(job, workspaces, prompt, session ?? null));
}

async function approve(job) {
  log(job.ref, "aprovado");
  const saved = state.jobs[job.id];
  const notes = [];
  const prs = saved?.prs?.length ? saved.prs : job.prUrl ? [{ repo: "", url: job.prUrl }] : [];
  if (!cfg.dryRun) {
    for (const pr of prs) await run("gh", ["pr", "ready", pr.url], { cwd: saved?.workspaces?.[0]?.dir ?? repos[0].dir });
    if (prs.length) notes.push(prs.length > 1 ? `${prs.length} PRs prontos para revisão` : "PR pronto para revisão");
  }
  notes.push(await moveCard(job.ref, cfg.doneStatus).catch((e) => `não consegui mover o card: ${firstLine(e)}`));
  // Só remove as worktrees que o próprio agente criou; as que já existiam ficam como estavam.
  for (const w of saved?.workspaces ?? []) {
    const repo = repoByName.get(w.name);
    if (w.created && repo && existsSync(w.dir)) await git(["worktree", "remove", w.dir], repo.dir, { allowFail: true });
  }
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
    await asa("PUT", "/agent/cards", { cards, repos: repos.map((r) => ({ name: r.name, base: r.base })) });
    log(`cards sincronizados: ${cards.length}`);
  } catch (err) {
    log("falha ao sincronizar cards:", firstLine(err));
  }
}

/** Jobs que ficaram pela metade (runner reiniciado ou máquina desligada) voltam para você, com a sessão guardada. */
async function recoverInterrupted() {
  for (const id of Object.keys(state.jobs)) {
    try {
      const { job } = await asa("GET", `/agent/jobs/${id}`);
      if (job.status !== "running") continue;
      log(job.ref, "retomando: o agente reiniciou no meio do trabalho");
      await report(id, "review", { text: "O agente reiniciou no meio do trabalho. Responda para ele continuar de onde parou.", summary: "Parado no meio" });
    } catch (err) {
      log("não consegui verificar o job", id, firstLine(err));
    }
  }
}

async function main() {
  log(`asa-runner ${cfg.dryRun ? "(modo teste) " : ""}· ${cfg.asaUrl} · repos ${repos.map((r) => `${r.name} (${r.base})`).join(", ")} · Jira ${mcp ? "pelo MCP" : "pela API"}`);
  const stop = () => {
    current?.child.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await recoverInterrupted();
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
