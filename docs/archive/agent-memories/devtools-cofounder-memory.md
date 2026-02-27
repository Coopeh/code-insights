# DevTools Cofounder Memory (Archived from code-insights-web)

> Archived on 2026-02-27 as part of the local-first migration (Phase 1).
> Original location: `code-insights-web/.claude/agent-memory/devtools-cofounder/MEMORY.md`

## Key Strategic Decisions

### Local-First Migration (2026-02-27) -- ACTIVE
- **Decision**: Migrate from BYOF (Firebase/Supabase) to fully local-first (SQLite + embedded SPA dashboard)
- **Founder rationale**: OSS portfolio project, no monetization. Firebase kills contributor accessibility.
- **My position**: Initially recommended staying hosted. Overridden by founder. Accepted. Reviewed the migration plan and recommended PROCEED WITH CHANGES.
- **Migration plan**: `/code-insights/docs/plans/2026-02-27-local-first-migration.md`
- **Key additions I recommended**: zero-config `npx` first run, README-as-product-page, provider contribution guide, LLM analysis as headline differentiator, terminal recording for landing page, npm size verification early
- See `local-first-review-notes.md` for full review details

### BYOF Architecture Direction (2026-02-23) -- SUPERSEDED
- **Superseded by**: Local-first migration decision (2026-02-27)
- Was: CLI-as-analytics-engine with materialized views in Firestore
- Now: Single-repo local-first with SQLite

### Product Category -- UPDATED
- **Current**: OSS "AI Coding Analytics" tool (portfolio project)
- **Previous**: "Personal AI Coding Analytics" SaaS
- **Evolution path**: N/A (no monetization planned)
- **New positioning**: "Developer tool that just works" not "privacy tool with friction"
- **Tagline direction**: "AI-powered insights into your AI coding sessions"

### Competitive Positioning -- UPDATED
- **Moat**: (1) LLM-powered session analysis (unique in category), (2) Multi-source provider abstraction, (3) Conversation replay with tool visualization
- **Direct competitors now**: ccusage, cass, ccmanager (all CLI-only, no dashboard, no LLM analysis)
- **Key differentiator**: No competing tool offers LLM analysis of sessions. Lead with this.
- **SQLite as selling point**: Portable, queryable, backupable single file. Promote this explicitly.

### Value Split -- UPDATED (single repo now)
- CLI: parse, sync to SQLite, `stats` commands, `summary` command, `doctor` command
- Dashboard (embedded SPA): visualization, LLM insights, conversation replay, export
- Server (Hono): API layer between SPA and SQLite, LLM proxy

## Adoption Strategy
- **P0**: `npx @code-insights/cli` must work zero-config (auto-detect, sync, open dashboard)
- **P0**: Dashboard must handle "no data" and "no LLM config" gracefully
- **P1**: README as product page (screenshots, terminal recording, one-command install)
- **P1**: Provider contribution guide as primary community contribution surface
- **P2**: `code-insights doctor` command (Homebrew/Flutter pattern)
- **P2**: Landing page at code-insights.app with terminal recording + screenshots
- **Risk**: npm package size with bundled SPA -- verify early in Phase 3

## OSS Growth Levers
- GitHub Topics: claude-code, cursor, ai-coding-tools, developer-analytics, local-first
- GitHub Releases with changelogs (v3.0.0 is a marketing event)
- .github/ directory with issue templates, PR templates
- README badges (npm version, license, stars, Node version)
- Terminal recording (asciinema or VHS from Charm)
- `code-insights summary` for shareable CLI output
- GitHub Actions integration (stretch goal, viral distribution)
