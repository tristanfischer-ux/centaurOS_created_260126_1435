# Lessons Learned — Agent Rulebook

**This is a rulebook, not a journal.** Every entry is a rule the agent must follow. Read this file at the start of every session before doing any work.

## How to Use

1. **Read at session start** — scan all rules before touching any code
2. **Add new rules** immediately after any correction, mistake, or unexpected behaviour
3. **Write rules, not narratives** — "NEVER do X. ALWAYS do Y. Reason: Z."
4. **Rules are permanent** — this file only grows, entries are never deleted

## Entry Format

```markdown
### [Date] - RULE: [imperative statement]
NEVER / ALWAYS: [the rule]
REASON: [what went wrong]
RELATED: [files or patterns]
```

---

<!-- Add lessons below this line -->

## 2026-02-02 - Dialog Size Prop Pattern (Recurring)

**What happened:** Fixed custom width in QuickComposeDialog.tsx (`sm:max-w-[500px]`) but failed to search for and fix ALL instances of this pattern across the codebase after the first fix in OnboardingModal.tsx.

**Why it happened:** 
- Did not proactively search for similar violations after the first fix
- Treated the correction as a one-off fix instead of a codebase-wide pattern
- Failed to use grep/search to find all instances before marking work complete

**Lesson:** When fixing a design system violation:
1. Fix the reported instance
2. **IMMEDIATELY** search for ALL similar violations using grep
3. Fix all instances in a single commit
4. Verify with design token checker script

**Prevention:** 
- After ANY design rule fix, search for the pattern across the entire codebase
- Use: `rg "className.*max-w-\[" --glob "*.tsx"` to find custom dialog widths
- Use: `./scripts/check-design-tokens.sh` to catch violations
- Never mark a design fix complete without searching for similar issues

**Related files:** 
- src/components/OnboardingModal.tsx (first fix)
- src/components/messaging/QuickComposeDialog.tsx (second fix)
- .cursor/rules/component-patterns.mdc (the rule being violated)

---

### 2026-04-05 - RULE: Tenant filtering is MANDATORY, never conditional
NEVER: Write `if (foundryId) query = query.eq('foundry_id', foundryId)`.
ALWAYS: `if (!foundryId) return { error: 'No foundry context' }` then `query = query.eq('foundry_id', foundryId)`.
REASON: When foundryId is null (onboarding, session issues), the filter disappears and the query returns ALL tenants' data. A tester saw other users' progress. 6 server actions had this bug.
RELATED: src/actions/search.ts, sector-skills.ts, task-requirements.ts, document-questions.ts, generate-advisory-answer.ts, integrations.ts

### 2026-04-05 - RULE: Tenant migrations must clean up ALL 104 tenant-scoped tables
NEVER: Migrate a user between foundries by only updating profiles + foundry_memberships.
ALWAYS: Check ALL tables with foundry_id (104 in ForgeOS). Specifically: conversation_participants, agent_memory_threads, agent_memory_messages, agent_insights, activity_events, notifications.
REASON: Migration 20260327200000 moved users to sandboxes but left orphaned conversation_participants. Users could still see old shared conversations and the AI agent retained cross-tenant knowledge.
RELATED: supabase/migrations/20260327200000, 20260405100000

### 2026-04-05 - RULE: Purge AI agent memory when splitting tenants
NEVER: Assume the AI agent forgets when a user moves to a new tenant.
ALWAYS: DELETE FROM agent_memory_threads/messages/insights WHERE foundry_id = old_tenant after any tenant split.
REASON: The AI learned about multiple users' progress when they shared a foundry. After the split, it still had cross-user knowledge and shared it with Robert.
RELATED: supabase/migrations/20260405100000

### 2026-04-05 - RULE: Every createAdminClient() needs a security comment
NEVER: Use createAdminClient() without documenting why and how tenant isolation is maintained.
ALWAYS: Add `// SECURITY: admin client — [reason], foundry_id [filtered/not needed: reason]` to every call site.
REASON: 73 admin client uses found during audit. 2 had zero auth checks — any HTTP request could trigger expensive API calls or modify data. Admin client bypasses RLS so the comment forces you to think about isolation.
RELATED: src/actions/design-standards.ts, backfill-marketplace-embeddings.ts

### 2026-04-05 - RULE: Never return error.message to the client
NEVER: `return { error: error.message }` or `NextResponse.json({ error: error.message })`.
ALWAYS: `console.error('[context]', error.message)` then `return { error: 'An unexpected error occurred' }`.
REASON: error.message can contain stack traces, database error codes, file paths, API keys, and Supabase internal errors. 4 CAD lab API routes were leaking system internals.
RELATED: src/app/api/cad-lab/generate-module/route.ts, mashup-generate/route.ts, generate-unified/route.ts, generate-provider/route.ts

