# Technical Architect Memory (Archived from code-insights-web)

> Archived on 2026-02-27 as part of the local-first migration (Phase 1).
> Original location: `code-insights-web/.claude/agent-memory/technical-architect/MEMORY.md`

## Project Architecture (Verified 2026-02-19)

### Cross-Repo Type Contract
- CLI types: `../code-insights/cli/src/types.ts` (source of truth)
- Web types: `src/lib/types.ts` (mirror, manually synced)
- Key difference: CLI `ToolCall.input` is `Record<string, unknown>`, web is `string` (serialized on write)
- All new Firestore fields MUST be optional for backward compatibility

### Firestore Collections
- `projects`, `sessions`, `messages` written by CLI (Admin SDK)
- `insights` written by web (Client SDK)
- `stats/usage` singleton doc written by CLI (atomic increments)
- Usage stats fields on sessions/projects are optional (added after launch)

### Auth Architecture
- Supabase Auth for authentication only (no user data in Supabase)
- Firebase BYOF for all user data (no Firebase Auth used)
- Middleware uses `getUser()` not `getSession()` for server-side JWT validation

### LLM Analysis
- Runs in browser, user's API keys in localStorage
- 4 providers: OpenAI, Anthropic, Gemini, Ollama
- Token cap: 80,000 input. Chunks messages if exceeded.
- Analysis version: 2.0.0
- Anthropic needs `anthropic-dangerous-direct-browser-access: true` header

### CLI Sync Pipeline
- Discovers JSONL in `~/.claude/projects/` (including `subagents/` subdirs)
- Sync state tracks file mtime (not line position)
- Crash-safe: state saved after each file
- `--force` triggers full recalculation of usage stats

### Key Gaps (Remaining)
- No incremental line tracking (re-parses full files)
- No concurrent sync protection (lock file)
- Analytics hooks limited to 500 sessions / 1000 insights
- See `docs/architecture/11-gaps-and-improvements.md` for full list

### Completed Gaps (as of 2026-02-20)
- Thinking content + tool results: **DONE** (separate fields on Message, not appended to content)
- Per-message usage (MessageUsage): **DONE** on assistant messages
- sourceTool field: **DONE** (`'claude-code'` set by CLI)
- Session delete: **DONE** (`src/lib/firestore/sessions.ts`, cascading)
- Per-session export: **DONE** (Download dropdown, 3 formats)
- Recurring insight detection: **DONE** (findRecurringInsights + linkedInsightIds)
- Truncation: thinking 5k, tool output 2k, content 10k, tool input 1k

### JSONL Format Details (Verified 2026-02-19)
- `thinking` part: `{ type: 'thinking', thinking: string }` on assistant msgs
- `tool_use` part: `{ type: 'tool_use', id: string, name: string, input: object }` on assistant msgs
- `tool_result` part: `{ type: 'tool_result', tool_use_id: string, content: string | Array<{type, text}> }` on user msgs
- `usage` on `message.usage`: includes `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `service_tier`, `inference_geo`
- `tool_use` has a `caller` field (not needed for our purposes)

### Multi-Tool Vision
- Cursor support planned as first expansion (SQLite `state.vscdb`)
- Provider interface design in `docs/architecture/12-cursor-support-plan.md`
- `sourceTool` field now on sessions (set to `'claude-code'` by CLI)
- Existing docs: `../code-insights/docs/MULTI-TOOL-VISION.md`

### Architecture Docs (Updated 2026-02-20)
- 13 docs in `docs/architecture/` with comprehensive Mermaid diagrams
- Schema versioned: v1.0 -> v1.1 (usage stats) -> v1.2 (linkedInsightIds) -> v1.3 (thinking/toolResults/usage/sourceTool)
- 09-data-flow-diagrams.md has 12 diagrams covering all major flows

### Build/Deploy
- Web: master branch auto-deploys to Vercel
- CLI: npm package `code-insights` v1.0.0
- MUST run `pnpm build` before any push to master
- Env vars: only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
