# Local-First Architecture Migration Plan

**Date:** 2026-02-27
**Author:** Technical Architect
**Status:** Draft -- Awaiting Founder Approval

---

## Executive Summary

Migrate Code Insights from a two-repo cloud architecture (CLI + hosted web dashboard backed by Firebase/Supabase) to a single-repo local-first architecture. The CLI repo becomes the sole repository. The web dashboard becomes a pre-built SPA served by a local HTTP server via `code-insights dashboard`. Firebase, Supabase, and Vercel are removed entirely. All data lives in SQLite at `~/.code-insights/data.db`. The domain `code-insights.app` becomes a static landing page.

Think of it like converting a client-server SaaS into a desktop application with a browser UI -- similar to how Grafana or pgAdmin work. The CLI is the engine, SQLite is the database, and a bundled SPA is the windshield.

### Key Decisions Up Front

1. **Vite + React SPA** replaces Next.js (no SSR needed for localhost)
2. **Hono** replaces Express for the API server (lightweight, TypeScript-native, works on all runtimes)
3. **better-sqlite3** is already a dependency -- extend it from Cursor-only to the primary data store
4. **All LLM calls move server-side** -- the Hono API proxies them, eliminating browser CORS issues
5. **No auth** -- localhost only, single user
6. **pnpm workspace** for monorepo management (CLI + dashboard packages)

### Phased Execution Order

```
Phase 1: Claude Workspace Migration       [S]  ~1 day     No code changes
Phase 2: Data Layer Migration              [L]  ~3-4 days  SQLite schema + write path
Phase 3: Dashboard Embedding               [L]  ~4-5 days  Vite SPA + Hono server + API
Phase 4: Feature Parity Audit + Port       [L]  ~3-4 days  Port all web pages/components
Phase 5: Telemetry                         [S]  ~0.5 day   Already exists, minor changes
Phase 6: Cleanup & Cutover                 [M]  ~1-2 days  Repo archival, npm publish
```

Phases 1 and 2 can start in parallel. Phase 3 depends on Phase 2. Phase 4 depends on Phase 3. Phase 5 is independent. Phase 6 is last.

---

## Phase 1: Claude Workspace Migration

**Goal:** Consolidate all `.claude/` configuration into the CLI repo so it is the single development hub.

**Complexity:** S (file moves and edits, no code changes)

### 1.1 Agent Audit -- Which Agents Survive?

| Agent (web repo) | Keep? | Rationale |
|---|---|---|
| `technical-architect` | YES -- adapt | Still needed for architecture decisions, but references change to single-repo paths |
| `fullstack-engineer` | YES -- rename to `engineer` | No longer "fullstack" (no separate backend). Becomes the primary implementation agent. |
| `web-engineer` | MERGE into `engineer` | Distinction was web-vs-CLI. In a single repo, one `engineer` agent handles everything. |
| `ux-engineer` | YES -- keep | Still relevant for dashboard UI work |
| `ux-designer` | YES -- keep | Wireframes and UX validation still needed |
| `product-manager` | YES -- adapt | Scope changes, roadmap changes, but role is the same |
| `journey-chronicler` | YES -- keep | No changes needed |
| `devtools-cofounder` | EVALUATE | If the portfolio nature reduces strategic planning, this may be redundant. Founder decision. |

### 1.2 Files to Move

**From `code-insights-web/.claude/agents/` to `code-insights/.claude/agents/`:**

| Source | Destination | Action |
|---|---|---|
| `technical-architect.md` | `technical-architect.md` | Merge with any CLI-repo version, update all path references |
| `fullstack-engineer.md` + `web-engineer.md` | `engineer.md` | Merge into single agent definition |
| `ux-engineer.md` | `ux-engineer.md` | Copy, update path references |
| `ux-designer.md` | `ux-designer.md` | Copy, update path references |
| `product-manager.md` | `product-manager.md` | Copy, update path references |
| `journey-chronicler.md` | `journey-chronicler.md` | Copy, update path references |
| `devtools-cofounder.md` | `devtools-cofounder.md` | Copy if kept |

**From `code-insights-web/.claude/commands/` to `code-insights/.claude/commands/`:**

| Source | Destination | Action |
|---|---|---|
| `start-feature.md` | `start-feature.md` | Copy, update worktree paths and agent references |
| `start-review.md` | `start-review.md` | Copy, update PR review workflow |

**From `code-insights-web/.claude/` (hookify rules):**

All hookify rules move as-is. These are already nearly identical between repos. Consolidate:
- `hookify.block-pr-merge.local.md` -- keep
- `hookify.branch-discipline.local.md` -- keep
- `hookify.review-before-pr.local.md` -- keep
- `hookify.review-before-pr-mcp.local.md` -- keep
- `hookify.agent-parallel-warning.local.md` -- keep
- `hookify.no-jira.local.md` -- keep
- `hookify.cli-binary-name.local.md` -- keep
- `hookify.cross-repo-type-sync.local.md` -- **REMOVE** (no more cross-repo type sync)

### 1.3 CLAUDE.md Consolidation

The root `codeInsights/CLAUDE.md` and `code-insights-web/CLAUDE.md` merge into a single `code-insights/CLAUDE.md`. Key changes:

| Section | Action |
|---|---|
| Repository Structure | Rewrite: single repo, `cli/` + `dashboard/` packages |
| Quick Reference table | Simplify: one repo, one package manager, one build |
| Multi-Agent Orchestration | Keep agent suite, drop web-engineer, add `engineer` |
| Development Ceremony | Keep 10-step ceremony, simplify path references |
| Firestore Schema | Replace with SQLite Schema section |
| Firebase Config / Supabase Auth | Remove entirely |
| Firestore Hooks | Replace with "Data Hooks (SQLite via API)" |
| LLM Analysis | Update: server-side calls via Hono API |
| Tech Stack | Update: remove Next.js/Firebase/Supabase, add Vite/Hono/SQLite |
| Deployment | Remove Vercel; add `code-insights dashboard` docs |
| Branch Discipline | Simplify: `main` branch only (not master+main) |

### 1.4 Agent Memory

- `code-insights-web/.claude/agent-memory/` contents are session-specific and can be archived or discarded
- The `MEMORY.md` files contain useful historical context -- archive them in `docs/archive/agent-memories/` for reference

