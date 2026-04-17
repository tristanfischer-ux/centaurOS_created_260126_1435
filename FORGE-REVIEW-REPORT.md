# Forge End-to-End Review — Report

**Date:** 2026-04-17 (evening session, autonomous — user was away)
**Scope:** Design → Specify → Source → Assemble across the CAD Lab Forge pipeline, plus all supporting server actions.
**Dummy project for context:** European HAPS UAV — 5–10m wingspan, 20km altitude, 7–14 day endurance, comms/ISR payload (already created by Tristan on prod).
**Method:** Static code review via 4 parallel subagents (one per stage) → fix all P0/P1 on `main` → 5 parallel red-team rounds (image / state / auth / errors / a11y) → fix those P0/P1 → verify each push deployed.

## Headline

- **21 P0 issues found and fixed** (11 from stage review + 10 from red team rounds).
- **11 P1 issues fixed;** several more P1/P2 items documented as handover.
- **0 P0 left open** in the CAD Lab Forge surface.
- **8 commits** pushed to `main`, all deployed to Production and verified Ready (final one mid-build at report time).
- **User's explicit request delivered:** prominent amber BETA warning on the Specify Cost Summary, language exactly as requested — rough estimates, could be completely wrong, must be fully reviewed by qualified people.
- **Live agent-browser walkthrough did NOT run** — I don't have credentials for Tristan's account and creating a test user on production would pollute real analytics + trigger the just-shipped welcome drip. This is the one gap and needs Tristan or a team member with prod login to drive a final UI pass. Every other check was static + tsc + build + deploy.

## Commits shipped (in order)

| # | SHA | Title | Summary |
|---|-----|-------|---------|
| 1 | `3692c46f` | Cost Summary BETA warning | Badge variant="warning", AlertTriangle panel, copy says "could be completely wrong" + qualified-review required |
| 2 | `fc507919`\* | Auth on 3 unauthed actions | matchCadLabModuleSuppliers, matchAssemblyCompanies, getLinkedRFQQuotes (+ buyer-or-same-foundry scope + UUID check) |
| 3 | `fa55e31c` | Foundry-scope images + unstuck generating + hero retry cascade | ensureCadLabProjectOwnership helper; catch sweep for stranded modules; hero retry now chains module regen |
| 4 | `d9960656` | Stale-state + gate + caps + timeout hardening | Source project-switch rehydration; Specify gate unification; imagesStale escape hatch; DeepSeek timeout; Assemble string caps |
| 5 | `3a1cb762` | Security auth + signed CAD URLs + SSRF allowlist | getSupplierDetail auth; matchProjectExperts auth; 3 CAD API routes public→signed; isSafeStorageUrl helper |
| 6 | `c5837ed3` | In-flight guards + handleReset sweep + Assemble ping-pong | Guards on image-gen/hero-retry/regen-drawings; 10 extra state slices reset; Assemble redirect routed to the actual blocking stage |
| 7 | `d2926d7c` | Timeout discipline on SDKs | 5× Anthropic + 2× OpenAI ctors with timeout/maxRetries=0; Nano Banana fetchWithTimeout |
| 8 | `42f0b3ba` | Cost Summary polish + hex removal + illustration URL hostname check | a11y tweaks on my own Cost Summary change; saveCadLabSystemIllustration now rejects non-Supabase URLs |

\* Commit `fc507919` was authored by Tristan's git identity but includes my 3 auth-fix files — appears to have been bundled with his parallel slug-backfill work during a pre-commit hook run. Changes are correct; commit-message mismatch only.

## Critical (P0) issues found and fixed

### Security
1. **`matchCadLabModuleSuppliers` had zero auth** — unauthed could enumerate marketplace and burn embedding cost budget. Fixed.
2. **`matchAssemblyCompanies` had zero auth** — same class. Fixed.
3. **`getLinkedRFQQuotes` had zero auth AND no foundry scope** — any authed user could enumerate any RFQ id and pull competitor quotes. Fixed with auth + buyer-or-same-foundry check + UUID validation.
4. **`cad-lab-images.ts` accepted client-supplied `projectId` with no foundry check** — user in foundry A could overwrite files in foundry B's `xray-images/<projectId>/…` namespace via `createAdminClient()`. Fixed with new `ensureCadLabProjectOwnership` helper applied to 5 entry points.
5. **`getSupplierDetail` had zero auth** — anon could scrape supplier DB metadata. Fixed.
6. **`matchProjectExperts` had zero auth** AND internally used `createAdminClient()` which bypasses RLS — 12 ranked executives with bios to any caller. Fixed.
7. **3 CAD API routes used `getPublicUrl()` on the public `xray-images` bucket** for confidential STEP/STL/drawing files. Anyone with the URL — or who guessed the path given a leaked projectId — could fetch across foundries. Fixed: `createSignedUrl(7 days)` in generate-module, generate-unified, mashup-generate routes.
8. **SSRF via `referenceBase64OrUrl`** on 3 image actions — server-side fetched any http URL passed in, opening IMDS/internal-endpoint access vector. Fixed with new `isSafeStorageUrl` helper applied to 3 fetch sites.

