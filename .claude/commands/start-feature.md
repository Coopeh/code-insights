# /start-feature — Auto-Setup Feature Development Team

**Feature**: $ARGUMENTS

You are setting up a hybrid agent team for feature development. The PM agent leads the team and owns the ceremony. Your job is minimal setup, then hand control to PM.

---

## Step 1: Create Git Worktree

Slugify the feature description into a branch name:
- Take `$ARGUMENTS`, lowercase it, replace spaces/special chars with hyphens, truncate to 50 chars
- Prefix with `feature/` (e.g., "add demo mode onboarding" -> `feature/add-demo-mode-onboarding`)

```bash
# Example (adapt the slug from $ARGUMENTS):
BRANCH_NAME="feature/<slugified-arguments>"
git fetch origin
git worktree add ../code-insights-${BRANCH_NAME#feature/} -b ${BRANCH_NAME} origin/main
```

If the worktree or branch already exists, inform the user and ask how to proceed.

Run `pnpm install` in the worktree:
```bash
cd ../code-insights-${BRANCH_NAME#feature/} && pnpm install
```

---

## Step 2: Create Named Team

Create the team using TeamCreate. Use the slugified branch name (without `feature/` prefix) as the team name:

```
TeamCreate {
  team_name: "feat-<slugified-arguments>",
  description: "Feature team: $ARGUMENTS"
}
```

---

## Step 3: Spawn PM as Team Lead

The PM agent is the **team lead**. It owns the entire ceremony from here — scoping, GitHub Issues, task graph creation, agent spawning, and coordination.

```
Task {
  name: "pm-agent",
  subagent_type: "product-manager",
  team_name: "feat-<slugified-arguments>",
  prompt: "You are the PM and TEAM LEAD for this feature team.

FEATURE REQUEST: $ARGUMENTS
WORKTREE: ../code-insights-<slugified-arguments>/
BRANCH: feature/<slugified-arguments>
TEAM: feat-<slugified-arguments>

You own the entire development ceremony. Follow your Team Lead protocol:

1. SCOPE: Read docs in docs/ and CLAUDE.md to understand what this feature involves. Check for existing design docs in docs/plans/. Check docs/architecture/ for architecture context. If the scope is unclear, use SendMessage to ask the user (team lead can message the orchestrator) for clarification before proceeding.

2. ISSUES: Search for an existing GitHub Issue that matches this feature. If one exists, use it. If not, create one with proper description, acceptance criteria, and T-shirt size. Record the issue number.

3. TASK GRAPH: Create the ceremony tasks using TaskCreate, then set dependencies with TaskUpdate:
   - Task: 'TA: Review architecture alignment' (no dependencies) -- SKIP if internal-only (new components, UI, styling)
   - Task: 'PM: Prepare handoff context in GitHub Issue' (no dependencies, you do this yourself)
   - Task: 'Dev: Read handoff and design docs, prepare questions' (blockedBy: both above)
   - Task: 'Dev + TA: Reach consensus on implementation approach' (blockedBy: above) -- SKIP if internal-only
   - Task: 'Dev: Implement feature in worktree' (blockedBy: above)
   - Task: 'Dev: Create PR and run CI checks' (blockedBy: above)
   - Task: 'Review: Triple-layer code review' (blockedBy: above)
   - Task: 'Post review summary to GitHub PR' (blockedBy: above)

4. SPAWN TA (if needed): After creating tasks, spawn the TA agent:
   Task {
     name: 'ta-agent',
     subagent_type: 'technical-architect',
     team_name: 'feat-<slugified-arguments>',
     prompt: 'You are the TA for feature team feat-<slugified-arguments>. Feature: $ARGUMENTS. Check TaskList for your assigned tasks. Use SendMessage to communicate with pm-agent and later dev-agent. Mark tasks in_progress when starting, completed when done.',
     mode: 'bypassPermissions'
   }
   Assign the TA architecture review task to ta-agent.

   SKIP TA if the feature is internal-only (new components, UI fixes, styling, LLM provider additions). In that case, mark the TA task as completed with note 'Skipped -- internal-only change'.

5. DO YOUR OWN TASK: Work on your handoff task -- prepare context in the GitHub Issue (description, acceptance criteria, relevant doc paths, implementation guidance).

6. SPAWN DEV: When prerequisites are completed, spawn the Dev agent:
   Task {
     name: 'dev-agent',
     subagent_type: 'engineer',
     team_name: 'feat-<slugified-arguments>',
     prompt: 'You are the Dev for feature team feat-<slugified-arguments>. Feature: $ARGUMENTS. Worktree: ../code-insights-<slugified-arguments>/. All code work happens in the worktree. Check TaskList for your tasks. Use SendMessage to communicate with ta-agent for consensus. Mark tasks in_progress/completed.',
     mode: 'bypassPermissions'
   }
   Assign the next unblocked dev task to dev-agent.

7. MONITOR: Check TaskList periodically. When Dev creates a PR (Task 6 complete), message the orchestrator to trigger /start-review on the PR number.

8. REPORT: When review is posted (Task 8 complete), message the orchestrator: 'PR #XX for $ARGUMENTS is ready for founder review and merge.'

IMPORTANT RULES:
- NEVER merge PRs -- founder-only
- All dev work happens in the worktree
- If you need user clarification, message the orchestrator who will ask the user
- You can message teammates directly via SendMessage for routine coordination
- Task dependencies enforce ceremony order -- don't skip steps
- CI gate for this project: pnpm build (no test framework yet)",
  mode: "bypassPermissions"
}
```

---

## Step 4: Supervise

After spawning PM, your role shifts to supervisor:

1. **PM will handle everything** — task graph, GitHub Issues, spawning TA and Dev
2. **Intervene only when**:
   - PM messages you asking for user clarification -> relay to user
   - An agent is stuck or reports a blocker -> help unblock
   - PM requests `/start-review` -> run the review command on the PR
3. **When PM reports "ready for merge"** -> inform the user

---

## Step 5: Cleanup (After PR Merge)

After the founder merges the PR:

1. Send shutdown requests to all teammates (pm-agent, ta-agent, dev-agent)
2. Delete the team: `TeamDelete`
3. Clean up worktree:
```bash
git worktree remove ../code-insights-<slugified-arguments>
```
4. Confirm cleanup is complete

---

## Important Rules

- **NEVER merge the PR** — founder-only
- **PM is the team lead** — it creates tasks, spawns agents, and coordinates the ceremony
- **Orchestrator supervises** — relay user messages, handle exceptions, run /start-review when requested
- **All dev work happens in the worktree**
- **Task dependencies enforce ceremony order** — agents can't skip steps
- **TA is optional** for internal-only changes — PM decides based on scope
