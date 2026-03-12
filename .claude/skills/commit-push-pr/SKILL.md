---
name: commit-push-pr
description: Stage all changes, create a conventional commit, push the branch, and open a pull request using the repo's PR template.
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git diff:*), Bash(git commit:*), Bash(git push:*), Bash(git log:*), Bash(gh pr create:*), Bash(gh pr view:*), Bash(gh repo view:*), Bash(rm:*), Write
---

# Commit, Push & Create PR

## Pre-computed context

<git_status>
!`git status --short`
</git_status>

<current_branch>
!`git branch --show-current`
</current_branch>

<diff_stat>
!`git diff --stat`
</diff_stat>

<staged_diff_stat>
!`git diff --cached --stat`
</staged_diff_stat>

<recent_commits>
!`git log --oneline -10`
</recent_commits>

<pr_template>
!`cat .github/PULL_REQUEST_TEMPLATE.md 2>/dev/null || echo "No PR template found"`
</pr_template>

## Instructions

You have the capability to call multiple tools in a single response. You MUST complete all steps below in a **single message**. Do not use any other tools or do anything else.

### 1. Stage changes

- If there are unstaged changes (check `<git_status>` for entries without a leading letter in the index column), run `git add -A` to stage everything.
- If all changes are already staged, skip this step.
- If there are no changes at all, stop and tell me there is nothing to commit.

### 2. Create a commit

Follow the **[Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)** spec (see CLAUDE.md § Git Workflow for full rules):

- Format: `<type>(<optional scope>): <description>`
- Allowed types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `ci`, `build`, `perf`
- Breaking changes: append `!` before the colon or add a `BREAKING CHANGE:` footer.
- If `$ARGUMENTS` is provided, use it as the commit subject line verbatim.
- Otherwise, analyze the diff to determine the appropriate type and write a concise subject line (≤72 chars, imperative mood).
- Add a blank line and then a short body (2-4 lines) explaining _what_ and _why_, not _how_.
- Do NOT add any co-authorship footer.
- Run `git commit` with the message.

### 3. Push the branch

- Push the current branch to `origin`.
- If the branch has no upstream yet, use `git push --set-upstream origin <branch>`.

### 4. Open a pull request

- Use `gh pr create` to open a pull request.
- Generate a clear, descriptive PR title from the commit(s) on this branch.
- For the PR body, use the **PR template** shown in `<pr_template>` above. Fill in each section based on the actual changes. If no template was found, write a well-structured description covering: what changed, why, and how to test.
- **Write the PR body to a temp file first** using the Write tool at `/tmp/pr_body.md`, then run:
  `gh pr create --title "<title>" --body-file /tmp/pr_body.md`
  This avoids shell permission prompts triggered by inline multi-line strings with markdown headers.
- **After the PR is created, delete the temp file:** `rm /tmp/pr_body.md`
- Target the default branch (usually `main` or `develop`). Do NOT hard-code a target — let `gh` infer it, or check with `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.
- If a PR already exists for this branch, skip this step and tell me the existing PR URL instead (check with `gh pr view --json url -q .url 2>/dev/null`).