### 1.5 Risks

- **Risk:** Agent prompts reference web repo paths (`src/components/`, `src/lib/hooks/`). If not updated, agents will hallucinate file locations.
- **Mitigation:** Grep-and-replace all path references in agent markdown files. Verify with a dry run.

---

## Phase 2: Data Layer Migration

**Goal:** Replace Firebase Firestore with local SQLite as the single data store for all entities (projects, sessions, messages, insights).

**Complexity:** L (schema design, CLI write path, migration tooling)

**Dependencies:** None (can start in parallel with Phase 1)

### 2.1 SQLite Database Location

```
~/.code-insights/data.db          # Primary database
~/.code-insights/data.db-wal      # WAL mode journal (auto-created)
~/.code-insights/data.db-shm      # Shared memory (auto-created)
```

WAL mode is required for concurrent read/write (CLI syncs while dashboard reads).

### 2.2 Schema Design

The schema mirrors the Firestore collections but normalizes them into proper relational tables. The `better-sqlite3` driver supports synchronous operations which simplifies the CLI write path.

```sql
-- ============================================================
-- Schema version tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Projects
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,                -- hash of git remote or path
  name            TEXT NOT NULL,
  path            TEXT NOT NULL,
  git_remote_url  TEXT,
  project_id_source TEXT NOT NULL DEFAULT 'path-hash', -- 'git-remote' | 'path-hash'
  session_count   INTEGER NOT NULL DEFAULT 0,
  last_activity   TEXT NOT NULL,                   -- ISO 8601
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  -- Aggregated usage stats
  total_input_tokens    INTEGER DEFAULT 0,
  total_output_tokens   INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens     INTEGER DEFAULT 0,
  estimated_cost_usd    REAL DEFAULT 0
);

-- ============================================================
-- Sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id                    TEXT PRIMARY KEY,           -- UUID from source file
  project_id            TEXT NOT NULL REFERENCES projects(id),
  project_name          TEXT NOT NULL,
  project_path          TEXT NOT NULL,
  git_remote_url        TEXT,
  summary               TEXT,
  custom_title          TEXT,
  generated_title       TEXT,
  title_source          TEXT,                       -- 'claude' | 'user_message' | 'insight' | 'character' | 'fallback'
  session_character     TEXT,                       -- 'deep_focus' | 'bug_hunt' | ... | 'quick_task'
  started_at            TEXT NOT NULL,              -- ISO 8601
  ended_at              TEXT NOT NULL,
  message_count         INTEGER NOT NULL DEFAULT 0,
  user_message_count    INTEGER NOT NULL DEFAULT 0,
  assistant_message_count INTEGER NOT NULL DEFAULT 0,
  tool_call_count       INTEGER NOT NULL DEFAULT 0,
  git_branch            TEXT,
  claude_version        TEXT,
  source_tool           TEXT NOT NULL DEFAULT 'claude-code',
  device_id             TEXT,
  device_hostname       TEXT,
  device_platform       TEXT,
  synced_at             TEXT NOT NULL DEFAULT (datetime('now')),
  -- Usage stats
  total_input_tokens    INTEGER,
  total_output_tokens   INTEGER,
  cache_creation_tokens INTEGER,
  cache_read_tokens     INTEGER,
  estimated_cost_usd    REAL,
  models_used           TEXT,                       -- JSON array
  primary_model         TEXT,
  usage_source          TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_source_tool ON sessions(source_tool);

-- ============================================================
-- Messages
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,                     -- UUID from JSONL
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  type        TEXT NOT NULL,                        -- 'user' | 'assistant' | 'system'
  content     TEXT NOT NULL DEFAULT '',
  thinking    TEXT,
  tool_calls  TEXT,                                 -- JSON array
  tool_results TEXT,                                -- JSON array
  usage       TEXT,                                 -- JSON object (per-message usage)
  timestamp   TEXT NOT NULL,                        -- ISO 8601
  parent_id   TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(session_id, timestamp ASC);

-- ============================================================
-- Insights (written by dashboard, not CLI)
-- ============================================================
CREATE TABLE IF NOT EXISTS insights (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(id),
  project_id        TEXT NOT NULL REFERENCES projects(id),
  project_name      TEXT NOT NULL,
  type              TEXT NOT NULL,                  -- 'summary' | 'decision' | 'learning' | 'technique' | 'prompt_quality'
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  summary           TEXT NOT NULL,
  bullets           TEXT,                           -- JSON array
  confidence        REAL NOT NULL,
  source            TEXT NOT NULL DEFAULT 'llm',
  metadata          TEXT,                           -- JSON object
  timestamp         TEXT NOT NULL,                  -- session's endedAt
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  scope             TEXT NOT NULL DEFAULT 'session', -- 'session' | 'project' | 'overall'
  analysis_version  TEXT NOT NULL DEFAULT '1.0.0',
  linked_insight_ids TEXT                           -- JSON array
);

CREATE INDEX IF NOT EXISTS idx_insights_session_id ON insights(session_id);
CREATE INDEX IF NOT EXISTS idx_insights_project_id ON insights(project_id);
CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);
CREATE INDEX IF NOT EXISTS idx_insights_timestamp ON insights(timestamp DESC);

-- ============================================================
-- Global usage stats (single row, updated by CLI sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_stats (
  id                    INTEGER PRIMARY KEY CHECK (id = 1), -- singleton
  total_input_tokens    INTEGER DEFAULT 0,
  total_output_tokens   INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens     INTEGER DEFAULT 0,
  estimated_cost_usd    REAL DEFAULT 0,
  sessions_with_usage   INTEGER DEFAULT 0,
  last_updated_at       TEXT DEFAULT (datetime('now'))
);
```

### 2.3 Firestore-to-SQLite Field Mapping

| Firestore Convention | SQLite Convention | Notes |
|---|---|---|
| camelCase field names | snake_case column names | Standard SQL convention |
| Timestamp type | TEXT (ISO 8601) | SQLite has no native datetime; ISO strings sort correctly |
| Array fields | TEXT (JSON) | `bullets`, `tool_calls`, `models_used` stored as JSON arrays |
| Nested objects | TEXT (JSON) | `metadata`, `usage` stored as JSON objects |
| FieldValue.increment | SQL `UPDATE SET col = col + ?` | Direct arithmetic |
| Batch writes (500 limit) | SQLite transactions | No batch size limit |
| onSnapshot (real-time) | HTTP polling or SSE | See Phase 3.6 |

