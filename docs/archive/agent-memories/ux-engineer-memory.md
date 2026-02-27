# UX Engineer Memory (Archived from code-insights-web)

> Archived on 2026-02-27 as part of the local-first migration (Phase 1).
> Original location: `code-insights-web/.claude/agent-memory/ux-engineer/MEMORY.md`

## Project Structure Patterns
- Root layout: `src/app/layout.tsx` - auth branch (Providers+Navbar+ConditionalSidebar+main) vs unauth branch (raw children)
- Sidebar only shows on `/sessions` routes via `ConditionalSidebar` (checks pathname + Firebase config)
- shadcn/ui (New York variant) components in `src/components/ui/` - 20 components installed
- All pages use `p-6 space-y-6` for consistent spacing
- Page headers use `text-2xl font-bold` for title + `text-muted-foreground` for subtitle
- Marketing components: `src/components/marketing/` (7 section components + shared utils)

## Color System
- CSS variables use oklch format defined in `src/app/globals.css`
- Primary: oklch(0.45 0.2 265) light / oklch(0.7 0.15 265) dark -- purple/indigo hue 265
- Accent: oklch(0.95 0.02 265) light / oklch(0.25 0.03 265) dark
- CAUTION: Recharts tooltips may use hsl() but CSS vars are oklch -- potential mismatch
- Insight type colors defined independently in InsightCard.tsx and InsightTypeChart.tsx -- not unified

## Layout Architecture
- Authenticated: `flex h-screen flex-col` > Navbar(h-12) + `flex flex-1 overflow-hidden` > Sidebar + Main(overflow-y-auto)
- Unauthenticated: raw children (no wrapping layout)
- Marketing: own wrapper + MarketingNavbar(h-14, fixed, scroll-aware blur) + MarketingFooter
- Legal pages: inline header(h-12, border-b, back arrow) + Footer
- Login: own wrapper + Footer

## Navigation
- Navbar: 6 primary items (Dashboard, Sessions, Insights, Analytics, Journal, Export)
- Mobile: bottom tab bar (4 items + "More"), hamburger Sheet with nav + SessionSidebar
- MarketingNavbar: GitHub, Sign In, Get Started; mobile < sm dropdown

## Component Patterns
- Chat bubbles: user=right-aligned blue bg, assistant=left-aligned purple border, system=centered italic
- Brand logo: `src/components/brand/Logo.tsx` -- SVG brackets + bar chart, currentColor
- ThemeToggle: next-themes, Sun/Moon icons with tooltip
- Loading states use shadcn Skeleton consistently; toasts via Sonner

## Key Files
- Firestore hooks: `src/lib/hooks/useFirestore.ts`
- Types: `src/lib/types.ts`
- LLM abstraction: `src/lib/llm/`
- Analysis context: `src/lib/analysis/context.ts`

## Docs Site (CLI repo)
- Location: `../code-insights/docs-site/` (Astro + Starlight 0.37.6)
- Config: `docs-site/astro.config.mjs`, site: docs.code-insights.app
- No custom CSS yet; 9 markdown pages across getting-started/, guides/, reference/

## Auth/Routing
- Middleware redirects `/` to /dashboard for authed users
- Public paths: /auth/callback, /api, /terms, /privacy, /cookies, /about
- Root layout checks auth server-side via Supabase getUser()

## Design Decisions (Feb 2026 Consistency Redesign)
- Full spec: `docs/plans/2026-02-19-ui-consistency-redesign.md`
- UnifiedHeader: h-14, scroll-aware blur everywhere, max-w-6xl
- UnifiedFooter: simple 2-section (brand+links), max-w-6xl
- Layout: moving from flex h-screen to natural body scroll + sticky sidebar
- Dark mode: defaultTheme from "system" to "dark"

## Onboarding Architecture
- WelcomeHub: 3 cards (Explore first, Quick Start, I have the CLI) in `src/components/onboarding/WelcomeHub.tsx`
- OnboardingFlow: 3-step stepper (Connect Firebase > Install CLI > First Sync) via useReducer
- Step components: `src/components/onboarding/steps/` (ConnectFirebase, InstallCLI, SyncData)
- Shared: `FirebaseConfigForm` (test-first validation, Paste/Manual tabs), `CopyBlock` (terminal block with copy)
- Firebase config form: test-first (initialize temp, probe Firestore, save only on success)
- Step animations: `animate-in fade-in slide-in-from-bottom-2 duration-300` via key remount
- Stepper circles: green-500 completed, primary current, muted upcoming
- localStorage keys follow `code_insights_` prefix convention (underscores, not hyphens)
- Available shadcn/ui: Collapsible (Radix), Checkbox (native input), Alert (cva variants)
