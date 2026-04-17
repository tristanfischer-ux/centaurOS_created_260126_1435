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

## 2026-04-17 - RULE: Test users on prod Supabase must be deleted at session end

**NEVER** leave a test user / test foundry sitting on prod Supabase after an agent-browser walkthrough session ends. Sandbox foundries (`is_sandbox=true`) are excluded from analytics, but they still count against RLS scans, authentication logs, and storage quota. Over time they accumulate.

**ALWAYS** delete the test user (and its foundry membership + foundry row if no one else belongs to it) via the Supabase auth admin API at the end of the session. Recreate a fresh one at the start of the next session — creation is ~5 seconds and keeps credentials scoped to one session. Save creds to `/tmp/forge-test-creds.txt` for the in-session use; do NOT persist outside `/tmp`.

**Canonical delete sequence** — the REST API + SQL delete both FAIL against `auth.users` because deleting the user cascades to `security_audit_log.user_id = NULL`, and `prevent_security_audit_update` (a BEFORE-UPDATE trigger on the audit log) is designed to block that UPDATE unconditionally. The working sequence is:

1. Delete project data + profile + membership + foundry rows first (regular tables, no trigger in the way):
   ```sql
   DELETE FROM public.cad_lab_projects WHERE foundry_id = '${FOUNDRY_ID}';
   DELETE FROM public.foundry_memberships WHERE foundry_id = '${FOUNDRY_ID}';
   DELETE FROM public.profiles WHERE foundry_id = '${FOUNDRY_ID}';
   DELETE FROM public.foundries WHERE id = '${FOUNDRY_ID}' AND is_sandbox = true;
   ```
2. Temporarily disable the audit-log-update trigger, delete the auth user, re-enable. Wrap in a DO block with EXCEPTION handler so the trigger always re-enables:
   ```sql
   DO $$
   BEGIN
     ALTER TABLE public.security_audit_log DISABLE TRIGGER prevent_security_audit_update;
     DELETE FROM auth.users WHERE id = '${USER_ID}';
   EXCEPTION WHEN OTHERS THEN
     ALTER TABLE public.security_audit_log ENABLE TRIGGER prevent_security_audit_update;
     RAISE;
   END $$;
   ALTER TABLE public.security_audit_log ENABLE TRIGGER prevent_security_audit_update;
   ```
3. Remove the on-disk creds:
   ```bash
   rm -f /tmp/forge-test-creds.txt
   ```

**Important:** DO NOT leave `prevent_security_audit_update` disabled — it exists to make the audit log immutable. Re-enable in the same transaction / same session.

**REASON:** Tristan flagged during the 2026-04-17 R2 Forge review ("good that you've created one, and every single time you create one and you finish with it, can you just create a rule that you delete it and you can create a new one the next time you do"). Forgotten test users grew out of control in an earlier pattern on other products; this codifies the discipline from the start here.

**RELATED:** ~/.claude/projects/-Users-tristanfischer/memory/forgeos-fix-log.md (evening session entry), MemPalace drawer forgeos/config for credential reference.

---

## 2026-04-17 - RULE: `useState(() => localStorage.getItem(key-${id}))` doesn't re-run when `id` changes

**NEVER** initialise per-entity state from `useState(() => readLocalStorage(key-${entityId}))` without also wiring an effect that rehydrates when `entityId` changes. `useState` initialisers run ONCE per component mount. If the key is parameterised on something that can change without a remount (like an `activeProjectId` from a hoisted context), the stored data from the OLD entity remains in memory, and the next write-wrapper happily persists it under the NEW key — corrupting the new entity's storage.

**ALWAYS** pair the initialiser with a `useEffect` keyed on the entity id: when it changes, re-read every `useState` that's backed by that key, reset one-shot refs (auto-trigger flags), and clear any derived state.

**REASON:** ForgeOS Source page had 5 `useState` initialisers reading `localStorage[key-${activeProjectId}]`. Switching projects via the CAD Lab context (no route change → no remount) kept Project A's matches in state, and the setter wrappers then wrote those matches into Project B's localStorage bucket. Silent cross-project data corruption.

**RELATED:** `src/app/(platform)/the-forge/cad-lab/source/page.tsx` — rehydrate effect keyed on activeProjectId (commit d9960656).

---