### 2.4 CLI Write Path Changes

**Current flow:**
```
Provider.parse() -> ParsedSession -> firebase/client.ts -> Firestore
```

**New flow:**
```
Provider.parse() -> ParsedSession -> db/client.ts -> SQLite
```

**Files to create:**

| File | Purpose |
|---|---|
| `cli/src/db/client.ts` | Database initialization, WAL mode, schema migrations |
| `cli/src/db/write.ts` | `insertSession()`, `insertMessages()`, `upsertProject()` -- replaces `firebase/client.ts` |
| `cli/src/db/read.ts` | `getProjects()`, `getSessions()`, `getMessages()`, etc. -- replaces Firestore reads |
| `cli/src/db/migrate.ts` | Schema version management (run on first use and upgrades) |

**Files to modify:**

| File | Change |
|---|---|
| `cli/src/commands/sync.ts` | Import `db/write.ts` instead of `firebase/client.ts` |
| `cli/src/commands/status.ts` | Query SQLite instead of Firestore |
| `cli/src/commands/stats/data/local.ts` | Read from SQLite instead of JSON cache file |
| `cli/src/commands/stats/data/cache.ts` | Retire -- SQLite replaces the JSON stats cache |
| `cli/src/commands/init.ts` | Remove Firebase credential prompts; add SQLite init |
| `cli/src/commands/connect.ts` | Remove -- no web dashboard to connect to |
| `cli/src/commands/open.ts` | Change to open `http://localhost:PORT` instead of `code-insights.app` |
| `cli/src/commands/reset.ts` | Add SQLite database reset option |

**Files to remove:**

| File | Reason |
|---|---|
| `cli/src/firebase/client.ts` | Replaced by `db/write.ts` + `db/read.ts` |
| `cli/src/utils/firebase-json.ts` | No longer needed -- no Firebase service accounts |

### 2.5 Stats Cache Migration

The current stats system uses a JSON file cache at `~/.code-insights/stats-cache.json`. This gets replaced:

```
Before: Provider.parse() -> stats-cache.json (SessionRow[]) -> stats commands
After:  Provider.parse() -> data.db (sessions table) -> stats commands
```

The `StatsCache` class (`cli/src/commands/stats/data/cache.ts`) is retired. The `LocalDataSource` class reads directly from SQLite. The mtime-based invalidation logic moves into the sync command (only re-parse files that changed since last sync -- same logic, different storage).

### 2.6 Sync State Migration

The current `~/.code-insights/sync-state.json` tracks which files have been synced. This can either:

**Option A:** Keep as JSON file (simpler, sync state is metadata about sync, not app data)
**Option B:** Move to a `sync_state` table in SQLite (all state in one place)

**Recommendation:** Option A -- keep as JSON. Sync state is an operational concern, not user data. Keeping it separate means `code-insights reset --data` can wipe the DB without losing sync state, and vice versa.

### 2.7 Config Simplification

**Current `~/.code-insights/config.json`:**
```json
{
  "firebase": { "projectId": "...", "clientEmail": "...", "privateKey": "..." },
  "webConfig": { "apiKey": "...", ... },
  "sync": { "claudeDir": "...", "excludeProjects": [] },
  "dashboardUrl": "https://code-insights.app",
  "dataSource": "firebase",
  "telemetry": true
}
```

**New `~/.code-insights/config.json`:**
```json
{
  "sync": {
    "claudeDir": "~/.claude/projects",
    "excludeProjects": []
  },
  "dashboard": {
    "port": 7890,
    "llm": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "apiKey": "sk-ant-..."
    }
  },
  "telemetry": true
}
```

All Firebase fields are removed. LLM config moves from browser localStorage to the config file (server-side API calls now). The `dataSource` field is removed -- there is only local.

### 2.8 Insights Write Path

Currently, insights are written by the web dashboard (browser -> Firestore). In the new architecture:

```
Dashboard SPA -> POST /api/insights -> Hono server -> SQLite
```

The LLM analysis code (`analysis.ts`, `prompts.ts`) moves server-side into the Hono API layer. The SPA sends a "analyze this session" request, the server fetches messages from SQLite, calls the LLM API, and writes results back to SQLite.

### 2.9 Risks

- **Risk:** `better-sqlite3` is a native Node addon. It requires compilation on install. Users on older systems or unusual architectures may hit build failures.
- **Mitigation:** It is already a CLI dependency (for Cursor parsing) and has prebuilt binaries for all major platforms. This is a known, solved problem.

- **Risk:** WAL mode allows concurrent readers but only one writer. If the CLI syncs while the dashboard server writes insights, one will block.
- **Mitigation:** SQLite's default busy timeout handles this. Set `PRAGMA busy_timeout = 5000` to wait up to 5 seconds. Writes are fast (milliseconds), so contention is minimal.

- **Risk:** Users with existing Firestore data lose access to historical insights.
- **Mitigation:** Provide a one-time `code-insights migrate --from-firestore` command (Phase 6 stretch goal). For Phase 2, document that this is a clean break -- re-sync from source files and re-analyze.

---

## Phase 3: Dashboard Embedding

**Goal:** Bundle the web dashboard as a pre-built SPA inside the npm package, served by a local Hono HTTP server via `code-insights dashboard`.

**Complexity:** L (new package, build pipeline, API layer)

**Dependencies:** Phase 2 (SQLite write path must be working)

### 3.1 Framework Choice: Vite + React SPA

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Keep Next.js** | Familiar codebase, less porting | 100MB+ node_modules, SSR is pointless for localhost, complex build | REJECT |
| **Vite + React SPA** | Tiny output (~2MB), fast builds, same React components, no SSR overhead | Must port router from App Router to client-side (react-router) | **CHOSEN** |
| **Astro** | Partial hydration, small output | Different component model, more porting work | REJECT |

**Why Vite wins:** We are serving a local tool to a single user on localhost. There is no SEO, no server-side rendering, no CDN edge caching. SSR adds zero value and significant complexity. A Vite SPA produces a `dist/` folder of static files that we bundle into the npm package. Think of it like Grafana's frontend -- pre-built, served from disk.

