# /start-review — Triple-Layer Code Review Team

**PR**: $ARGUMENTS

You are setting up a triple-layer code review for PR `$ARGUMENTS`. This can be used standalone or as part of a `/start-feature` team workflow. The review loops until all FIX NOW items are resolved — it does NOT end after a single pass.

---

## Step 1: Get PR Details

Fetch the PR details:

```bash
# Get the correct owner from git remote
git remote get-url origin | sed 's/.*[:/]\([^/]*\)\/[^/]*\.git/\1/'
```

Use `gh pr view $ARGUMENTS` to get PR title, description, and diff stats.
Use `gh pr diff $ARGUMENTS` to get the diff.

Determine the PR scope:
- Count files changed and lines changed
- Identify if it touches schema concerns (types.ts, SQLite schema, server API)
- Decide if Wild Card reviewer is needed (see criteria below)

---

## Step 2: Determine Review Scope

**Invoke Wild Card (3rd reviewer) if ANY of these apply:**
- New feature with multiple files changed
- Complex business logic
- Schema impact (types.ts, SQLite migrations, server API changes)
- Architectural changes
- 200+ lines of changes

**Skip Wild Card if ALL of these apply:**
- Simple bug fix (< 50 lines)
- Single file change
- Straightforward UI/component change
- Config/CI changes only

**Invoke LLM Expert (4th reviewer) if ANY of these apply:**
- PR touches `server/src/llm/` (prompts, providers, export-prompts)
- PR adds or modifies LLM API calls
- PR changes structured output schemas or SSE streaming
- PR modifies token budgets or model selection logic
- PR adds new LLM-powered features

**Skip LLM Expert if ALL of these apply:**
- No LLM code touched
- Pure UI, CLI, or schema changes
- Provider (source tool) implementations only

---

## Step 2.5: Pre-Review Gates

Before launching reviewers, check these gates. If any gate fails, the review CANNOT proceed — send the PR back to the dev agent (or inform the user if standalone) with what's missing.

### Gate A: New Dependency Audit

Check if `package.json` (any workspace) was modified in the PR diff.

If new dependencies were added:

```
Task {
  name: "dep-auditor",
  subagent_type: "Explore",
  prompt: "Research the following new npm dependencies added in PR #$ARGUMENTS. For EACH dependency:

  1. Search the library's GitHub issues for known limitations, gotchas, and common pitfalls
  2. Read the library's README for caveats, browser compatibility notes, and unsupported features
  3. Check if the library has specific CSS, rendering, or serialization constraints
  4. Check the library's weekly downloads and last publish date (is it maintained?)

  Output a structured report:
  ## Dependency Audit: [package-name]
  ### Known Limitations
  ### Gotchas for Our Use Case
  ### Risk Level (low/medium/high)
  ### Recommendation

  Be thorough — silent failures from library limitations are the hardest bugs to catch in code review.",
  mode: "bypassPermissions"
}
```

Include the dependency audit findings in the context given to ALL reviewers.

### Gate B: Functional Verification Evidence

Check the PR description for a **Verification** section. The dev agent is required to include:

- **For all PRs**: Build passes (`pnpm build` output or confirmation)
- **For UI/visual features**: Screenshot of the feature rendering in the browser
- **For features that produce output** (image export, PDF, file download): The actual output artifact or proof it's non-empty (file size, screenshot of result)
- **For API changes**: curl output showing the endpoint returns the expected response shape

If the PR description lacks verification evidence:
- **If part of /start-feature**: Message the dev agent via SendMessage: "PR is missing verification evidence. Add a Verification section to the PR description with [specific evidence needed]. See the pre-PR verification protocol."
- **If standalone**: Inform the user the PR needs verification evidence before review can proceed.

**Do NOT proceed to Step 3 until verification evidence is present.**

### Gate C: Visual Output Check (Conditional)

If the PR produces visual output (images, PDFs, charts, OG cards, share cards, exports):
- The exported/generated artifact MUST be attached to or linked from the PR description
- A reviewer must be able to visually inspect the output without running the code
- If missing, send PR back with: "This PR produces visual output — attach the generated artifact to the PR description."

---

## Step 3: Run Parallel Independent Reviews (Round N)

**CRITICAL**: All reviews run in parallel. No reviewer sees another's comments. This prevents bias.

Track the current round number. Round 1 is the initial review. Round 2+ are follow-up reviews after fixes.

**For Round 1**: Launch all applicable reviewers (TA, Outsider, Wild Card, LLM Expert).
**For Round 2+**: Launch only targeted reviewers — those whose prior findings had FIX NOW items that were addressed. Skip reviewers whose prior findings were all resolved or NOT APPLICABLE.

