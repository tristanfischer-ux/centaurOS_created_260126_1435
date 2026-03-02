# ForgeOS (CentaurOS) — Agent Directives & Design System

> **System architecture reference:** See [ARCHITECTURE.md](./ARCHITECTURE.md) for a comprehensive overview of how ForgeOS works — tech stack, 13 AI specialists, CAD lab, marketplace, data flows, security model, and database schema.

## Agent Workflow

### Verification Before Done
- **Never mark a task complete without proving it works**
- **Test it yourself.** Write scripts, hit endpoints — whatever it takes. Only involve the user for genuine blockers.
- After any bug fix or UI change, run `npm run verify` before reporting done
  - Tier 1 (Static): `tsc --noEmit` + ESLint
  - Tier 2 (Smoke): Playwright page render check
  - For static-only: `npm run verify -- --static`
- Commit after each page's fixes are verified — not in a single batch
- **Log every fix to memory** — after each commit (pass or fail), add an entry to `~/.claude/projects/-Users-tristanfischer/memory/forgeos-fix-log.md` with: what was changed, did it work, why, and any gotchas. This is part of the definition of done.

### Bug Fixing Strategy
1. First attempt: analyze and try a direct fix
2. If "still doesn't work": STOP. Switch to Plan Mode. Re-analyze assumptions. Create debugging plan. Write reproducing test. Prove fix works.
- Only ONE attempt before escalating to plan mode

### Supabase Is Your Job
ALL Supabase operations are the agent's responsibility. Never ask. Just do it.
1. Push migration: `npx supabase db push`
2. Regenerate types: `npx supabase gen types typescript --linked > src/types/database.types.ts`
3. Clean up temporary type workarounds
4. Verify: `npx tsc --noEmit`

---

## Company Identity
- **CORRECT:** "Fractional Forge" (company), "ForgeOS" (product), "Forge teams" (users)
- **WRONG:** Centaur Dynamics, CentaurOS, Centaur teams
- Apply to: page titles, UI copy, meta tags, documentation
- Do NOT change: git repo URLs, migration files, foundry IDs, font/image filenames, Sentry project, Docker names

---

## Design Philosophy
Bright, airy, optimistic design reflecting human-AI collaboration.
- **Light-first:** default light backgrounds, dark mode as opt-in alternative
- **Bright palette:** International Orange #ff4500, Electric Blue #3b82f6, light tones, vibrant status colors
- **Airy spacing:** generous whitespace, prefer space-y-6/8, ample card padding
- **Optimistic messaging:** positive language, progress prominence, helpful errors, encouraging empty states
- ThemeProvider MUST default to light mode with `enableSystem={false}`

### No AI Emphasis
ForgeOS is human-first. AI capabilities support humans, not showcased.
- NO "AI-powered", "AI-generated", "Smart", "Intelligent" labels
- NO AI agent counts, AI branding in nav, robot/brain icons
- Test: "Would this description make sense without mentioning AI?" If yes, don't mention AI.

### Delight the User
Every feature should delight users enough they want to tell friends.
- Feels Instant: optimistic UI, skeleton states, transitions not jumps
- Feels Thoughtful: smart defaults, helpful microcopy, anticipate next step, graceful errors
- Feels Beautiful: consistent spacing, smooth interactions, purposeful color

---

## Color System
**NEVER use hardcoded colors — always use semantic tokens.**

### Text Colors
- Primary: `text-foreground` | Secondary: `text-muted-foreground` | Accent/Links: `text-international-orange`
- Success: `text-success` | Warning: `text-warning` | Error: `text-destructive` | Info: `text-info`

### Background Colors
- Page: `bg-background` | Card: `bg-card` | Secondary: `bg-secondary` | Muted: `bg-muted`
- Brand: `bg-international-orange` | Success: `bg-success/10` | Warning: `bg-warning/10` | Error: `bg-destructive/10`

### Borders
- Default: `border-border` | Input: `border-input` | Accent: `border-international-orange` | Error: `border-destructive`

### Forbidden
No `text-gray-*`, `bg-gray-*`, `text-white`, `bg-white`, `text-black`, `bg-black`, `text-red-*`, `bg-green-*`, `text-blue-*`, hardcoded hex values, etc.

Run `./scripts/check-design-tokens.sh` before committing UI changes.

---

## Component Patterns

### Required Components
- **Badge:** Use variants (success, warning, destructive, info), NOT custom classes
- **Button:** Semantic variants (default, secondary, ghost, destructive, success, warning). One primary per page.
- **Card:** Always use Card component (not custom divs). Card/CardHeader/CardContent/CardFooter. NO padding or border overrides.
- **Dialog:** Size prop (sm/md/lg), NOT custom widths. Footer: Cancel left, Submit right.
- **CRITICAL: NEVER use Sheet/Side Panels** — use centered Dialog instead
- **EmptyState:** For zero-data views with icon, title, description, optional action
- **StatusBadge:** For all status indicators (NOT Badge with hardcoded colors)
- **Skeleton:** For loading states

### UserAvatar (CRITICAL)
ALL user avatars MUST use `UserAvatar` component from `@/components/ui/user-avatar`.
- Role-based colors: Founder (dark orange), Executive (light orange), Apprentice (neutral), AI_Agent (purple)
- Sizes: xs(h-4), sm(h-6), md(h-8), lg(h-10), xl(h-14), 2xl(h-20), 3xl(h-24)
- Use `UserAvatarStack` for multiple avatars
- Raw Avatar ONLY for non-user entities