### 3.2 Monorepo Structure

```
code-insights/
  cli/                        # Existing CLI package
    src/
      commands/
        dashboard.ts          # NEW: starts Hono server
      db/                     # NEW: SQLite client (Phase 2)
      ...
    package.json              # @code-insights/cli
  dashboard/                  # NEW: Vite + React SPA
    src/
      app/                    # Pages (ported from Next.js app/ routes)
      components/             # React components (ported from web repo)
      lib/                    # Types, utils, hooks (ported from web repo)
        api.ts                # HTTP client (replaces Firestore SDK)
        types.ts              # Shared types (single source of truth)
        hooks/                # React Query hooks (replaces useFirestore.ts)
      main.tsx                # Vite entry point
    index.html
    vite.config.ts
    package.json              # @code-insights/dashboard (private, not published)
  server/                     # NEW: Hono API server
    src/
      index.ts                # Server entry, static file serving
      routes/                 # API routes
        projects.ts
        sessions.ts
        messages.ts
        insights.ts
        analysis.ts           # LLM analysis endpoints
        export.ts             # Markdown export endpoints
      llm/                    # LLM abstraction (ported from web repo)
        types.ts
        client.ts
        providers/            # OpenAI, Anthropic, Gemini, Ollama
        analysis.ts
        prompts.ts
    package.json              # @code-insights/server (private, not published)
  pnpm-workspace.yaml         # Workspace config
  package.json                # Root workspace
```

### 3.3 The `code-insights dashboard` Command

```typescript
// cli/src/commands/dashboard.ts

import { Command } from 'commander';
import { resolve } from 'path';

export const dashboardCommand = new Command('dashboard')
  .description('Start the Code Insights dashboard')
  .option('-p, --port <number>', 'Port number', '7890')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (options) => {
    const port = parseInt(options.port, 10);

    // Dynamic import to avoid loading server code for other commands
    const { startServer } = await import('@code-insights/server');

    await startServer({
      port,
      staticDir: resolve(__dirname, '../../dashboard/dist'),
      openBrowser: options.open !== false,
    });
  });
```

### 3.4 Hono API Server

**Why Hono over Express/Fastify:**
- TypeScript-native, zero configuration
- Tiny footprint (~14KB)
- Built-in static file serving middleware
- Same API patterns as Express but modern
- Works with Node.js, Deno, Bun -- future-proof

**Route structure:**

```
GET  /api/projects                    # List projects
GET  /api/sessions?projectId=&sourceTool=&limit=  # List sessions with filters
GET  /api/sessions/:id                # Single session
PATCH /api/sessions/:id               # Update custom title
GET  /api/messages/:sessionId?limit=&offset=  # Paginated messages
GET  /api/insights?projectId=&sessionId=&type=  # List insights
POST /api/insights                    # Save insights (from analysis)
DELETE /api/insights/:id              # Delete single insight
POST /api/analysis/session            # Trigger session analysis (LLM)
POST /api/analysis/prompt-quality     # Trigger prompt quality analysis
POST /api/analysis/recurring          # Find recurring insights
GET  /api/analytics/dashboard?range=  # Dashboard stats
GET  /api/analytics/usage             # Usage stats
POST /api/export/markdown             # Export to markdown
GET  /api/config/llm                  # Get LLM config (no API key)
PUT  /api/config/llm                  # Update LLM config
GET  /                                # Serve SPA index.html
/*                                    # Serve static assets, fallback to index.html
```

### 3.5 Static Asset Bundling

The dashboard is pre-built during `pnpm build` in the workspace. The build output goes to `dashboard/dist/`. The `server/` package references it via a path.

For npm publishing, the CLI's `package.json` `files` array includes the pre-built dashboard:

```json
{
  "files": [
    "dist",
    "../dashboard/dist",
    "../server/dist",
    "README.md"
  ]
}
```

Alternative (cleaner): The root workspace `prepublishOnly` script copies `dashboard/dist/` into `cli/dashboard-dist/`, and the CLI references that.

### 3.6 Real-Time Updates (Dashboard Detects New Data)

**Current:** Firestore `onSnapshot` provides real-time updates.

**Options for local:**

| Approach | Complexity | Latency | Verdict |
|---|---|---|---|
| **HTTP polling (5s interval)** | S | 5s | Good enough for v1 |
| **Server-Sent Events (SSE)** | M | <1s | Better UX, moderate effort |
| **WebSocket** | M | <1s | Overkill for one client |
| **SQLite change hook + SSE** | L | Instant | Ideal but complex |

**Recommendation for v1:** HTTP polling with a 5-second interval. The SPA uses React Query with `refetchInterval: 5000` for active queries. This is simple, reliable, and good enough for a single-user local tool.

**v2 upgrade path:** Add an SSE endpoint (`GET /api/events`) that the server pushes to when it detects writes. The CLI sync command can touch a sentinel file or send a localhost HTTP request to notify the server.

### 3.7 Client-Side Router

Replace Next.js App Router with `react-router` (or `@tanstack/router`):

| Next.js Route | SPA Route | Page Component |
|---|---|---|
| `/` | `/` | Landing/redirect |
| `/dashboard` | `/dashboard` | Dashboard |
| `/sessions` | `/sessions` | Sessions list |
| `/sessions/[id]` | `/sessions/:id` | Session detail |
| `/insights` | `/insights` | Insights list |
| `/analytics` | `/analytics` | Analytics page |
| `/settings` | `/settings` | Settings (LLM config only) |
| `/export` | `/export` | Export page |
| `/journal` | `/journal` | Journal page |
| `/login` | REMOVED | No auth needed |
| `/auth/callback` | REMOVED | No auth needed |
| `/about` | REMOVED | Move to landing page |
| `/privacy` | REMOVED | Move to landing page |
| `/terms` | REMOVED | Move to landing page |
| `/cookies` | REMOVED | No cookies |

### 3.8 LLM Integration Migration

**Current:** Browser-side API calls with API keys stored in localStorage.

**New:** Server-side API calls through the Hono API.