**Launch TA Insider Review:**
```
Task {
  name: "ta-reviewer",
  subagent_type: "technical-architect",
  prompt: "You are performing a Phase 1 INSIDER review of PR #$ARGUMENTS in the code-insights repo. This is review ROUND [N].

  Fetch the PR diff using: gh pr diff $ARGUMENTS
  Also fetch the PR details: gh pr view $ARGUMENTS

  Follow your Phase 1 review protocol:
  1. Read the PR description and any linked GitHub Issue
  2. Check if the change touches schema concerns (types.ts, SQLite schema)
  3. Review code against existing patterns in the codebase
  4. Check existing CLAUDE.md conventions compliance
  5. Verify data contract patterns are followed (if data flow changed)
  6. Check shadcn/ui and component conventions (if UI changes)

  ADDITIONAL CHECKS:
  7. If new dependencies were added, review the dependency audit findings: [INSERT DEP AUDIT IF APPLICABLE]
  8. If the PR produces visual output, verify the attached artifact looks correct
  9. Check that verification evidence in the PR description is credible (not just 'it works')

  [FOR ROUND 2+: Focus on verifying the fixes for these specific items from Round [N-1]: [LIST PRIOR FIX NOW ITEMS]. Also check that fixes didn't introduce new issues.]

  Output your review in the structured format:
  ## TA Review (Phase 1 - Insider): [PR Title] — Round [N]
  ### Architecture Alignment
  ### Issues Found (with priority markers: 🔴 FIX NOW, 🟡 SUGGESTION, 🔵 NOTE)
  ### Phase 1 Verdict

  DO NOT look at any other review comments. Your review must be independent.",
  mode: "bypassPermissions"
}
```

**Launch Outsider Review:**
```
Task {
  name: "outsider-reviewer",
  subagent_type: "superpowers:code-reviewer",
  prompt: "You are performing an independent OUTSIDER review of PR #$ARGUMENTS in the code-insights repo. This is review ROUND [N].

  Fetch the PR diff using: gh pr diff $ARGUMENTS

  Review for:
  - Security issues (XSS, injection, auth bypass)
  - Best practices (React, TypeScript, Node.js)
  - Logic bugs and edge cases
  - Performance concerns
  - Accessibility issues
  - Third-party library misuse (check if APIs are used correctly per their docs)

  [FOR ROUND 2+: Focus on verifying the fixes for these specific items from Round [N-1]: [LIST PRIOR FIX NOW ITEMS]. Also check that fixes didn't introduce new issues.]

  Output a structured review with findings categorized as:
  - 🔴 FIX NOW (blocking — must fix before merge)
  - 🟡 SUGGESTION (recommended but not blocking)
  - 🔵 NOTE (informational)",
  mode: "bypassPermissions"
}
```

**Launch LLM Expert Review (if applicable):**
```
Task {
  name: "llm-expert-reviewer",
  subagent_type: "llm-expert",
  prompt: "You are performing an independent LLM EXPERT review of PR #$ARGUMENTS in the code-insights repo. This is review ROUND [N].

  Fetch the PR diff using: gh pr diff $ARGUMENTS
  Also fetch the PR details: gh pr view $ARGUMENTS

  Review all LLM-related code for:
  - Prompt quality: clarity, specificity, output format constraints
  - Token efficiency: redundant instructions, over-prompting, prompt stuffing
  - Output consistency: structured output schemas, JSON mode, enum enforcement
  - Model selection: is the chosen model appropriate for the task complexity?
  - Resilience: handling malformed LLM output, timeouts, retries, rate limits
  - Cross-model compatibility: prompts that only work with one model family
  - Cost implications: token budget estimates, unnecessary Opus/GPT-4 usage for simple tasks
  - Streaming patterns: SSE implementation, partial response handling

  Rate each prompt on: clarity (1-5), token efficiency (1-5), output consistency (1-5), resilience (1-5).

  [FOR ROUND 2+: Focus on verifying the fixes for these specific items from Round [N-1]: [LIST PRIOR FIX NOW ITEMS]. Also check that fixes didn't introduce new issues.]

  Output your review in the structured format:
  ## LLM Expert Review: [PR Title] — Round [N]
  ### Prompt Quality Assessment
  ### Token Efficiency
  ### Model Selection
  ### Issues Found (with priority markers: 🔴 FIX NOW, 🟡 SUGGESTION, 🔵 NOTE)
  ### Recommendations

  DO NOT look at any other review comments. Your review must be independent.",
  mode: "bypassPermissions"
}
```

**Launch Wild Card Review (if applicable):**
```
Task {
  name: "wildcard-reviewer",
  subagent_type: "superpowers:code-reviewer",
  prompt: "You are performing an independent WILD CARD review of PR #$ARGUMENTS in the code-insights repo. This is review ROUND [N].

  Fetch the PR diff using: gh pr diff $ARGUMENTS

  Your role is to provide a fresh perspective with NO constraints:
  - Challenge assumptions in the implementation
  - Look for edge cases others might miss
  - Question whether the approach is the simplest that could work
  - Check for hidden complexity or tech debt being introduced
  - Look at error handling from a user's perspective
  - If new dependencies were added, think about what could go wrong at runtime (not just in code review)

  [FOR ROUND 2+: Focus on verifying the fixes for these specific items from Round [N-1]: [LIST PRIOR FIX NOW ITEMS]. Also check that fixes didn't introduce new issues.]

  Output a structured review with findings categorized as:
  - 🔴 FIX NOW (blocking — must fix before merge)
  - 🟡 SUGGESTION (recommended but not blocking)
  - 🔵 NOTE (informational)",
  mode: "bypassPermissions"
}
```