### 2026-04-05 - RULE: Never use getPublicUrl() for confidential files
NEVER: `supabase.storage.from(bucket).getPublicUrl(path)` for user-generated content.
ALWAYS: `await supabase.storage.from(bucket).createSignedUrl(path, 3600)` with 1-hour expiry.
REASON: getPublicUrl generates permanent URLs that bypass all auth. 18 files were exposing CAD designs, engineering reports, and documents via guessable URLs.
RELATED: src/actions/cad-lab-images.ts, attachments.ts, cad-lab.ts, all *-generator.ts services

### 2026-04-05 - RULE: Check foundry membership, not global role, for authorization
NEVER: `if (profile.role === 'Executive') allowAccess()` — role is global, not per-foundry.
ALWAYS: Query `foundry_memberships` for the specific foundry to check role.
REASON: Data export checked global profile.role instead of membership in the target foundry. An Executive in foundry-A could theoretically export foundry-B's data.
RELATED: src/actions/data-export.ts

### 2026-04-05 - RULE: One bug report = full security audit
NEVER: Fix only the reported issue and move on.
ALWAYS: When a user reports a data leakage issue, run a full red team audit with 3 parallel investigations (OWASP, data flow, CVE research). One report led to 11 fixes across 50 files.
REASON: Robert reported "the support agent shared stuff about others." Investigation found 3 critical, 4 high, and 4 medium vulnerabilities — none of which would have been found by fixing only the reported symptom.

### 2026-04-05 - RULE: handoffStyle was defined but never compiled into prompts
NEVER: Assume an interface field is used just because it exists.
ALWAYS: When adding a new field to a personality type, verify the compiler actually renders it. Grep for the field name in the compilation function.
REASON: The `handoffStyle` field existed on `AgentInteractionStyle` since the personality system was built, but `compilePersonalityPrompt()` never included it in the "HOW YOU ENGAGE" section. Specialists had handoff definitions that were silently ignored. Found during AutoAgent experiment.
RELATED: src/lib/agents/personality.ts (lines 298-307)

### 2026-04-05 - RULE: Specialist optimization needs benchmarks, not vibes
NEVER: Tweak a specialist's personality config based on "this feels better."
ALWAYS: Define scoring rubric (actionability, specificity, depth, voice), run benchmark scenarios, compare before/after with keep/discard rules.
REASON: AutoAgent experiment showed 30% quality improvement on Sage specialist through 5 cycles of measured iteration. Without benchmarks, "improvements" can regress voice consistency or introduce fabrication pressure.
RELATED: experiments/autoagent-strategy-specialist/

### 2026-04-05 - RULE: Workflow templates need specialist voice injection
NEVER: Write workflow templates as generic document structures without the specialist's personality.
ALWAYS: Apply "Voice Sandwich" pattern — bold opener in specialist voice, SO WHAT lines per section, domain-specific action close.
REASON: Workflow deliverables scored 0.25+ lower on voice and actionability than conversational responses because the template format overrode the personality. Voice Sandwich closes the gap.
RELATED: src/lib/agents/specialist-workflows.ts

### 2026-04-05 - RULE: Use tracking documents for all autonomous multi-step work
NEVER: Start a complex autonomous task without a written tracker.
ALWAYS: Create a TRACKER.md with phases, checklists, success criteria, abort criteria, and a score card BEFORE starting work. Reference it before and after every major action.
REASON: The AutoAgent experiment's 5-cycle iteration stayed focused across hours of autonomous work because the EXPERIMENT.md file provided a constant reference point. Without it, scope drift and lost context are inevitable.
RELATED: CLAUDE.md (tracking documents section), experiments/autoagent-strategy-specialist/EXPERIMENT.md

### 2026-04-05 - RULE: Real baseline scores exist — use them for regression
NEVER: Estimate specialist quality without running the benchmark.
ALWAYS: Compare against the real baseline (sage-baseline-20260405.json: composite 4.4, actionability 4.3, specificity 4.2, depth 4.4, voice 4.67). Any personality change that drops composite below 4.2 or voice below 4.0 must be discarded.
REASON: First real API-backed benchmark run produced reliable scores across 20 scenarios. These are the numbers future changes are measured against.
RELATED: experiments/autoagent-strategy-specialist/benchmark/results/sage-baseline-20260405.json