```
SPA: "Analyze session X" -> POST /api/analysis/session { sessionId }
                                    |
                                    v
Server: Read messages from SQLite -> Format for LLM -> Call LLM API -> Parse response -> Write insights to SQLite -> Return result
```

Benefits:
- No CORS issues (server makes the API calls)
- No API keys in the browser
- LLM config lives in `~/.code-insights/config.json` alongside other CLI config
- The Anthropic `anthropic-dangerous-direct-browser-access` header hack is eliminated

The LLM abstraction layer (`types.ts`, `client.ts`, `providers/*.ts`, `analysis.ts`, `prompts.ts`) ports almost 1:1 from `code-insights-web/src/lib/llm/` to `server/src/llm/`. The only changes:
- Remove localStorage config loading (read from config file)
- Remove `typeof window` guards
- The Anthropic provider drops the dangerous browser header

### 3.9 Data Hook Migration

Replace Firestore real-time hooks with React Query + REST API:

| Firestore Hook | React Query Replacement |
|---|---|
| `useProjects()` | `useQuery({ queryKey: ['projects'], queryFn: () => fetch('/api/projects') })` |
| `useSessions(filters, limit)` | `useInfiniteQuery({ queryKey: ['sessions', filters], ... })` |
| `useSession(id)` | `useQuery({ queryKey: ['session', id], ... })` |
| `useInsights(filters, limit)` | `useQuery({ queryKey: ['insights', filters], ... })` |
| `useMessages(sessionId)` | `useInfiniteQuery({ queryKey: ['messages', sessionId], ... })` |
| `useDashboardStats(range)` | `useQuery({ queryKey: ['dashboard-stats', range], ... })` |
| `useUsageStats()` | `useQuery({ queryKey: ['usage-stats'], ... })` |
| `useAnalytics()` | `useQuery({ queryKey: ['analytics'], ... })` |

Pagination changes from Firestore cursor-based (`startAfter`) to offset-based (`?limit=50&offset=0`).

### 3.10 Risks

- **Risk:** Vite SPA has no server-side rendering. First paint shows a loading spinner while data fetches.
- **Mitigation:** Acceptable for localhost. Data is local, so API responses are <10ms. The spinner flashes for a frame at most.

- **Risk:** `better-sqlite3` native addon must match the user's Node.js version. If the dashboard server runs in a different Node process than expected, it could fail.
- **Mitigation:** The CLI and server share the same Node process. The `dashboard` command starts the server in-process, not as a child process.

- **Risk:** Port conflicts. Another service may already use 7890.
- **Mitigation:** The `--port` flag lets users choose. On startup, if the port is taken, print a helpful error with the conflicting process name.

---

## Phase 4: Feature Parity Audit

**Goal:** Ensure every user-visible feature from the current web dashboard has a counterpart in the local dashboard.

**Complexity:** L (volume of porting, not individual complexity)

**Dependencies:** Phase 3 (SPA skeleton and API must exist)

### 4.1 Feature Map

| Feature | Current (Web) | Local Dashboard | Porting Notes |
|---|---|---|---|
| **Dashboard home** | `app/dashboard/page.tsx` | Port 1:1 | Stats come from API instead of hooks |
| **StatsHero** | `components/dashboard/StatsHero.tsx` | Port 1:1 | Same component, different data source |
| **Activity chart** | `components/dashboard/DashboardActivityChart.tsx` | Port 1:1 | Recharts works in SPA |
| **Activity feed** | `components/dashboard/ActivityFeed.tsx` | Port 1:1 | |
| **Sessions list** | `app/sessions/page.tsx` | Port 1:1 | Source tool filter, pagination |
| **Session detail** | `app/sessions/[id]/page.tsx` | Port 1:1 | Chat view, insights sidebar |
| **Chat conversation** | `components/chat/` (6+ files) | Port 1:1 | MessageBubble, ToolPanel, etc. |
| **Insights list** | `app/insights/page.tsx` | Port 1:1 | Filter by type, project |
| **Insight cards** | `components/insights/` (4 files) | Port 1:1 | InsightCard, PromptQualityCard |
| **Analytics page** | `app/analytics/page.tsx` | Port 1:1 | Charts from API data |
| **Export page** | `app/export/page.tsx` | Port 1:1 | Markdown export |
| **Journal page** | `app/journal/page.tsx` | Port 1:1 | |
| **Settings page** | `app/settings/page.tsx` | Adapt | LLM config only (no Firebase, no Supabase) |
| **Session rename** | `RenameSessionDialog.tsx` | Port 1:1 | PATCH /api/sessions/:id |
| **Analyze button** | `components/analysis/` (4 files) | Port, API-backed | POST /api/analysis instead of browser LLM |
| **Bulk analyze** | `BulkAnalyzeButton.tsx` | Port, API-backed | |
| **Prompt quality** | `AnalyzePromptQualityButton.tsx` | Port, API-backed | |
| **Recurring insights** | `findRecurringInsights()` | Port, API-backed | |
| **Multi-source colors** | `constants/colors.ts` | Port 1:1 | SOURCE_TOOL_COLORS, etc. |
| **Chat tool panels** | `components/chat/tools/` (7+ files) | Port 1:1 | ToolPanel, FileToolPanel, etc. |
| **Tool aliases** | `TOOL_ALIASES` in ToolPanel.tsx | Port 1:1 | Cursor/Copilot name mapping |
| **Markdown rendering** | `react-markdown` + `react-syntax-highlighter` | Port 1:1 | Same deps |
| **Dark mode** | `next-themes` | Replace with custom ThemeProvider | `next-themes` is Next.js-specific |
| **Login page** | `app/login/page.tsx` | DROP | No auth needed |
| **Auth middleware** | `middleware.ts` + `lib/supabase/` | DROP | No auth needed |
| **Firebase config flow** | `ConfigDialog.tsx` + `OnboardingFlow.tsx` | DROP | No Firebase |
| **Firebase setup guide** | `FirebaseSetupGuide.tsx` | DROP | |
| **Demo mode** | `lib/demo/data.ts` | DROP | Users have real data locally |
| **Marketing pages** | `components/marketing/` (10 files) | DROP | Moves to static landing page |
| **API routes (serverless)** | `app/api/` | REPLACE | Hono API serves the same purpose |
| **Gemini EnhanceButton** | `components/gemini/EnhanceButton.tsx` | EVALUATE | May be redundant with general LLM analysis |
| **Export reminders** | `lib/scheduler/reports.ts` | Port or DROP | Low value |

