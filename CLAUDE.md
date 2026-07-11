# CLAUDE.md

Guidance for Claude Code (and any AI assistant) working in the **MILAN** repository.

---

## Automatic Commit & Push

Whenever any file in this `milan-app` repository is **created, edited, or updated** — through any
command, device, or workflow — commit and push the change to GitHub **immediately afterward, without
being asked**:

```bash
cd ~/milan-app
git add .
git commit -m "Auto-update: <short description of the change>"
git push origin main
```

This must be followed at the end of **every** task, permanently.

### Conventions

- **Commit message:** start with `Auto-update:` followed by a short, clear summary of what changed.
- **Branch:** only `main` is used.
- **Sync first:** if a push is rejected, pull with `git pull --rebase origin main`, then push again.

### Never commit

Respect `.gitignore` at all times. The following must **never** be committed:

- Secrets — `backend/.env`
- User data — `backend/dwn/`, `backend/real-dwn-engine/`
- Dependencies & binaries — `node_modules/`, `backend/bin/`
