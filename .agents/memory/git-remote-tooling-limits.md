---
name: Git remote tooling limits
description: Constraints on the gitPush/gitPull/createPullRequest tools observed when syncing a repo to an external remote.
---

- Only GitHub is actually supported by `gitPush`/`gitPull`/`createPullRequest`. GitLab and Bitbucket are recognized names but always return `UNSUPPORTED_PROVIDER` — do not attempt them; tell the user to push manually.
- If the repl has no `origin` remote configured (`git remote -v` shows only Replit's internal `subrepl-*`/`gitsafe-backup` remotes), `gitPush` fails with `NO_REMOTE` even after the user "connects" GitHub via the Git pane. Fix: `git remote add origin <https-url>` manually, then retry `gitPush({})` — it auto-detects the provider from that URL once set.
- Pushing straight to a freshly created (even empty) GitHub repo's default branch (e.g. `main`) can fail with `CLI_ERROR: BRANCH_ALREADY_EXISTS` for no discernible reason — reproduced even after the user deleted and recreated the repo with no initial commit. Raw `git` CLI commands can't be used to work around it either (`GIT_ASKPASS=replit-git-askpass` doesn't authenticate plain `git fetch`/`git ls-remote` run directly from ShellExec — only the `gitPush`/`gitPull`/`createPullRequest` callbacks carry working credentials).
- **Workaround that works:** push to a *new* branch name instead (e.g. `gitPush({ branch: "replit-sync", force: true })`). This succeeds and lands all commits on GitHub. Then ask the user to either set that branch as the repo's default branch, or rename/merge it into `main` themselves from GitHub's UI — `createPullRequest` from the new branch into `main` can itself fail with "No commits between main and X" if the remote's `main` is genuinely empty/unborn, so don't rely on a PR to finish the job.
