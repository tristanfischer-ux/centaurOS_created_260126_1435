# Forge End-to-End Review Tracker

**Opened:** 2026-04-17
**Owner:** Agent (autonomous — user is away)
**Scope:** Design → Specify → Source → Assemble, end-to-end walkthrough on production using HAPS UAV dummy project, fix everything that breaks, 5 red team rounds.

**Dummy project:** European HAPS UAV — 5–10m wingspan, 20km altitude, 7–14 day endurance, comms/ISR payload. Already exists in `fractionalforge.app` (screenshotted by user, Specify 8/8, images queued).

---

## Success criteria

- [ ] Every page (Design, Specify, Source, Assemble) loads without console errors
- [ ] All 8 illustrations render (not stuck queued, not stuck failed)
- [ ] Every interactive element on each page works (buttons, tabs, CTAs, downloads)
- [ ] Data flows correctly through the 4 stages
- [ ] Cost Summary on Specify has prominent BETA warning (requested by user)
- [ ] All red team rounds (5) produce findings AND fixes, not just findings
- [ ] All P0/P1 bugs fixed on `main`, deployed, verified on live site
- [ ] Final written report lists every issue with status

## Abort criteria

- If a fix causes a regression in a feature not being reviewed → stop, revert, document
- If a fix requires a migration and migration fails → stop, diagnose, do not leave unapplied
- If Vercel deploy fails twice in a row → stop, diagnose with `vercel logs`

---

## Phase 0 — Setup (DONE)

- [x] agent-browser 0.25.3 verified
- [x] Topic files loaded (cad-lab-react-patterns, cad-lab-specify-architecture, pipeline-lessons-learned)
- [x] Latest commit noted: `99a585b7 fix(cad-lab): unstuck Images tab when hero generation fails`
- [x] Uncommitted expert-match diff reviewed — safe, not mine to commit
- [x] Tracker created

## Phase 1 — User's explicit request: Cost Summary BETA warning