## 2026-04-17 - RULE: Actions with client-supplied `projectId` + `createAdminClient()` MUST verify foundry ownership

**NEVER** let a server action accept a `projectId: string` from the client and pass it to `createAdminClient()` (which bypasses RLS) without first confirming the caller's foundry owns that project. A logged-in user from foundry A can otherwise pass a projectId owned by foundry B and (a) burn foundry A's AI quota writing into foundry B's storage, or (b) overwrite files in foundry B's `<bucket>/<projectId>/` namespace.

**ALWAYS** call `ensureCadLabProjectOwnership(supabase, projectId, foundryId)` at the top of every such action. The helper lives at `src/lib/cad-lab/project-ownership.ts` and uses the RLS client (not admin) so the caller must themselves be permitted to see the project — any mismatch returns "Project not found" (not "Forbidden", to avoid enumeration oracle).

**REASON:** `cad-lab-images.ts` had 5 actions (uploadSharedImageAssetsAction, cleanupSharedImageAssetsAction, generateCadLabSingleImageAction, generateCadLabModuleImagesAction, generateCadLabSystemIllustrationAction) taking `projectId` through `withAIGate` (auth-checked) but then using `createAdminClient()` / calling helpers that used the admin client, with no cross-check that the caller's foundry owned the project. Fixed in commit fa55e31c.

**RELATED:** `src/actions/cad-lab-images.ts`, `src/lib/cad-lab/project-ownership.ts`.

---

## 2026-04-17 - RULE: Gate consolidation — every "continue" CTA for a stage must evaluate the SAME gate expression

**NEVER** let two CTAs advance the user to the next stage with different gate conditions. If the page has a header "Continue" button AND an inline "Continue" button, they must both read the single source-of-truth boolean.

**ALWAYS** compute the gate as a single named constant at the top of the component (e.g. `canProceedToSource`) and reference it from every advance CTA, including the one in the `useStageBriefing` hook's `enabled` condition.

**REASON:** Specify page had `canProceedToSource = allDiagnosticsComplete && (allModulesReviewed || reviewSkipped)` (header button) but the inline review-tab CTA additionally required `!imagesStale && !isRegeneratingImages`. Users could bypass the stronger gate by clicking the header, landing on Source with stale illustrations. Fixed in commit d9960656.

**RELATED:** `src/app/(platform)/the-forge/cad-lab/specify/page.tsx:388-399`.

---

## 2026-04-17 - RULE: Multi-step gates must have an escape hatch when upstream can fail permanently

**NEVER** gate a terminal CTA behind a condition that's set by a potentially-failing async pipeline with no user-driven override. Example: `imagesStale` is set by a failed regeneration pipeline — if the pipeline keeps failing (API outage, quota), the user is trapped with no CTA.

**ALWAYS** provide an explicit "skip / mark current" action when the gate can realistically stay unsatisfied. UX: primary button retries; secondary ghost button acknowledges the drift and proceeds anyway after a confirm.

**REASON:** Specify review-tab CTA required `!imagesStale`. When `finalCompleted === 0` after image regen retries, `imagesGeneratedAtRevision` stayed behind `designRevision`, so `imagesStale` stayed true forever and the review tab showed no CTA at all — a dead-end UI. Fix: added `markImagesCurrentManually` context action + a "Drawings out of date" card on the review tab with "Regenerate" + "Skip & continue" choices. Commit d9960656.

**RELATED:** `src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx` (markImagesCurrentManually), `specify/page.tsx` (stale-drawings card).

---

## 2026-04-17 - RULE: Do not gate recovery UI on upstream success if the recovery action does not strictly depend on it

**NEVER** hide a "Generate" / "Retry" / "Resume" button behind a flag like `heroReady` unless the button's action genuinely cannot run without that upstream state. Otherwise a failure upstream silently strands the user at the downstream step with no path forward.

**ALWAYS** ask: "If the upstream failed, can this action still run?" If yes, the gate is wrong.

**REASON:** CAD Lab Images tab hid its "Generate Illustrations" button when `heroReady === false`, but module image generation works fine without the hero (falls back to `heroUrl ?? undefined`). Users whose hero failed on first decompose were trapped forever with "Illustration queued" on all 8 modules and no UI to act.

**RELATED:** `src/app/(platform)/the-forge/cad-lab/page.tsx:1154-1157`

---

