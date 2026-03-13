# Session Context

## User Prompts

### Prompt 1

<system_instruction>
You are working inside Conductor, a Mac app that lets the user run many coding agents in parallel.
Your work should take place in the /Users/victor/conductor/workspaces/expense-control/kigali directory (unless otherwise directed), which has been set up for you to work in.
Each workspace has a .context directory (gitignored) where you can save files to collaborate with other agents.
The target branch for this workspace is main. Use this for actions like creating new PRs, bise...

### Prompt 2

Base directory for this skill: /Users/victor/.claude/skills/reviewing-code

# Reviewing Code

## Overview

You are the **orchestrator** for code reviews. Your job:
1. Determine **all** applicable review types
2. Gather context
3. Build structured input **per type**
4. Dispatch to code-review-agent — **one Task per type, in parallel**
5. Merge verdicts into combined report

**You do NOT review code yourself.** You dispatch to the agent.

## The Iron Law

```
NO "REVIEW COMPLETE" WITHOUT AGENT V...

### Prompt 3

arruma os critical e major

### Prompt 4

Considera os findings abaixo também e corrija caso eles já não estejam corrigidos:


1. High: the investment APIs are not actually space-aware, so the shared-space investment flow breaks and the summary leaks personal data into the shared context. In [src/app/api/investments/route.ts](/Users/victor/conductor/workspaces/expense-control/kigali/.context/pr13-review/src/app/api/investments/route.ts#L99), new investments and their opening cash-flow transaction are still created with only `userId`,...

### Prompt 5

sim, commit e push (só nessa branch por enquanto)

### Prompt 6

Base directory for this skill: /Users/victor/.claude/skills/committing-changes

# Committing Changes

Create git commits for changes made during this session.

## Process

1. **Analyze changes:**
   - Run `git status` and `git diff` to understand modifications
   - Consider whether changes should be one or multiple logical commits

2. **Plan commits:**
   - Group related files together
   - Draft clear commit messages in imperative mood
   - Focus on why changes were made

3. **Execute upon conf...