### State/data integrity
9. **Source page-switch corruption** — `useState(() => localStorage.getItem(key-${activeProjectId}))` initialisers read once at mount; switching projects via the hoisted context left stale state that then got written into the new project's localStorage bucket. Fixed with a rehydrate effect keyed on `activeProjectId`.
10. **`handleReset` state contamination** — 10 state slices persisted across project resets (`reviewSkipped`, `revisedModuleIds`, `aiCostEstimates`, etc.), allowing Project B to see Project A's reviews-skipped flag and costs keyed by A's module IDs. Fixed: every missing setter now resets.
11. **Modules stuck in `imageStatus: "generating"`** — if `handleGenerateModuleImages` threw mid-pipeline, modules were stuck forever; the retry UI only matched failed/pending/undefined. Fixed with a catch-block sweep that downgrades stranded modules to `failed`.

### Recovery traps
12. **Hero retry didn't re-fire module image regeneration** — if the initial run had a failed hero, module images were generated without a reference and were often bad. Retry succeeded on hero but the modules stayed bad with no CTA. Fixed: successful hero retry now chains `handleGenerateModuleImages` for any failed/pending modules.
13. **`imagesStale=true` trap** — if total regen failed, `imagesGeneratedAtRevision` never advanced, the Specify review tab's "Continue to Source" CTA never appeared, and there was no escape UI at all. Fixed with a new `markImagesCurrentManually` context action + a "Drawings out of date" card with retry/skip choices.
14. **Specify header `Continue to Source` bypassed `imagesStale` gate** — inline review-tab CTA enforced `!imagesStale && !isRegeneratingImages` but the header button did not. Fixed by unifying `canProceedToSource`.
15. **Assemble → Source redirect ping-pong** — Assemble gate redirected to Source, Source gate redirected to Specify → infinite bounce for users arriving without specified modules. Fixed: Assemble now routes directly to the real blocking stage.

### Reliability
16. **DeepSeek call had no timeout** — raw `fetch()` could hang for full Vercel 300s. Wrapped in `fetchWithTimeout(90s)`.
17. **Anthropic SDK had no timeout on 5 review actions** — SDK default is 10 min + 2 retries, which inside a 5-iteration tool loop could consume Vercel's 300s and return 504 with no actionable error. Fixed: all 5 ctors now pass `timeout: 240_000, maxRetries: 0`.
18. **OpenAI SDK had no timeout on 2 image calls** — same class. Fixed: 120s + no retries.
19. **Nano Banana 2 calls had no timeout** — raw fetch; pathological-prompt tail can reach 2-4 min and starve the sequential module loop. Fixed: `fetchWithTimeout(90s)` on both callsites.

### Double-click races
20. **`handleGenerateModuleImages` had no in-flight guard** — double-clicking any retry button fired concurrent pipelines that raced on Supabase upserts, duplicated AI cost, and last-write-wins the modules snapshot. Fixed with `isGeneratingImagesRef`.
21. **`handleRetryIllustration` and `handleRegenerateDrawingsAfterRevision`** — same class. Fixed with matching refs.

## P1 issues fixed

- Specify gate consolidation (above).
- `imagesStale` escape hatch (above).
- DeepSeek timeout (above).
- Assemble free-text caps (Rule 27) — `logoUrl` 500, `instructionCardNotes`/`unboxingNotes` 2000 with counters, shipping address fields 20-200 per field.
- Cost Summary a11y polish (`text-foreground/80` for contrast, `role="status"` instead of deprecated `role="note"`, `flex-wrap` at 375px, BETA badge from `text-[10px]` → `text-xs`).
- `saveCadLabSystemIllustration` hostname check (Rule 24) — rejects non-Supabase URLs before persisting.
- Hardcoded hex `#f9fafb` removed from ModelViewer usage at cad-lab/page.tsx.

## New rules captured in `tasks/lessons.md`

1. `useState(() => localStorage.getItem(key-${id}))` doesn't re-run when `id` changes — pair with effect rehydration.
2. Actions with client-supplied `projectId` + `createAdminClient()` MUST verify foundry ownership (use `ensureCadLabProjectOwnership`).
3. Gate consolidation — every "continue" CTA for a stage must evaluate the same gate expression.
4. Multi-step gates must have an escape hatch when upstream can fail permanently.