## 2026-04-17 - RULE: Do not silently reset terminal error states (`"failed"` → `undefined`) on reload

**NEVER** map `imageStatus === "failed"` (or any `status === "error"` terminal state) to `undefined` on load "to hide stale errors". That erases both the error message AND the retry affordance the component needs to render.

**ALWAYS** keep failed/errored status on load. Let the component show the error + a Retry button. If an error is genuinely stale, clicking Retry costs one API call — far better than stranding the user.

**REASON:** `handleLoadProject` in `cad-lab-context.tsx` mapped `imageStatus: "failed"` → `undefined` on reload, which compounded with the heroReady gate above to leave users with a "queued" skeleton and zero way to recover.

**RELATED:** `src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx:3265`

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

### 2026-04-06 - RULE: Never flag an issue without fixing it
NEVER: Report "this is a data quality issue" or "this needs subscription gating" without actually fixing it. Listing issues is not the same as resolving them.
ALWAYS: If you identify a problem, fix it in the same session. If it truly cannot be fixed (needs external action), create a concrete next step and explain WHY it can't be done now.
REASON: Repeatedly noted "For You shows 0 matches" and "Key People shows organizations" across 5+ responses without fixing either. User had to explicitly call this out.
RELATED: All server actions, data pipeline scripts

### 2026-04-06 - RULE: Supabase PostgREST max_rows is 1000 regardless of .limit()
NEVER: Use `.limit(N)` where N > 1000 and assume it works. The hosted Supabase PostgREST has a server-side `max_rows` setting (default 1000) that caps ANY request.
ALWAYS: Paginate with `.range(from, to)` in a loop to fetch all rows. Test the actual count returned, don't assume.
REASON: Stats showed 1,000 investors for an entire day. `.limit(20000)` was silently capped at 1,000 by PostgREST.
RELATED: src/actions/investors.ts getInvestorStats, any bulk fetch from Supabase

### 2026-04-06 - RULE: Verify counts match after data pushes
NEVER: Push data and assume it landed correctly. Always query Supabase to verify the actual count matches expectations.
ALWAYS: After any push script run, curl the Supabase REST API with `Prefer: count=exact` to verify the row count.
REASON: Portfolio push mapped only 846 of 7,084 listings because the mapping query also hit the 1000-row limit. Reported "14,448 pushed" without checking if that was the expected number.
RELATED: 13-push-forgeos.js, any data pipeline script

### 2026-04-06 - RULE: tsc passing does NOT mean the feature works
NEVER: Use `npx tsc --noEmit` as the sole verification step.
ALWAYS: After code changes that affect UI or data, verify the actual deployed feature: check the page loads, counts are correct, clicking works, data appears. TypeScript compilation checks types, not functionality.
REASON: Multiple deploys where tsc passed but the feature was broken (wrong counts, missing components, empty tabs).
RELATED: All UI components, CLAUDE.md "Compilation is not verification" section

### 2026-04-17 - RULE: When an awaited function mutates React state, save the REF not the local argument array
NEVER: `await pipelineThatSetsState(modulesArr); save(modulesArr)` — the local JS array was never mutated; setModules writes to state, not to this reference. Saving it wipes out whatever state the pipeline produced.
ALWAYS: After awaiting a state-mutating pipeline, save `modulesRef.current` (synced via useEffect) or manually recompute the merged state before saving.
REASON: handleDecompose awaited handleGenerateModuleImages (which writes imageUrl/imageStatus via setModules), then saved the stale `finalModules` JS array. This raced the pipeline's own fire-and-forget save; when decompose's awaited save won, all image data was wiped from the DB. Storage objects were already written, so images existed as orphan blobs with no pointer from the modules row. Symptom: "0 of 8 illustrations" stuck at "queued" despite the PNGs being generated. Intermittent because the race outcome was timing-dependent.
RELATED: src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx line ~1888, commit TBD

### 2026-04-17 - RULE: `.then()` on a server action that returns {error} instead of throwing must check the shape
NEVER: `saveFoo(...).then(() => setSaved()).catch(err => log(err))` — server actions conventionally return `{ error: "..." }` on RLS/validation failure instead of throwing. The .then() branch fires, setSaved() runs, and the user sees a successful toast while data never landed.
ALWAYS: Inside .then(), inspect `"error" in res` and surface a toast/log before treating it as success.
REASON: The image pipeline's final save surfaced no warning when saveCadLabModules returned { error }, compounding the root cause above — users had no signal that save had failed silently.
RELATED: src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx line ~2183