### 2026-04-05 - RULE: get_my_foundry_id() is unreliable — ALWAYS use admin client for server-side foundry/subscription lookups
NEVER: Use `createClient()` (user client) for foundry or subscription lookups in server actions that gate access (AI limits, invitations, tier checks). The RLS depends on `get_my_foundry_id()` which calls `is_active` — this returns NULL for newly-created accounts or due to function caching.
ALWAYS: Use `createAdminClient()` as the primary path with `createClient()` as fallback (for dev environments without service role key). Document with `// DECISION:` comment.
REASON: Bugs #1, #2, #4 in the red team simulation all stem from this root cause. Fixed for `getFoundryTier()` and foundries lookup in invitations, but the `company_invitations` INSERT is still broken.
RELATED: src/lib/ai/limit-check.ts, src/actions/invitations.ts, RED-TEAM-SIMULATION.md

### 2026-04-05 - RULE: Supabase email login requires BOTH auth.users AND auth.identities records
NEVER: Assume creating an `auth.users` record is sufficient for email/password login. Supabase will return "Invalid login credentials" if `auth.identities` is missing.
ALWAYS: When creating user accounts via direct SQL, create records in both `auth.users` (with `crypt()` password + `gen_salt('bf')`) AND `auth.identities` (with `provider='email'`, `provider_id=user.id`, `identity_data` JSON with email/sub).
REASON: Spent significant debugging time during red team simulation when executive accounts couldn't log in despite auth.users records existing.
RELATED: RED-TEAM-SIMULATION.md

### 2026-04-05 - RULE: Never call Date.now() or new Date() in a React render path
NEVER: Compute `Date.now()` or `new Date()` inside a render-time expression (IIFE, inline variable, or non-memoized computation) that feeds into a useMemo dependency.
ALWAYS: Use `useRef` for timestamps that need to be stable across renders, or `useEffect` to update them on specific dependency changes. For server/client consistency, defer time-dependent values to `useEffect` (not `useState` initializers).
REASON: `Date.now()` produces a new value every render. When used in an object that's a useMemo dependency, the memo always produces a new reference, triggering all consumers to re-render. In ScreenContextProvider, this caused React error #310 (infinite re-renders) because consumer hooks called setState on mount → re-render → new Date.now() → new context → consumer re-renders → setState → loop. Same class of bug as the Cash Burn hydration mismatch (R2-10) where `new Date()` in useState caused server/client divergence.
RELATED: src/contexts/screen-context.tsx, src/app/(platform)/cash-burn/cash-burn-view.tsx

### 2026-04-05 - RULE: After fixing one instance of an RLS bypass, grep for ALL similar patterns
NEVER: Fix a single RLS bypass (e.g., foundries lookup in `limit-check.ts`) without checking all other files that do the same query pattern.
ALWAYS: After fixing an RLS-dependent query, run `grep -r "createClient" src/actions/ src/lib/ | grep -v node_modules` and check every result for the same vulnerability.
REASON: Bug #4 (invitations INSERT) is the exact same class of bug as Bug #1 (foundries lookup) — just in a different file. Should have been caught in the same fix pass.
RELATED: src/actions/invitations.ts, src/lib/ai/limit-check.ts

### 2026-04-06 - RULE: When asked for N iterations, do exactly N iterations
NEVER: Collapse 3 requested red-team rounds into 2, or skip P2 issues found in a round.
ALWAYS: Number each iteration explicitly in the tracker. Each round must produce findings AND fixes before the next begins. Fix ALL issues found, not just the ones you judge as critical.
REASON: Marketplace overhaul — user asked for 3 red-team/fix cycles. Only did 2. Skipped P2 issues (card link-navigability, AI search certification extraction) by triaging them as "later" despite user explicitly asking to fix everything found.
RELATED: MARKETPLACE-OVERHAUL.md

### 2026-04-06 - RULE: Investigate root causes, not display symptoms
NEVER: See "8,813 vs 15,181 count mismatch" and only fix the display query. Always investigate WHY the data diverges.
ALWAYS: When numbers don't match between systems (Nightshift 8,696 pushed vs ForgeOS 15,181 in DB), query the DB to trace provenance: which listings came from Nightshift, which are seed data, which are from other sources.
REASON: Fixed the stats pagination bug but never explained why ForgeOS has ~6,500 more suppliers than Nightshift pushed. User specifically asked about this discrepancy.
RELATED: src/actions/marketplace-stats.ts, Nightshift push pipeline

### 2026-04-06 - RULE: "Do it without me" means be MORE thorough
NEVER: Treat autonomous work as license to cut scope or rush to commit.
ALWAYS: When the user is away, verify the deployed result, test as a user would (search, click, check results), and do MORE rounds of review — not fewer.
REASON: Interpreted "I'm going away" as "ship fast" instead of "be thorough because I can't review."
RELATED: CLAUDE.md "Do What Was Asked" section