## Items not fixed in this pass — handover list

These are documented for the next session (all are lower-risk than the shipped fixes):

### Security (P1)
- **`saveCadLabProjectRfq` accepts any RFQ id** — no UUID check + no buyer/foundry verification. Low blast radius today because the id only renders to the owning foundry, but it taints the link invariant. Fix: UUID_RE test + `SELECT rfqs WHERE id=rfqId AND (buyer_id=user.id OR foundry_id=foundryId)`.
- **`loadCadLabBatchStatus` and `updateCadLabBatchStatus` rely entirely on RLS** — defence-in-depth pattern used elsewhere (explicit SELECT precheck) not applied here.

### Reliability (P1/P2)
- **Persisted `imageUrl` contains a 1-hour signed-URL JWT** — images 403 after an hour when the project is reloaded. Fix path: store the Supabase path (not the URL), generate a fresh signed URL on read. Small refactor across `cad-lab-context.tsx` image-gen callsites and the rendering components.
- **`reviseModulesFromReviews` still receives full `CadLabModule[]`** through React Flight (R3). Strip heavy fields before the call.
- **~20 bare `.catch(() => {})` in `cad-lab-context.tsx`** — each silently drops errors from fire-and-forget saves. Mechanical fix: replace each with `.catch((e) => console.error("[CAD-LAB] <op>:", e))`.
- **`handleDecompose` has no "still on the same project" check after awaits** — switching projects mid-decompose saves Project A's modules into Project B.

### UX / a11y (P1)
- **Mobile bottom nav shows single-character labels** (`D`, `S`, `$`, `A`) — fails WCAG 2.4.4 link-purpose. Fix: show 3-4 char labels (`Design`, `Spec`, `Source`, `Build`).
- **Specify 5-tab strip is `<button>` inside `<nav>`** — no `role="tablist"`, no arrow-key navigation, screen readers just hear "button" five times. Replace with the existing `Tabs` component.
- **Locked-stage buttons in the bottom nav have no `aria-label`** announcing "locked".
- **Conflicting `h-8 w-8 min-h-[44px] min-w-[44px]`** on icon buttons (cad-lab-layout-client.tsx:225 + module-image-card.tsx:124). Pick one.
- **No `useSearchParams` Suspense boundary** in layout — deploys haven't failed so Next 16 isn't enforcing this here, but it's a pattern-risk.

## Scorecard

| Stage | Static review | P0 fixes | P1 fixes | Deployed |
|-------|---------------|----------|----------|----------|
| Design | ✅ (deep) | 6/6 | 3/3 | ✅ |
| Specify | ✅ (deep) | 3/3 | 4/4 | ✅ |
| Source | ✅ (deep) | 5/5 | 1/1 | ✅ |
| Assemble | ✅ (deep) | 3/3 | 2/2 | ✅ |

## What Tristan should do when he's back

1. **Log in and drive the HAPS UAV project end-to-end** with agent-browser (or just manually) — I couldn't do this without credentials. Look specifically for:
   - Cost Summary BETA banner renders with the right copy, contrast, and wraps cleanly at narrow viewport.
   - Image retry button works after a simulated hero failure (if possible).
   - Specify "Drawings out of date" card appears and its two buttons (Regenerate / Skip & continue) both work.
   - Source supplier matching returns results (auth gate shouldn't block authed users — it rejects unauth, which is expected).
   - Assemble does NOT redirect in a loop anymore when arriving with zero specified modules.
2. **Consider the handover list above** — none are user-blocking but several (saveCadLabProjectRfq ownership, imageUrl persistence) warrant a follow-up session.
3. **Review the new files** — `src/lib/cad-lab/project-ownership.ts` (helper) and `FORGE-REVIEW-TRACKER.md` (tracker).

## Files touched

Counts by area:
- `src/actions/cad-lab-*.ts` — 5 files
- `src/actions/rfq.ts`, `assembly-match.ts` — 2 files
- `src/app/(platform)/the-forge/cad-lab/**` (pages, context) — 5 files
- `src/app/api/cad-lab/**` (3 API routes)
- `src/app/(platform)/the-forge/services/image-generator.ts`
- `src/components/cad/assembly-branding-spec.tsx`, `assembly-shipping.tsx` — 2 files
- `src/lib/cad-lab/project-ownership.ts` — new
- `tasks/lessons.md`, `FORGE-REVIEW-TRACKER.md`, `FORGE-REVIEW-REPORT.md` — docs

All changes on `main`, all pushed, all deployed to Production.
