# CAD Lab Images — Root Cause & Recovery Tracker

**Started:** 2026-04-17 ~11:40 BST (autonomous, user at lunch)
**Reported by:** Tristan (screenshot of fractionalforge.app showing 0 of 8 illustrations queued on European HAPS UAV project)

---

## Root Cause (confirmed via DB + storage + log inspection)

In `src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx`, `handleDecompose` calls the
image pipeline with `await`, then **immediately overwrites the DB with a stale JS array**:

```tsx
// Line 1864 — await image pipeline. Pipeline updates React state + fires its own save at line 2172.
await handleGenerateModuleImages(expandedModules, activeProjectIdRef.current, perModuleStyle, referenceBase64, moduleCrops, illustrationUrl)

// Line 1868 — finalModules is a reference to expandedModules, the ORIGINAL JS array.
// handleGenerateModuleImages never mutates this array — it only calls setModules (React state).
const finalModules = expandedModules

// Line 1888 — AWAITED save of stale array overwrites the good save at line 2172.
const saveRes = await saveCadLabModules(activeProjectIdRef.current, JSON.stringify(finalModules))
```

Two saves race:
- **Save A (line 2172, fire-and-forget inside pipeline):** `modulesRef.current` WITH `imageUrl` + `imageStatus="complete"`.
- **Save B (line 1888, awaited outside pipeline):** `finalModules` (= `expandedModules`) WITHOUT any image fields.

Whichever HTTP request resolves last wins. When B wins, DB modules lose all image data. Storage
objects still exist (6 × 4-5 MB PNGs in `xray-images/{projectId}/module-*.png`) but the JSONB
modules column has no `imageUrl` pointer, so the UI falls through to the pending/"queued" state.

### Evidence

| Source | Finding |
|---|---|
| `cad_lab_projects` row for HAPS UAV | 8 modules, all with `imageStatus` literally absent from JSONB; `system_illustration_url` NULL; `visual_style` NULL |
| `storage.objects` bucket `xray-images/{projectId}/` | 6 primary module PNGs, generated 10:52–11:00 UTC today (left_wing, left_propulsion, fuselage_core, empennage, eps, avionics_payload) |
| `cad_lab_projects.updated_at` | 10:49:36 UTC — BEFORE first image upload (10:52 UTC), confirming the final DB save that would have persisted imageUrls never landed |
| Git log | Bug line was untouched by today's 99a585b7 commit — that fix addressed a different reload-state issue |

Why it's intermittent: some projects (balloon, brine) persist image data fine — they won the race. HAPS lost it.

---

## Fix Plan

### Fix 1 — Stop the stale-overwrite (source of the bug)
**File:** `src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx`
**Location:** lines 1881-1895

Change the final save to merge expansion data **onto `modulesRef.current`** (which already has
`imageUrl`/`imageStatus` from the image pipeline), manually sync the ref, then save the merged
array. This keeps the expansion merge behaviour and preserves image state unconditionally.

### Fix 2 — Recover the HAPS UAV project in the DB
The 6 primary module PNGs already exist in Storage. Bucket is `public=true`, so the public URL
format works regardless of signed-URL expiry. Update the modules JSONB in-place with:
- `imageUrl: https://.../storage/v1/object/public/xray-images/{projectId}/module-{slug}.png`
- `imageStatus: "complete"`

Mirror modules (right_wing, right_propulsion) reuse their left counterpart's imageUrl (pipeline's
existing mirror detection convention).

### Fix 3 — Defensive: surface save errors at line 2172
The pipeline's own save currently only handles thrown rejections via `.catch`. If the server
action returns `{ error: "..." }` (e.g., RLS denial) the `.then()` still fires and the user sees
no warning. Add a check for `"error" in res`. Not the root cause here, but a related gap.

---

## Checklist

