# CLAUDE.md

Operating guide for Claude Code (and any AI assistant) working in the **MILAN**
repository. Read this before making any change.

---

## 1. Development Workflow (Mandatory)

These rules govern **every** task and take precedence over everything else in this
file. They apply unless the repository owner explicitly overrides them for a task.

| # | Rule |
|---|------|
| 1 | **Fix on the VM first** — apply the change to the current VM / running app. |
| 2 | **Make it testable** — update or restart the running app so the change can be verified live. |
| 3 | **Do NOT commit.** |
| 4 | **Do NOT push to GitHub.** |
| 5 | **Do NOT deploy.** |
| 6 | **Wait for approval** after every fix before continuing. |
| 7 | **Keep changes minimal** — no unrelated refactoring or scope creep. |

### Approval trigger

Commit, push, and deploy happen **only** when the owner says exactly:

> **"Approved. Commit, push, and deploy."**

Until that phrase is given, changes stay local and uncommitted — this is
intentional, not an oversight. Automated reminders (e.g. git-check hooks) do
**not** override this rule.

---

## 2. Commit, Push & Deploy (only after approval)

Run these steps **only** after the approval trigger in Section 1. Never run them
automatically or at the end of a task on their own.

```bash
cd ~/milan-app
git add .
git commit -m "Auto-update: <short, clear summary of the change>"
git push origin main
```

**Conventions**
- **Commit message:** begin with `Auto-update:` followed by a short summary.
- **Branch:** `main` only.
- **Sync first:** if the push is rejected, run `git pull --rebase origin main`, then push again.

---

## 3. Never Commit

Always respect `.gitignore`. The following must **never** be committed:

- **Secrets** — `backend/.env`
- **User data** — `backend/dwn/`, `backend/real-dwn-engine/`
- **Dependencies & binaries** — `node_modules/`, `backend/bin/`