### 4.2 Components That Port Directly

These React components have zero Firebase/Supabase dependencies and can be copied with only import path changes:

- All `components/ui/` (shadcn/ui) -- 20 files
- `components/charts/` -- ActivityChart, InsightTypeChart
- `components/chat/` -- entire directory (conversation, message, tools)
- `components/insights/` -- InsightCard, PromptQualityCard, InsightList, InsightListItem
- `components/sessions/` -- SessionCard, SessionList, RenameSessionDialog
- `components/brand/Logo.tsx`
- `components/layout/ThemeToggle.tsx`
- `lib/constants/colors.ts`
- `lib/export/markdown.ts`
- `lib/types.ts` (becomes the single source of truth)
- `lib/utils.ts`

### 4.3 Components That Need Adaptation

| Component | What Changes |
|---|---|
| `layout/UnifiedHeader.tsx` | Remove auth UI (user menu, login button). Keep nav links. |
| `layout/SessionSidebar.tsx` | Replace `useSessions()` Firestore hook with React Query hook |
| `layout/UnifiedFooter.tsx` | Remove Supabase auth links, update dashboard URL |
| `analysis/AnalyzeButton.tsx` | Replace direct LLM call with `POST /api/analysis/session` |
| `analysis/BulkAnalyzeButton.tsx` | Same -- API call instead of browser LLM |
| `analysis/AnalyzeDropdown.tsx` | Same |
| `analysis/AnalyzePromptQualityButton.tsx` | Same |
| `dashboard/StatsHero.tsx` | Data from API instead of `useDashboardStats()` |
| `onboarding/WelcomeHub.tsx` | Replace with a simpler "first sync" flow |
| `ConfigDialog.tsx` | Remove Firebase config. Only LLM provider config. |
| `FirestoreIndexAlert.tsx` | REMOVE entirely |
| `providers.tsx` | Remove Firebase/Supabase providers. Keep theme provider. |
| `settings/page.tsx` | Remove Firebase/Supabase sections. Keep LLM config. |

### 4.4 Multi-Source Support

All multi-source patterns port directly:
- `SOURCE_TOOL_COLORS` -- constants file, no changes
- `getAssistantConfig()` in MessageBubble -- React component, no changes
- `TOOL_ALIASES` in ToolPanel -- React component, no changes
- Source filter dropdown -- SPA filter params instead of Firestore query

### 4.5 Risks

- **Risk:** Tailwind CSS 4 configuration differs between Next.js and Vite.
- **Mitigation:** Vite has first-class Tailwind support via `@tailwindcss/vite` plugin. Port `globals.css` and theme config.

- **Risk:** `next/image` is used in some components (lazy loading, optimization). This does not exist in a plain React SPA.
- **Mitigation:** Replace with standard `<img>` tags. For a local dashboard with local data, image optimization adds no value.

- **Risk:** `next/link` and `next/navigation` (useRouter, usePathname, etc.) are used throughout.
- **Mitigation:** Replace with `react-router` equivalents (`Link`, `useNavigate`, `useLocation`). Mechanical find-and-replace.

---

## Phase 5: Telemetry

**Goal:** Continue anonymous CLI usage tracking. The telemetry system already exists -- minimal changes needed.

**Complexity:** S

**Dependencies:** None (independent of all other phases)

### 5.1 Current State

The CLI already has a complete telemetry system (`cli/src/utils/telemetry.ts`):
- Anonymous machine ID (SHA-256, monthly rotation)
- Fire-and-forget to a Supabase Edge Function
- Opt-out via `code-insights telemetry disable` or env vars
- One-time disclosure notice
- Events: command name, OS, CLI version, provider types, session count bucket

### 5.2 Changes Needed

| Change | Reason |
|---|---|
| Update endpoint URL | Current endpoint is a Supabase Edge Function. If Supabase is being fully removed, move to a lightweight alternative. |
| Add `dashboard_opened` event | Track how many users use the dashboard feature |
| Add `analysis_run` event | Track LLM analysis usage (provider, not content) |
| Consider PostHog as the backend | More analytics features than raw event storage |

### 5.3 PostHog vs Current Supabase Approach

| Aspect | Current (Supabase Edge Function) | PostHog |
|---|---|---|
| Cost | Free tier | Free tier (1M events/month) |
| Analytics UI | None (raw table) | Full dashboard, funnels, retention |
| Self-hostable | No | Yes |
| SDK size | 0 (raw fetch) | ~20KB (posthog-node) |
| Privacy | Custom anonymous ID | Built-in anonymous mode |

**Recommendation:** Move to PostHog. The current approach stores raw events in a Supabase table with no analytics UI. PostHog provides retention charts, feature usage funnels, and an actual dashboard -- for free at this scale.

**Implementation:** Replace the `sendEvent()` function in `telemetry.ts` with PostHog's Node.js SDK. Keep the same event shape. Keep the same opt-out mechanisms.

### 5.4 Events to Track

| Event | Properties | When |
|---|---|---|
| `cli_command` | command, subcommand, success | Every CLI command (existing) |
| `dashboard_started` | port | `code-insights dashboard` |
| `analysis_run` | type (session/prompt_quality/recurring), provider | LLM analysis triggered |
| `export_run` | format (plain/obsidian/notion) | Export triggered |

### 5.5 Risks

- **Risk:** PostHog adds a new dependency to the CLI.
- **Mitigation:** `posthog-node` is ~20KB, no native deps. Acceptable for the analytics value it provides. Alternative: keep raw fetch + move to a simple Cloudflare Worker for storage.

---

## Phase 6: Cleanup & Cutover

**Goal:** Archive the web repo, update npm package, publish, update landing page.

**Complexity:** M

**Dependencies:** Phases 1-4 complete

### 6.1 Web Repo Archival

| Action | Details |
|---|---|
| Archive `code-insights-web` on GitHub | `gh repo archive melagiri/code-insights-web` |
| Add archive notice to README | "This repo has been archived. The dashboard is now part of the CLI: github.com/melagiri/code-insights" |
| Do NOT delete | Preserves PR history, issues, and git blame for reference |
| Merge history? | **No.** The repos have unrelated git histories. Merging creates confusion. Clean break. |

