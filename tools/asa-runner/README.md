# asa-runner

The work agent behind the **Trabalho** screen. It runs on your own machine and:

- syncs the Jira cards assigned to you to the asa (key, title, status and link only);
- picks up jobs you start from the phone, runs Claude Code in git worktrees of the repos you pick, and opens one draft PR per repo;
- applies change requests in the same Claude Code session;
- on approval, marks the PR ready for review and moves the Jira card.

Code, card descriptions and Claude's report stay on this machine, in Jira and on GitHub. The report goes in the PR description. The asa only receives the job status, counts (commits, files, lines) and links.

## What you need

- Node 22+, `git`, and `claude` on the PATH, with Claude Code logged in.
- The `gh` CLI logged in to the account that can push to the repo.
- Jira access, in one of two ways:
  - **Atlassian MCP (default).** Claude Code logged in to the Atlassian MCP server (OAuth) in any project. The runner passes the server to every `claude` call with `--mcp-config`, so it works in new worktrees too. No token is stored.
  - **Jira API token.** Create it at https://id.atlassian.com/manage-profile/security/api-tokens and set `JIRA_EMAIL` and `JIRA_TOKEN`.
- An asa API token with **write** scope. Create it under Configurações › API.

## Configuration

Create `~/.config/asa-runner/env` with `chmod 600`:

```sh
ASA_URL=https://asa.luizalves.dev
ASA_TOKEN=asa_...
JIRA_SITE=https://your-site.atlassian.net

# Jira through the Atlassian MCP (no token): optional cloud id, defaults to the site host
# JIRA_CLOUD_ID=...
# JIRA_MCP_MODEL=haiku      # model for the short Jira calls (sync, card moves)
# Or Jira through the REST API
# JIRA_EMAIL=you@company.com
# JIRA_TOKEN=...

# Optional
# JQL=assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC
# JIRA_START_STATUS=Em andamento
# JIRA_DONE_STATUS=Aguardando teste do QA
# JIRA_MCP_URL=https://mcp.atlassian.com/v2/mcp
# CLAUDE_MODEL=
# CLAUDE_ALLOWED_TOOLS=Read Edit Write Glob Grep Bash(git commit:*) Bash(npm test:*) ...
# POLL_SECONDS=10
# SYNC_SECONDS=600         # 120 with a Jira token
# DRY_RUN=1                 # no push, no PR, no card moves
```

Then list the repos in `~/.config/asa-runner/repos.json`. The first one is the default when a job picks none:

```json
[
  { "name": "ibr-v2", "dir": "/home/you/projetos/ibr-v2", "base": "homolog", "branch": "{type}/{KEY}/{slug}-homolog", "setup": "bun install" },
  { "name": "nx", "dir": "/home/you/projetos/desmonte/Nx-Workspace", "base": "homo", "setup": "npm ci" },
  { "name": "dotnet", "dir": "/home/you/projetos/desmonte/DotNet-Workspace", "base": "homo" }
]
```

- `base` is the branch new work starts from. The phone can override it per job, for example to stack on another card's branch.
- `branch` names new branches. `{type}` is `fix` for bugs and `feature` otherwise, `{KEY}` is `IBR-123`, `{key}` is `ibr-123`, and `{slug}` comes from the card title. The default is `{type}/{KEY}/{slug}`.
- `setup` runs once in each new worktree.
- Without `repos.json`, the runner uses one repo from `REPO_DIR`, `BASE_BRANCH`, `BRANCH_TEMPLATE` and `SETUP_CMD`.

Each repo gets a worktree next to it, named `<repo folder>-<CARD>` (for example `Nx-Workspace-IBR-6564`). If that worktree already exists, the agent keeps working in it, on its current branch, as long as it has no uncommitted changes. On approval the agent removes only the worktrees it created.

Claude Code runs with `--permission-mode acceptEdits` and only the tools in `CLAUDE_ALLOWED_TOOLS`. Any command outside the list is refused, and the agent notes it in the report. Add the commands your project needs, for example `Bash(pnpm test:*)`.

With the Atlassian MCP, each card sync and each card move is a short `claude -p` call that may use only the Jira search, read and transition tools. It counts toward your Claude Code plan, so the sync runs every 10 minutes by default. During a job, the agent reads the card itself with the read-only Jira tools.

## Run

```sh
node tools/asa-runner/runner.mjs              # foreground
node tools/asa-runner/runner.mjs --once-sync  # sync the cards once and exit
```

To keep it running in the background (systemd, user scope):

```sh
mkdir -p ~/.config/systemd/user
cp tools/asa-runner/asa-runner.service ~/.config/systemd/user/
# edit ExecStart if the repo is somewhere else
systemctl --user daemon-reload
systemctl --user enable --now asa-runner
journalctl --user -u asa-runner -f
```

State, Claude Code logs (`logs/*.jsonl`) and reports (`reports/*.md`) live in `~/.local/state/asa-runner/`.

## Job lifecycle

| asa status | What happens |
| --- | --- |
| Na fila | Waiting for the runner. |
| Trabalhando | The card moves to `JIRA_START_STATUS`, each chosen repo gets its worktree, and Claude Code works across them (the first is the working directory, the others are added with `--add-dir`). |
| Para revisar | Each repo with new commits is pushed and gets a draft PR, opened or updated. Review the diffs in the GitHub app. |
| Mudança pedida | Your text goes to the same Claude Code session (`--resume`). The PR gets the new report. |
| Concluído | `gh pr ready` on every PR, the card moves to `JIRA_DONE_STATUS`, and the worktrees the agent created are removed (the branches stay). |
| Cancelado | Claude Code is stopped. The worktree and branch stay. |