Wait for ALL reviews to complete before proceeding.

---

## Step 4: TA Synthesis

After all reviews are collected, launch the TA synthesis pass:

```
Task {
  name: "ta-synthesizer",
  subagent_type: "technical-architect",
  prompt: "You are performing Phase 2 SYNTHESIS for PR #$ARGUMENTS. This is review ROUND [N].

  The orchestrator will provide you with the independent review outputs (outsider, wild card if applicable, and LLM expert if applicable).

  Follow your Phase 2 synthesis protocol:
  1. Read all review comments (outsider, wild card, LLM expert)
  2. Re-review the PR with all reviews in context
  3. For each outsider/wild card/LLM expert comment, evaluate:
     - Does this conflict with project patterns or conventions?
     - Is this a valid point that should be applied?
     - Did you miss this in Phase 1?
  4. For each comment: AGREE or PUSHBACK WITH REASON
  5. Create the consolidated final list

  Output in the structured format:
  ## TA Synthesis (Phase 2): [PR Title] — Round [N]
  ### Review of Outsider Comments
  ### Second Pass Findings
  ### Consolidated Review (For Dev Agent)
  - 🔴 FIX NOW items (MUST be resolved before merge)
  - ❌ NOT APPLICABLE items with technical rationale
  - ⚠️ ESCALATE TO FOUNDER items with reason
  - 🟡 SUGGESTIONS (non-blocking, dev's discretion)
  ### Final Verdict: [PASS — ready for merge | CHANGES REQUIRED — Round [N+1] needed]",
  mode: "bypassPermissions"
}
```

---

## Step 5: Deliver Results & Loop Decision

After synthesis is complete, check the Final Verdict:

### If PASS (0 FIX NOW items):

1. **Post final review summary to GitHub PR** (see template below)
2. **If part of /start-feature**: Message the PM agent that review is complete and PR is ready for founder merge.
3. **If standalone**: Inform the user the PR is approved.

### If CHANGES REQUIRED (1+ FIX NOW items):

1. **Post round summary to GitHub PR** (see template below)
2. **Send FIX NOW items to dev agent** (or user if standalone):
   - List each FIX NOW item with clear description of what needs to change
   - Reference specific files and line numbers where possible
3. **Wait for fixes to be pushed** — dev agent pushes fix commits to the PR branch
4. **After fixes are pushed**: Dev must re-verify (build passes, and if visual: re-attach updated artifact)
5. **Go back to Step 3** with Round N+1, targeting only the reviewers whose areas were affected

### Loop Safety

- **Max 4 rounds** — if FIX NOW items remain after 4 rounds, ESCALATE TO FOUNDER with full context
- **Round 2+ is targeted** — only re-invoke reviewers whose prior FIX NOW items were addressed (don't re-run all 4 reviewers for a one-line fix)
- **New issues found during fix verification count as new FIX NOW items** — the loop continues

### PR Comment Template

```bash
gh pr comment $ARGUMENTS --body "$(cat <<'EOF'
## Triple-Layer Code Review — Round [N] of [TOTAL]

### Reviewers
| Role | Focus | This Round |
|------|-------|------------|
| TA (Insider) | Pattern compliance, schema impact, architecture | [Active/Skipped] |
| Outsider | Security, best practices, logic bugs | [Active/Skipped] |
| LLM Expert | Prompt quality, token efficiency, model selection | [Active/Skipped/N/A] |
| Wild Card | Edge cases, fresh perspective | [Active/Skipped/N/A] |

### Pre-Review Gates
- [ ] New dependency audit: [PASS/N/A]
- [ ] Functional verification evidence: [PASS — describe what was verified]
- [ ] Visual output attached: [PASS/N/A]

### Issues Found & Resolution
#### 🔴 FIX NOW
[List from synthesis — empty if PASS]

#### ❌ NOT APPLICABLE
[List with technical rationale]

#### 🟡 SUGGESTIONS
[Non-blocking items]

### Verification
[Status of fixes if any were applied]

**Round [N] verdict: [PASS — Ready for merge | CHANGES REQUIRED — see FIX NOW items]**
EOF
)"
```

---

## Important Rules

- **NEVER merge the PR** — founder-only
- **Reviews MUST be independent** — no reviewer sees another's output during Phase 1
- **TA synthesis is authoritative** — TA can mark outsider comments as "NOT APPLICABLE" with technical justification
- **Always post summary to GitHub PR** — this creates the audit trail
- **Review loops until 0 FIX NOW items** — a single pass is not sufficient if blocking issues exist
- **Pre-review gates are mandatory** — missing verification evidence blocks the review from starting
- **Max 4 rounds** — escalate to founder if review doesn't converge
- **Round 2+ is targeted** — don't waste reviewer cycles re-reviewing areas with no changes