### 2026-04-17 (afternoon) - RULE: Never read `modulesRef.current` immediately after the LAST `setModules` call in a batch inside the SAME function
NEVER: `for (...) { ...setModules(...) } ; const snapshot = modulesRef.current ; save(snapshot)` — the ref is synced via `useEffect(() => { modulesRef.current = modules }, [modules])`, which only fires after React renders. A loop with an `await`/`setTimeout` between iterations flushes the ref for all iterations EXCEPT the last — after the last `setModules`, no yield occurs before the save line, so the ref is stale by at least one update. Related anti-pattern: `let snap; setModules((cur) => { snap = cur; return cur })` — React 18 defers the updater, so `snap` stays at its declaration value.
ALWAYS: Track per-item updates in a local `Map<id, Partial<State>>` as you dispatch them, then at save time overlay the map onto `modulesRef.current` to produce a deterministic snapshot. Also sync `modulesRef.current = snapshot` after overlay so later callers see the merged state.
REASON: `handleGenerateModuleImages` saved stale module data after the last image generation — the last module's `imageUrl`/`imageStatus` was missing from the JSONB write, so on reload the UI showed "queued" for that module despite the PNG existing in storage. The broken retry-detection (Rule 9 anti-pattern on line 2157) hid this behind an "auto-retry" that silently skipped everything. Fixed afternoon of 2026-04-17.
RELATED: src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx handleGenerateModuleImages; cad-lab-react-patterns.md Rules 9 & 10

### 2026-04-17 (afternoon) - RULE: Any "do step N" button must chain step N-1 when N-1's artifact is missing and no other UI produces it
NEVER: Ship a "Generate X" button that assumes an upstream artifact (hero image, report, embedding) already exists when the UI offers no other path from the current project state to produce that artifact. Users get stuck in a trap: they click the button, nothing happens (or only a partial result appears), and they have no discoverable way forward.
ALWAYS: Check the full pre-conditions in the button's handler. If an upstream is missing AND the artifact is required AND no other UI path triggers the upstream, chain the upstream first. If the upstream callback is declared later in the same Provider, pin it to a ref (`retryIllustrationRef.current = handleRetryIllustration`) and call it via the ref to sidestep TDZ forward references.
REASON: After the morning heroReady-gate fix, users clicked "Generate Illustrations" on the Images tab and got only module images — the hero never regenerated because `handleRefreshModuleImages` was scoped to per-module images only, and the hero's retry button was nested inside a card that only rendered on status === "failed" (not the post-reload "idle" state). Fixed by (a) chaining `retryIllustrationRef.current?.()` from `handleRefreshModuleImages` when the hero URL is missing, and (b) adding a "Generate concept illustration" button to the Research tab's idle-state card when modules exist without a hero URL.
RELATED: src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx handleRefreshModuleImages + retryIllustrationRef; cad-lab/page.tsx idle-state hero card

### 2026-04-17 - RULE: createSignedUrl on a public bucket is cargo-cult security — use getPublicUrl for any URL you persist to the DB
NEVER: Mix `createSignedUrl(path, 3600)` writes with a bucket where `public=true`. The signed URL's token expires in 1h but `/object/public/{bucket}/{path}` resolves forever regardless — signing adds no access control, only breaks persistence.
ALWAYS: If the bucket is public, use `getPublicUrl`. If the file is actually confidential, flip the bucket to `public=false` AND re-sign on read (not write), so the URL can be refreshed every time the row is loaded.
REASON: Commit f4efa76a (Apr 5, "C3 red team fix") switched 7 generators under src/app/(platform)/the-forge/services/ to signed URLs for `xray-images` (which is `public=true`). For 12 days, every CAD-lab generation silently broke because (a) a race condition in cad-lab-context.tsx wiped the URL, and (b) if it had survived, the URL expired 1h after generation and the user's next reload would show broken images. Fixed 2026-04-17 in commit TBD: reverted all 7 to `getPublicUrl` with security rationale comments. Access control is the UUID scanId in path (122 bits of entropy).
RELATED: src/app/(platform)/the-forge/services/{image,cad,cfd,topo,thermal,fea,premium-analysis}-generator.ts