- [x] Query DB state for HAPS UAV project
- [x] Confirm storage objects exist
- [x] Confirm 99a585b7 is live on production
- [x] Locate stale-overwrite at line 1888
- [x] Write Fix 1 (save modulesRef merged state; manual ref sync)
- [x] Add Fix 3 error surfacing in pipeline save (.then checks `"error" in res`)
- [x] `npx tsc --noEmit` passes (exit 0)
- [x] Commit 1c45905a pushed to main (pre-push tests pass; lint warns but passes)
- [x] Run Fix 2 recovery SQL on HAPS UAV project — all 8 modules now `imageStatus=complete` with public URL imageUrl
- [x] Update `tasks/lessons.md` with two new rules
- [x] Verify Vercel deployment `iyv0tkkbk` ● Ready (Production) — aliased to fractionalforge.app, centauros.io
- [ ] Browser verify images render on fractionalforge.app HAPS UAV Images tab — blocked by no independent auth; Tristan's own reload will confirm
- [x] MemPalace drawers filed: forgeos/gotchas (2), forgeos/fixes (1), forgeos/architecture (1) — superseding prior image-pipeline architecture note

---

## Abort criteria

- If TypeScript errors after Fix 1, STOP. Re-plan before pushing.
- If Vercel deploy shows `Error` status, STOP. Investigate build failure before retrying.
- If agent-browser verification shows images still missing after recovery SQL, STOP. Diagnose
  further — may be a second bug behind this one.

---

## Round 2 — Durability (Tristan asked for "hero + module images persist when I come back"; red team 3×)

### New audit findings (supersedes prior "residual watch" note)

Pulled the whole `cad_lab_projects` table:

- 60 hero URLs + 182 module URLs across 27 projects, **all `public` format** (`/object/public/xray-images/...`)
- **Zero signed URLs** in any row
- Bucket `xray-images` is `public=true`
- `uploadToStorage` in `image-generator.ts` switched from `getPublicUrl` to `createSignedUrl(path, 3600)` in commit **f4efa76a (2026-04-05)** — "C3: getPublicUrl → createSignedUrl (18 files) … Prevents cross-user file access via URL guessing"

Combined with the race-condition bug fixed in commit 1c45905a: since Apr 5, *every* CAD-lab project has been losing its freshly-written signed URLs to the race. Storage objects accumulated, DB modules column stayed empty. The signed-URL intent never actually reached the database. That's a 12-day silent outage.

Now that the race is fixed, signed URLs WILL start reaching the DB — and they expire in 60 minutes. So Round 2 is non-optional: we must either (a) revert to `getPublicUrl`, or (b) flip the bucket to private + add read-side re-signing. The security justification for (b) — "prevents URL guessing" — assumes the attacker can enumerate UUIDs. UUIDv4 has 122 bits of entropy, so URL guessing is infeasible. (a) is the right call.

### Plan

**P1. Revert uploadToStorage to getPublicUrl** in `src/app/(platform)/the-forge/services/image-generator.ts` (line ~610). Document the reasoning in a `// SECURITY:` comment so a future red-team pass doesn't silently flip it back.

**P2. Red team ×3** — findings and fixes after the code change, three discrete passes.

**P3. Regenerate HAPS UAV hero.** Project `3dad9cd7` has `system_illustration_url = NULL`. Either server-side regenerate via Node script calling the same provider chain (Nano Banana → OpenAI), or direct Gemini REST call + storage upload + DB update. Target path: `xray-images/3dad9cd7-…/system-illustration.png` matching existing hero naming convention.

**P4. Agent-browser verification.** Without Tristan's session cookie, do what's possible:
  - Load `fractionalforge.app/login`, snapshot the accessibility tree
  - `curl` every recovered image URL to confirm 200 + content-length
  - `curl` the prod JS bundle for the CAD-lab chunk; grep for `getPublicUrl` to confirm the fix is live
  - Screenshot the login page

**P5. Post-deploy DB check.** No backfill needed (all existing rows already public). Post-deploy, query any projects created after the push to confirm the new URL format.

### Abort criteria for Round 2
- If bucket `public` flag changes between audit and deploy, STOP — the plan's security assumption flips.
- If any call site of `uploadToStorage` writes to a different (private) bucket, STOP — need per-call URL strategy, not a blanket change.
- If red-team pass 2 or 3 surfaces a real regression, STOP, re-plan before deploying.