- [x] Add prominent amber warning banner above Cost Summary
- [x] Language: (1) BETA, (2) rough early estimates, could be completely wrong, (3) must be fully reviewed by qualified people
- [x] Commit + push (3692c46f)
- [x] Verify Vercel deploy (Ready on Production)
- [ ] Verify on live site with agent-browser (BLOCKED: no auth credentials for Tristan's account)

## Phase 2 — Design page walkthrough

- [ ] Open HAPS UAV project on fractionalforge.app
- [ ] Research tab: content renders, no console errors
- [ ] Modules tab: 8 modules present, each has required fields
- [ ] Images tab: all 8 illustrations either complete or have retry
- [ ] Re-Research button works
- [ ] Download Engineering Report works
- [ ] Capture bugs → findings list below

## Phase 3 — Specify page walkthrough

- [ ] Overview tab renders (with new BETA banner)
- [ ] Module Specs tab: diagnostic fields, "Continue to Review" gate logic
- [ ] Specialist Review tab: 4 engineers, Start Review flow
- [ ] Manufacturing Intelligence tab: (new, not in stale 4-tab memory)
- [ ] Executive Review tab: (new, not in stale 4-tab memory)
- [ ] Download Report works
- [ ] Bottom CTA to Source works

## Phase 4 — Source page walkthrough

- [ ] BOM renders
- [ ] Supplier matching per module
- [ ] Quote request flow
- [ ] Back to Specify preserves state

## Phase 5 — Assemble page walkthrough

- [ ] Assembly instructions render
- [ ] Outputs / exports present
- [ ] Get Quote CTA functional

## Red Team — 5 rounds (each round: find, fix, verify, log)

- [ ] Round 1 — Image pipeline (timeouts, stuck states, idempotency, cache-bust, Flight payload)
- [ ] Round 2 — State / navigation (stale closures, hydration, deep-link, back/forward)
- [ ] Round 3 — Auth, tenancy, RLS (cross-foundry probes, signed URLs, server action wrappers)
- [ ] Round 4 — Error states (API failure, 300s cap, empty/partial data, silent errors)
- [ ] Round 5 — Mobile / responsive / a11y (light theme enforced, keyboard, focus, contrast)

## Phase 7 — Final report

- [ ] Issues found (by severity + fix status)
- [ ] Screenshots of key states
- [ ] Remaining follow-ups
- [ ] Lessons written to `tasks/lessons.md`
- [ ] Fix log updated in `~/.claude/projects/-Users-tristanfischer/memory/forgeos-fix-log.md`

---

## Findings log

### Round 1 — deep static review (4 subagents, parallel)

**CRITICAL (P0) — fixed**
1. **Design** — `cad-lab-images.ts` actions accept client-supplied `projectId` without foundry ownership check, all use `createAdminClient()` (bypasses RLS). Cross-foundry storage overwrite + quota burn. Applied to uploadSharedImageAssets / cleanupSharedImageAssets / generateCadLabSingleImage / generateCadLabModuleImages / generateCadLabSystemIllustration. Fixed in `fa55e31c`.
2. **Design** — modules stranded in `imageStatus: "generating"` if `handleGenerateModuleImages` throws mid-pipeline. Retry button in page.tsx only matches `["pending", "failed", undefined]`. Added catch-sweep in `cad-lab-context.tsx`. Fixed in `fa55e31c`.
3. **Design** — `handleRetryIllustration` retries hero only; module images stay bad (ran without hero reference). After successful hero retry, now chains `handleGenerateModuleImages` for any failed/pending modules. Fixed in `fa55e31c`.
4. **Source** — `matchCadLabModuleSuppliers` had zero auth, allowed unauthed embedding cost abuse + marketplace enumeration. Fixed by `getUser()` gate at `fc507919`.
5. **Source** — `getLinkedRFQQuotes` had zero auth AND no scope check. Any authed user could enumerate any RFQ id and pull competitor quotes. Added auth + buyer-or-same-foundry check + UUID validation at `fc507919`.
6. **Source** — project-switch corruption: all `useState(() => localStorage.getItem(key-${id}))` initialisers read once at mount, stale across project change, setters write into the NEW project's bucket. Added rehydrate effect keyed on `activeProjectId` at `d9960656`.
7. **Assemble** — `matchAssemblyCompanies` had zero auth. Added `getUser()` gate at `fc507919`.

**HIGH (P1) — fixed**
8. **Specify** — Header "Continue to Source" bypassed `imagesStale` gate that the review-tab CTA enforced. Unified into single `canProceedToSource` at `d9960656`.
9. **Specify** — `imagesStale=true` trap: if total regen fails, `imagesGeneratedAtRevision` never advances, CTA never appears. Added `markImagesCurrentManually` + "Drawings out of date" card with Regenerate/Skip at `d9960656`.
10. **Specify** — `cad-lab-cost.ts` DeepSeek call used raw `fetch()` with no timeout, could burn full Vercel 300s budget. Wrapped in `fetchWithTimeout(90s)` at `d9960656`.
11. **Assemble** — Branding/shipping free-text fields (Rule 27) had no maxLength. Added client-side caps with visible counters at `d9960656`.

**Red team rounds (5) — in progress**
_(populated as subagents return)_

## Scorecard

| Stage | Loaded OK | Static Review | P0s Fixed | P1s Fixed | Outstanding |
|-------|-----------|---------------|-----------|-----------|-------------|
| Design | - (auth-blocked) | ✅ | 3/3 | 0/flagged | see red team |
| Specify | - (auth-blocked) | ✅ | 0 critical found | 3/3 | see red team |
| Source | - (auth-blocked) | ✅ | 3/3 | 0 flagged | see red team |
| Assemble | - (auth-blocked) | ✅ | 2/2 | 1/1 | see red team |

## Commit log

| Commit | Description | Pushed | Vercel |
|--------|-------------|--------|--------|
| `3692c46f` | Cost Summary BETA warning | ✅ | Ready |
| `fc507919` | Auth on 3 unauthed actions (bundled with slug backfill) | ✅ | Ready |
| `fa55e31c` | Foundry-scope image actions + unstuck generating + hero retry cascade | ✅ | Ready |
| `d9960656` | Source rehydration + gate unification + imagesStale escape + DeepSeek timeout + Assemble caps | ✅ | Building |