### 6.2 npm Package Changes

**Current:** `@code-insights/cli` v2.1.0 -- CLI only, no dashboard.

**New:** `@code-insights/cli` v3.0.0 -- CLI + embedded dashboard.

Major version bump because:
- Firebase is removed (breaking for existing Firebase users)
- `code-insights connect` is removed
- Config format changes
- Data source changes (SQLite, not Firestore)

```json
{
  "name": "@code-insights/cli",
  "version": "3.0.0",
  "description": "AI coding session analytics with built-in dashboard",
  "bin": {
    "code-insights": "./dist/index.js"
  },
  "files": [
    "dist",
    "dashboard-dist",
    "server-dist",
    "README.md",
    "CHANGELOG.md",
    "LICENSE"
  ]
}
```

The `prepublishOnly` script builds all three packages and copies outputs:
```json
{
  "prepublishOnly": "pnpm -r build && cp -r ../dashboard/dist ./dashboard-dist && cp -r ../server/dist ./server-dist"
}
```

### 6.3 CLI Command Changes

| Command | Status | Notes |
|---|---|---|
| `init` | ADAPT | Remove Firebase prompts. Add SQLite init + LLM config. |
| `sync` | ADAPT | Write to SQLite instead of Firestore. |
| `status` | ADAPT | Read from SQLite. |
| `install-hook` | KEEP | Same behavior. |
| `uninstall-hook` | KEEP | Same behavior. |
| `connect` | REMOVE | No remote dashboard. |
| `open` | ADAPT | Opens `http://localhost:7890` instead of `code-insights.app`. |
| `reset` | ADAPT | Reset SQLite database. |
| `stats` (5 subcommands) | ADAPT | Read from SQLite (already mostly there via local data source). |
| `config` | ADAPT | Remove Firebase fields, add LLM config. |
| `telemetry` | KEEP | Same behavior. |
| `dashboard` | NEW | Start local dashboard server. |

### 6.4 Landing Page

`code-insights.app` becomes a static site (GitHub Pages or Cloudflare Pages):

**Content:**
- Hero: "Understand your AI coding sessions"
- Feature highlights (local-first, multi-tool, LLM insights)
- Install: `npm install -g @code-insights/cli`
- Screenshots of the dashboard
- Link to GitHub repo

**Implementation:** A single `index.html` with Tailwind CSS (via CDN) in a `gh-pages` branch of the CLI repo, or a separate `code-insights-landing` repo.

**Recommendation:** Keep it in the CLI repo under `docs/landing/` and deploy via GitHub Pages from the `/docs` folder setting. Zero additional repos.

### 6.5 README Updates

The CLI repo README becomes the primary project documentation:

| Section | Content |
|---|---|
| Overview | What Code Insights does |
| Install | `npm install -g @code-insights/cli` |
| Quick Start | `code-insights init` -> `code-insights sync` -> `code-insights dashboard` |
| Supported Tools | Claude Code, Cursor, Codex CLI, Copilot CLI |
| Dashboard | Screenshot, `code-insights dashboard` usage |
| CLI Commands | Full reference |
| LLM Configuration | How to set up analysis providers |
| Development | pnpm workspace, build, contribute |

### 6.6 Migration Guide for Existing Users

A `MIGRATION.md` document for users upgrading from v2 to v3:

1. `npm install -g @code-insights/cli@latest`
2. `code-insights init` (re-initialize with local config)
3. `code-insights sync --force` (re-sync all sessions to SQLite)
4. `code-insights dashboard` (open the local dashboard)
5. Re-analyze sessions in the dashboard
6. Firebase project can be deleted (data is no longer used)

### 6.7 Risks

- **Risk:** npm package size increases significantly with bundled dashboard assets.
- **Mitigation:** Vite builds are small (~2-3MB for a React SPA with Recharts). Total package with CLI + server + dashboard should be under 10MB. Acceptable.

- **Risk:** Existing v2 users on Firebase lose their insights when upgrading.
- **Mitigation:** Document clearly in MIGRATION.md. Insights can be regenerated. Session data is re-synced from source files. The only true loss is custom titles -- consider a `code-insights migrate --from-firestore` stretch goal.

---

## Dependency Graph

```
Phase 1 (Claude Workspace) ----+
                                |
Phase 2 (Data Layer) ----------+---> Phase 3 (Dashboard) ---> Phase 4 (Feature Parity) ---> Phase 6 (Cleanup)
                                |
Phase 5 (Telemetry) -----------+
```

Phases 1, 2, and 5 can run in parallel.
Phase 3 requires Phase 2.
Phase 4 requires Phase 3.
Phase 6 requires Phase 4.

---

## New Dependencies

| Package | Purpose | Size | Added To |
|---|---|---|---|
| `hono` | HTTP server | ~14KB | server/ |
| `@hono/node-server` | Hono Node.js adapter | ~5KB | server/ |
| `react-router` | Client-side routing | ~50KB | dashboard/ |
| `@tanstack/react-query` | Data fetching + caching | ~40KB | dashboard/ |
| `posthog-node` | Analytics (optional) | ~20KB | cli/ |

### Removed Dependencies (from the project)

| Package | Was In | Reason |
|---|---|---|
| `firebase` (client SDK) | web | Replaced by SQLite |
| `firebase-admin` | CLI + web | Replaced by SQLite |
| `@supabase/ssr` | web | No auth needed |
| `@supabase/supabase-js` | web | No auth needed |
| `@vercel/analytics` | web | No Vercel deployment |
| `next` | web | Replaced by Vite |
| `next-themes` | web | Custom theme provider |
| `@google/generative-ai` | web | Moves to server (Gemini provider) |
| `framer-motion` | web | Evaluate -- keep if used in dashboard |

---

## Founder Decisions (2026-02-27)

