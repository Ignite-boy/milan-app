# CLAUDE.md

Operating guide for Claude Code (and any AI assistant) working in the **MILAN**
repository. Read this before making any change.

---

## 1. Commit, Push & Deploy (only after approval)

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

## 2. Never Commit

Always respect `.gitignore`. The following must **never** be committed:

- **Secrets** — `backend/.env`
- **User data** — `backend/dwn/`, `backend/real-dwn-engine/`
- **Dependencies & binaries** — `node_modules/`, `backend/bin/`