### Task Completion Icons
- CheckCircle2 (green): completed tasks ONLY
- Clock: active/in-progress with upcoming deadlines
- AlertTriangle: overdue tasks
- Circle (outline): incomplete/pending

### Wizard Pattern (3+ fields)
Use multi-step wizard with: visual progress indicator, conversational typography, one focus per step, step validation, clear navigation (Cancel/Back left, Next/Submit right), character counters, focus management. Reference: `src/components/objectives/company-purpose-dialog.tsx`

---

## Layout & Spacing
- Platform pages inherit padding from layout — NO duplicate padding
- Layout provides: `p-4 sm:p-6 lg:p-8`
- Max-width: none for list/grid, `max-w-5xl` detail, `max-w-3xl` forms, `max-w-4xl` settings, `max-w-7xl` marketing
- Spacing scale: section(space-y-8), card(space-y-6), stack(space-y-4), stackTight(space-y-2)

### Z-Index Hierarchy
- `z-40`: Sticky headers, floating buttons
- `z-50`: Sheet/Dialog/Drawer overlays & content
- `z-[200]`: Popover/Select/Combobox/Command inside modals
- `z-[300]`: Tooltip (always on top)
- DO NOT use `z-[100]` or create wrapper divs with different z-index

### No Subpixel Blur
- FORBIDDEN: `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` (causes fuzzy text)
- USE: `inset-0 m-auto h-fit w-fit` or flexbox centering

### Interactive Elements
All dialogs, dropdowns, popovers MUST have solid opaque backgrounds.
- FORBIDDEN: `bg-background/80`, `bg-background/90`, `bg-card/50`, `backdrop-blur` on interactive elements
- Transparency allowed ONLY on modal backdrop overlay (`bg-black/40`)

---

## Navigation
- Active state: International Orange ONLY (`text-international-orange font-semibold`)
- Typography: `text-sm font-medium` desktop, `text-xs font-medium` mobile
- Icons: `h-4 w-4` desktop sidebar, `h-5 w-5` mobile
- Hover: `transition-colors duration-200`

---

## Forms
- Every field: Label with htmlFor, aria-required, aria-invalid, aria-describedby, role="alert" on errors
- Input height: default h-10 (NO overrides)
- Error styling: semantic `destructive` token, NOT hardcoded red
- Validation: inline on blur, clear on change, focus first error on submit
- Spacing: use design system utilities (spacing.section, spacing.card, spacing.stack)

---

## Code Standards

### TypeScript
- Explicit types for function signatures
- Avoid `any` — use `unknown` + type guards
- Use `satisfies` for type-safe object literals

### Naming Conventions
- Files: kebab-case | Functions: camelCase | Types/Interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE | Booleans: is/has/should prefix | Handlers: handle* | Callbacks: on*

### Error Handling
- Never silent catch — always log or rethrow
- Create typed custom error classes
- Never return undefined/null without logging

### Imports (order)
1. React/Next.js 2. External 3. Internal aliases (@/) 4. Relative 5. Type imports

---

## Database Security (CRITICAL)
Multi-tenant SaaS — foundry isolation at ALL times.

**ALL queries for multi-tenant tables MUST filter by foundry_id.**

Multi-tenant tables: tasks, objectives, teams, messages, task_comments, task_assignees, profiles, foundries

Secure pattern:
1. Get authenticated user via `createClient()` + `getUser()`
2. Get user's profile with foundry_id
3. Filter ALL queries by foundry_id
4. Never trust client-side foundry_id — always derive from auth

RLS is ENABLED on profiles (as of migration 20260216800000). Three canonical policies: INSERT for own profile, UPDATE for own profile, SELECT USING (true) — intentionally permissive to support cross-foundry marketplace/messaging visibility. R-011 in ISMS risk register documents the accepted risk.

---

## Documentation
- JSDoc required for all exported functions: @description, @param, @returns, @throws
- Security comments: `// SECURITY:`, `// AUTH:`, `// AUDIT:`, `// RLS:`, `// VALIDATION:`
- Business logic: comment the WHY, reference tickets
- File headers required for: API routes, files >200 lines, security-critical, migrations

### Code Narrative Annotations
- `// INTENT:` — why this code exists
- `// DECISION:` — why this approach over alternatives
- `// TRIED:` — what was attempted and abandoned
- `// FLOW:` — cross-file connection breadcrumbs
- `// GOTCHA:` — what looks wrong but is correct

---

## Elegance Patterns
- Interactive cards: `hover:-translate-y-0.5 active:scale-[0.99] duration-200`
- Section headers: colored accent bars matching content theme
- Empty states: soft centered with icon in rounded container
- List rows: soft hover transition
- Icon containers: branded background with /10 opacity
- Selection states: brand-colored ring
- Always provide color legends when using colored UI elements

---

## Testing Before Deployment
Any code change requires end-to-end testing before deployment:
1. Code-Level: TypeScript, Linter, Build
2. Functional: UI components, server actions, API routes
3. Regression: test related features
- Test ALL instances of a pattern if modifying one
- Run `./scripts/check-design-tokens.sh` before committing UI changes

---

## Color Legends
Always provide legends when using colored UI elements. Use StatusItem interface pattern. Place below page headers, above filterable content.