### Open Questions — Resolved

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Keep `devtools-cofounder` agent? | **Keep, demote to on-demand** | Useful for positioning decisions. Not part of standard ceremony. |
| 2 | Firestore migration tool? | **Not in v3.0.0** | Re-sync + re-analyze is the migration path. Document clearly in MIGRATION.md. v3.1 backlog if >3 users request it. |
| 3 | Landing page hosting? | **GitHub Pages from CLI repo `/docs`** | Zero additional repos. Simple DNS CNAME. |
| 4 | Telemetry backend? | **Keep Supabase for v3.0.0, migrate to PostHog in v3.1** | Avoids adding Phase 5 complexity to main migration. |
| 5 | Package structure? | **Single `@code-insights/cli` package** | `npx code-insights dashboard` just works. No sync overhead. |
| 6 | Existing Supabase project? | **Keep for telemetry until PostHog migration** | Delete after v3.1 PostHog migration. |

### Founder Directives

1. **Firebase/Firestore completely removed from v3.** No Firebase code, no Firebase config, no Firebase API calls. The CLI should not reference Firebase after v3 for anything.
2. **CLI auto-clears Firebase config on update.** When a v2 user updates to v3, `code-insights init` (or first run) should detect and clear any existing Firebase configuration, inform the user, and set up local SQLite.
3. **Keep Supabase for v3** (telemetry endpoint only). Plan PostHog migration as v3.1.
4. **This is an OSS portfolio project** — no monetization, no business model. Optimize for adoption, contributor experience, and portfolio impressiveness.
5. **Phase 1 executes first** before any implementation phases. Agents need correct CLAUDE.md context.
6. **v3 implementation starts from the CLI repo** — after Phase 1 completes, new Claude sessions run from the CLI project.

---

## Reviewer Amendments (Multi-Agent Review, 2026-02-27)

Reviewed by: Devtools Cofounder, UX Engineer, Product Manager.

### Top 10 Amendments (Incorporated into Plan)

| # | Amendment | Source | Status |
|---|-----------|--------|--------|
| 1 | `npx @code-insights/cli` should auto-detect, sync, and open dashboard in one command | Cofounder | Accepted — design for "one command to wow" |
| 2 | Replace demo mode with guided empty states (not blank dashboard) | UX | Accepted — show real UI with embedded guidance |
| 3 | Auto-fallback port (try 7890, if taken use 7891) like Vite | UX + Cofounder | Accepted |
| 4 | 2s polling, not 5s + manual refresh button in header | UX | Accepted |
| 5 | Inline `<script>` in index.html for dark mode FOUC prevention | UX | Accepted |
| 6 | Phase 1 must complete before Phases 2-4 (not parallel) | PM | Accepted — agents need correct CLAUDE.md |
| 7 | Timebox Phase 4 — MVP scope: sessions + insights + analysis only | PM | Accepted — defer journal, export, bulk analyze to v3.1 |
| 8 | CONTRIBUTING.md + provider plugin guide | Cofounder | Accepted — contributor path IS the portfolio |
| 9 | Settings page must write LLM config through API (not just CLI) | UX + Cofounder | Accepted |
| 10 | `code-insights doctor` command for self-diagnostics | Cofounder | v3.1 backlog |

### Additional Amendments

- **Scroll restoration** in react-router (Next.js does this automatically) — must add `ScrollRestoration`
- **`document.title`** updates on route changes (no metadata exports in SPA)
- **Drop mobile-specific nav** (bottom bar, hamburger) — keep responsive, assume desktop
- **Celebrate Ollama CORS fix** — LLM calls server-side means Ollama just works, no CORS config
- **Node.js version floor** bump to `>=20.0.0` (Node 18 is EOL)
- **Measure npm package size early** in Phase 3 — `react-syntax-highlighter` bundles Prism at 2-3MB
- **SQLite file as shareable artifact** — call out in README: "Your data is a single SQLite file"
- **`code-insights.app` DNS migration plan** needed if domain is currently on Vercel
- **Spike monorepo structure first** (day 1 of Phase 3) — hello world build before porting code
- **`code-insights init` should include first sync** + offer to start dashboard (collapse 3-step flow)

### Revised Timeline (PM Assessment)

| Phase | TA Estimate | PM Revised | Notes |
|-------|------------|------------|-------|
| Phase 1 | ~1 day | ~1 day | Accurate |
| Phase 2 | ~3-4 days | ~4-5 days | Stats subcommands touch more files |
| Phase 3 | ~4-5 days | ~5-7 days | Monorepo + build pipeline setup |
| Phase 4 | ~3-4 days | ~4-6 days | MVP-scoped (sessions + insights + analysis) |
| Phase 5 | ~0.5 day | ~0.5-1 day | Minor changes (keep Supabase) |
| Phase 6 | ~1-2 days | ~2-3 days | README + landing page quality |
| **Total** | **~13-16 days** | **~17-23 days** | 20-30% buffer applied |

### v3.0.0 MVP Scope Gate

**Must ship:**
- SQLite write path, `dashboard` command, Hono server
- Sessions list + detail + chat view
- LLM analysis (session), Settings page (LLM config)
- MIGRATION.md

**Should-have (ship if time allows):**
- Insights list page, Analytics page, Multi-source filter
- Export to Markdown, Bulk analyze

**Explicitly out of v3.0.0:**
- Firestore migration tool, PostHog migration, Landing page redesign
- SSE real-time updates, Export reminders, Gemini EnhanceButton
- Demo mode (replaced by guided empty states), Journal page

---

## Success Criteria

The migration is complete when:

- [ ] `npm install -g @code-insights/cli` installs a working CLI with embedded dashboard
- [ ] `code-insights sync` writes to `~/.code-insights/data.db`
- [ ] `code-insights dashboard` opens a fully functional dashboard at `http://localhost:7890`
- [ ] All 4 source tools (Claude Code, Cursor, Codex CLI, Copilot CLI) parse and display correctly
- [ ] LLM analysis works through the local server (session analysis, prompt quality, recurring insights)
- [ ] No Firebase dependencies remain in CLI code
- [ ] Supabase used only for telemetry endpoint (no auth)
- [ ] `code-insights-web` repo is archived on GitHub
- [ ] CLI version 3.0.0 is published to npm
- [ ] `pnpm install` and `code-insights init` complete in under 60 seconds
- [ ] Dashboard loads in under 2 seconds after `code-insights dashboard` starts
- [ ] Zero npm audit vulnerabilities at publish time
- [ ] CHANGELOG.md and MIGRATION.md updated and accurate
