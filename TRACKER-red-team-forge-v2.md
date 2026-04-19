# TRACKER — Forge v2 red-team + multi-day simulation

**Branch:** `feat/forge-v2-redteam`
**Started:** 2026-04-19
**Base:** main @ `ace10984` (post-PR-#71, all 32 Forge v2 routes live with persistence)
**Goal:** 5 red-team audits × one end-to-end fictional-product walkthrough → zero-defect Forge v2.

---

## The fictional product — "TempGuard"

To exercise every Forge surface with realistic hardware engineering depth.

**Subject.** A ruggedised cold-chain temperature logger for stratospheric vaccine shipments — records ambient + internal temperature at 10-second intervals across a 72-hour window, transmits over LoRaWAN when back in range, survives −40°C to +60°C and mechanical shock from container handling. Target unit cost £180 at 10k volume. Target customers: vaccine logistics providers (Gavi, UPS Healthcare, DHL Medical Express) for polar-route shipments.

**Why this product.** Covers the full module taxonomy — sensor, battery pack, MCU + LoRa radio, enclosure, OLED display, firmware layer. Has real failure modes (battery self-discharge at −40°C, LoRa attenuation inside metallic shipping containers, OLED display failure below −20°C). Has real assumption-test candidates (will pharma buyers actually pay £180 vs the existing £45 disposable?). Has real fork candidates (defence variant with extended 14-day endurance).

**Narrative arc across simulated days.**

| Day | Activity | Pages exercised |
|---|---|---|
| 1 AM | Create project via /new wizard — describe subject in step 1, leave references empty, confirm | /the-forge-v2/new |
| 1 PM | Research runs (simulate — AI pipeline is not in scope for RT). Review /brief, start authoring product overview. | /brief |
| 2 AM | Decomposition runs. Review /modules list. 6 modules generated. | /modules, /modules/[id] |
| 2 PM | Drill into Sensor module — edit description, add failure modes, flag unknowns. | /modules/sensor |
| 3 AM | Start BOM. Add 3 parts to Sensor module with real specs. | /bom, /modules/sensor/parts/[id] |
| 3 PM | Log first assumption: "pharma buyers pay £180". Expected outcome defined. | /assumption-test |
| 4 AM | Review /risks — 12 failure modes across modules. | /risks |
| 4 PM | Supplier matching — filter by CFRP specialism. Shortlist 3. | /suppliers, /suppliers/[id] |
| 5 AM | Cost rollup — add overrides. | /cost |
| 5 PM | Lock brief (/brief-lock) after green-lighting the spec. | /brief-lock |
| 6 AM | Generate investor handoff from /outputs. Verify Markdown download. | /outputs |
| 6 PM | Fork for defence variant — name "TempGuard · Defence · 14-day". Land in new cockpit. | /fork |
| 7 AM | On the fork: review modules (inherited), start new brief. | /projects/[forkId], /brief |
| 7 PM | Log second assumption on original project: "LoRa works inside metallic container". Decision: kill. | /assumption-test |
| 8 AM | Decide original project is a maybe → archive with lesson. | /archive |
| 8 PM | Confirm archive removes from workspace list. Restore. | /the-forge-v2 |
| 9 AM | Launch readiness check on the defence fork — verify checklist reflects real state. | /launch |
| 9 PM | Walk /review and /revisions — confirm empty-state legibility. | /review, /revisions |

Hitting every route from PR #66 + #67 + #70 + #71.

---

## The 5 red-team passes

Each pass is an independent reviewer persona looking at the ForgeV2 surface with a different adversarial lens.

### RT.1 — Data & persistence audit (static, no browser)

**Lens.** "If I click the button, does the database actually receive the write? And when I refresh, does the UI read it back correctly?"

**Method.**
- Trace every client-side mutation in `src/app/(platform)/the-forge-v2/**` to its server action.
- Check every server action in `src/actions/cad-lab-projects.ts` has proper error handling (no silent catches).
- Verify RLS policies on new tables let an authenticated user in their foundry do SELECT/INSERT/UPDATE/DELETE.
- Check for optimistic-UI patterns that might diverge from server truth.
- Check every Supabase query handles `{ error: ... }` without crashing.

**Output.** Bug list with: location, severity (P0/P1/P2), fix plan.

### RT.2 — Empty states + error paths

**Lens.** "What if the data doesn't exist, is null, is empty, or the action fails?"

**Method.**
- Each page: what happens with 0 modules, 0 parts, 0 reviews, 0 assumption tests?
- Each action: what happens if projectId is stale, user lost auth, foundry mismatch?
- Each client hook: what happens with slow network / middle-of-request navigation?

**Output.** Bug list.

### RT.3 — Navigation + deep linking

**Lens.** "If I bookmark a URL and come back tomorrow, does it just work?"

**Method.**
- URL-encode/decode integrity on part-detail (complex keyParts strings with hyphens, quotes, Unicode).
- Breadcrumb links from every page lead to working destinations.
- Back-button after a router.push (e.g. after fork → new project) behaves sanely.
- searchParams (e.g. `?specialism=cnc`) preserved across refresh.

**Output.** Bug list.

### RT.4 — Authoring ergonomics

**Lens.** "Is the founder going to swear at this form at 11pm?"

**Method.**
- Each form: submit empty, submit over-long, paste malformed URL, paste emoji, tab through fields.
- Dirty-state warnings when navigating away.
- Char counters hit min/max correctly.
- Loading/disabled/error states coherent.
- aria-invalid wired on required fields.

**Output.** Bug list.

### RT.5 — Cross-page flow coherence

**Lens.** "Does the whole system tell a coherent story?"

**Method.**
- Lock brief on /brief-lock → verify /brief reflects locked state.
- Archive project → verify /the-forge-v2 hides it → restore → verify it reappears.
- Fork → verify parent shows "forked children" (if we track that), fork shows "forked from" ancestry.
- Create assumption test → does anywhere else show the test count? (Probably not yet — flag as gap.)
- Add part to BOM → does /modules/[id] reflect the new part count?

**Output.** Bug list + gap list (things that don't exist but should).

---

## Execution plan

**Single branch:** `feat/forge-v2-redteam` from main @ `ace10984`. Work in `/tmp/forge-redteam` worktree (main repo has dirty state from other terminals).

**Execution order.**
1. RT.1 static (code read + SQL check) — 30 min.
2. Create TempGuard project + drive days 1–4 of narrative (browser, when available).
3. RT.2 empty-state sweep — 30 min.
4. Drive days 5–9 of narrative.
5. RT.3 + RT.4 + RT.5 interleaved with the narrative — each flags bugs as encountered.
6. Bug-fix pass — 1 PR per batch, max 3 files per PR for review-ability.
7. Final report.

**Browser etiquette.** 5 terminals contend for agent-browser. Check `agent-browser get url` before each attempt. If held by another terminal (URL on file:// or another domain), backoff 120–180 s. Do static work while waiting.

**Commit cadence.** One RT pass = one commit + push per bug fix. PR only when the fix is merge-ready (`tsc 0 / design-tokens PASS / next build green`).

**Abort criteria.**
- A fix introduces regressions on unrelated pages.
- A bug requires a destructive migration (would stop and reconsider scope).
- Context budget runs tight — land what's fixed + write a HANDOVER for a follow-up.

---

## Bug log (append as discovered)

| ID | RT pass | Severity | Page/file | Finding | Fix status |
|---|---|---|---|---|---|
| B1 | RT.1 | P0 | `brief/page.tsx:63` | `initialLockedAt` hardcoded to `null` — BriefEditor never sees real lock state even though the column and action shipped in PR #71. | ✅ Pass `project.briefLockedAt`. |
| B2 | RT.1 | P0 | `brief-editor.tsx` | `handleLock` / `handleUnlock` only flip local state; the real `lockCadLabBrief` / `unlockCadLabBrief` server actions are never called from the inline authoring surface. (Only `/brief-lock` page persists.) | ✅ Rewired both to call the real actions via `useTransition`. |
| B3 | RT.1 | P0 | `saveCadLabProductOverview` | No server-side lock check — the textarea disables locally but a script/stale tab can still save over a locked brief. Advisory-only lock. | ✅ Added a pre-update `SELECT brief_locked_at` check; rejects with "Brief is locked — unlock before editing" when non-null. |
| B4 | RT.1 | P1 | `lockCadLabBrief`, `unlockCadLabBrief`, `archiveCadLabProject`, `exportProjectHandoffMarkdown`, `saveCadLabProductOverview` | Relied entirely on RLS for foundry isolation. Works in theory, but no defence in depth — any RLS regression becomes a cross-foundry bug. | ✅ Added explicit `.eq("foundry_id", foundryId)` on every update / select. RLS + explicit filter = belt-and-braces. |
| B5 | RT.1 | P1 | `createCadLabPart` | Didn't validate that the `moduleId` existed on the project's `modules` array. Allowed orphaned parts (rows pointing at a module that no longer exists on the JSONB). Also didn't verify project belonged to caller's foundry beyond RLS. | ✅ Pre-insert: `SELECT id, modules FROM cad_lab_projects WHERE id = ? AND foundry_id = ?`, then verify the moduleId is in the returned modules array. Rejects with "Module 'X' not found on project" if orphan. |

---

## Verification gate (before final merge)

- [ ] tsc --noEmit baseline preserved (0 after recent type regen).
- [ ] scripts/check-design-tokens.sh src/app/(platform)/the-forge-v2/ PASS.
- [ ] next build green.
- [ ] Pre-push hooks clean.
- [ ] All 32 Forge v2 routes respond 307 or 200 on a curl probe (route still live).
- [ ] Spot-check the 6 backend actions via Supabase SQL (rows actually inserted during narrative).
