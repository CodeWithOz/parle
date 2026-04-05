---
description: Create a new git worktree for feature development with automated setup
argument-hint: [feature-description]
allowed-tools: Bash(git worktree:*), Bash(git branch:*)
---

# Create New Git Worktree for Feature Development

You are being asked to create a new git worktree for the feature: **$ARGUMENTS**

## Current Repository Context

Current branch: !`git branch --show-current`
Existing worktrees: !`git worktree list`

## Your Task

### 1. Generate Names

From the feature description "$ARGUMENTS", create:
- **Folder name**: Convert to kebab-case, keep it short (3-5 words max)
  - Example: "add telegram notifications" → "add-telegram-notifs"
  - Example: "fix authentication bug" → "fix-auth-bug"
  - Example: "refactor audio processing pipeline" → "refactor-audio-pipeline"
- **Branch name**: Use pattern `feature/{folder-name}`

### 2. Create Branch and Worktree

```bash
git worktree add ~/.cursor/worktrees/parle/{folder-name} -b feature/{folder-name}
```

### 3. Execute Setup Commands

Read the setup commands from `.cursor/worktrees.json` and execute them all in one sequential bash call:

```bash
cd ~/.cursor/worktrees/parle/{folder-name} && \
  export ROOT_WORKTREE_PATH="$(git rev-parse --show-toplevel)" && \
  npm install && \
  cp "$ROOT_WORKTREE_PATH/.env.local" .env.local
```

### 4. Verify and Report

After worktree creation completes:
1. Confirm the worktree was created successfully
2. List the new worktree's path
3. Provide next steps

### 5. Next Steps for User

```
Worktree created at: ~/.cursor/worktrees/parle/{folder-name}
Branch: feature/{folder-name}

Ready to start working on: {feature-description}

To open: cd ~/.cursor/worktrees/parle/{folder-name} && npm run dev

WHEN CLEANING UP:
  git worktree remove ~/.cursor/worktrees/parle/{folder-name}
  git branch -d feature/{folder-name}
```

### Error Handling

If worktree creation fails:
- Check if branch name already exists
- Check if worktree folder already exists
- Report the specific error and suggest resolution
