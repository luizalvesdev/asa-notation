# asa-runner

The work agent behind the **Trabalho** screen. It runs on your own machine and:

- syncs the Jira cards assigned to you to the asa (key, title, status and link only);
- picks up jobs you start from the phone, runs Claude Code in a git worktree of the repo, and opens a draft PR;
- applies change requests in the same Claude Code session;
- on approval, marks the PR ready for review and moves the Jira card.

Code, card descriptions and Claude's report stay on this machine, in Jira and on GitHub. The report goes in the PR description. The asa only receives the job status, counts (commits, files, lines) and links.

## What you need

- Node 22+, `git`, and `claude` on the PATH, with Claude Code logged in.
- The `gh` CLI logged in to the account that can push to the repo.
- A Jira API token. Create it at https://id.atlassian.com/manage-profile/security/api-tokens.
- An asa API token with **write** scope. Create it under Configurações › API.

## Configuration

Create `~/.config/asa-runner/env` with `chmod 600`:

```sh
ASA_URL=https://asa.luizalves.dev
ASA_TOKEN=asa_...
REPO_DIR=/home/you/Desktop/projetos/ibr-v2
BASE_BRANCH=homolog
JIRA_SITE=https://your-site.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_TOKEN=...

# Optional
# JQL=assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC
# JIRA_START_STATUS=Em andamento
# JIRA_DONE_STATUS=Aguardando teste do QA
# BRANCH_TEMPLATE=asa/{key} # {key} = ibr-123, {KEY} = IBR-123 (e.g. feat/{KEY}/asa-homolog)
# SETUP_CMD=bun install     # runs once in each new worktree
# WORKTREE=0                # work in REPO_DIR itself (it must be clean)
# CLAUDE_MODEL=
# CLAUDE_ALLOWED_TOOLS=Read Edit Write Glob Grep Bash(git commit:*) Bash(npm test:*) ...
# POLL_SECONDS=10
# SYNC_SECONDS=120
# DRY_RUN=1                 # no push, no PR, no card moves
```

Claude Code runs with `--permission-mode acceptEdits` and only the tools in `CLAUDE_ALLOWED_TOOLS`. Any command outside the list is refused, and the agent notes it in the report. Add the commands your project needs, for example `Bash(pnpm test:*)`.

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
| Trabalhando | The card moves to `JIRA_START_STATUS`, a worktree on a branch named by `BRANCH_TEMPLATE` is created from `origin/BASE_BRANCH`, and Claude Code works on it. |
| Para revisar | Commits are pushed and a draft PR is opened or updated. Review the diff in the GitHub app. |
| Mudança pedida | Your text goes to the same Claude Code session (`--resume`). The PR gets the new report. |
| Concluído | `gh pr ready`, the card moves to `JIRA_DONE_STATUS`, and the worktree is removed (the branch stays). |
| Cancelado | Claude Code is stopped. The worktree and branch stay. |
