# FORGE-DATA-PRESERVATION.md

**Phase:** 1 — Forge redesign
**Branch:** `feat/forge-redesign`
**PR:** #1 (shared primitives, unflagged)
**Flag:** `new_forge_experience`

This doc answers the five data-preservation questions required by [PHASE-PLAN.md §8](./PHASE-PLAN.md) for every phase PR. Rule of thumb: **additive only — nothing existing is renamed, dropped, or rewired during PR #1.**

---

## 1 · What existing Forge data does this phase touch?

**PR #1 touches no existing Forge *data* — it touches Forge *chrome*.**

- No reads/writes against any existing Forge table (CAD lab modules, cad_lab_assemblies, xray_images, cad illustration tables, etc.).
- No changes to the `/the-forge` route, its pages, its components, or its `services/` directory.
- No changes to the `src/app/(platform)/the-forge/cad-lab/layout.tsx` or any CAD lab page.
- No changes to any existing server action, RLS policy, or Supabase storage bucket used by Forge today.

PR #1 adds new shared-schema foundations (`memberships`, `event_log`, `projects`, `project_transitions`, `profiles.feature_flags`, additive columns on `foundries` and `audit_log`), a new sidebar component, and a reskinned `/today` page. Forge surfaces themselves stay exactly as they are until PR #2+.

---

## 2 · How is existing data preserved?

1. **All migrations are additive.** New tables are empty on land. Existing columns are untouched. New columns on `foundries` (`tier`, `member_count_cached`, `updated_at`) and `audit_log` (`section`, `event`, `actor_user_id`, `actor_specialist`, `payload`) are nullable or have safe defaults.
2. **`profiles.foundry_id` remains the source of truth** for all existing RLS and `withAuth` resolution. `memberships` is created + backfilled + kept in sync via a profile trigger, but nothing reads from memberships in PR #1. Migrating RLS off `profiles.foundry_id` is an explicit later PR, not Phase 1 scope.
3. **`audit_log` dual-write helper** (`src/lib/audit/write.ts`) writes both old column names (`action`, `user_id`, `metadata`) AND new (`event`, `actor_user_id`, `payload`) with the same values. Existing readers of `action`/`user_id`/`metadata` keep working unchanged.
4. **CAD lab route is byte-for-byte untouched.** `/the-forge/cad-lab/*` pages, components, services, and migrations are not modified. The path survives through the Phase 1 cutover rename at PR #12.
5. **Today page is a reskin-plus-frame, not a reset.** All existing signals (`getMorningBriefing`, `getMyDailyPulse`, `getStrategyHealthSummary`, `getUnreadCount`, Cal briefing narrative, onboarding state) continue to flow into the new V3 layout's panel slots. Nothing that currently surfaces on Today disappears.
6. **Sidebar is a chrome swap, not a nav restructure.** PLAN section keeps its legacy 7 items (Strategy/Objectives/Tasks/Review/Reports/Red Team/Knowledge → existing routes). MONEY keeps its legacy 6-item Cash Burn group (no strikethrough pedagogy yet). WORKSHOP's Forge entry is the only flag-aware link.

---

## 3 · What does a user with existing data see when the flag flips on?

**Nothing changes for them.** The flag `new_forge_experience` gates access to the `/the-forge-v2/*` routes — and those routes don't exist in PR #1 (they come in PR #2+). In PR #1:

- Flag off (default for all users): sidebar Forge nav → `/the-forge` (unchanged). They see exactly today's CAD-lab-and-xray Forge experience.
- Flag on (post-flip for Tristan + test account): sidebar Forge nav → `/the-forge-v2`. In PR #1 that route doesn't exist yet (returns 404 if navigated to directly). Real experience behind the flag ships in PR #2.

In PR #2+ when the new Forge routes start landing, a flag-on user sees the new Workspace + 9 artefacts. Their existing CAD lab data is still accessible via the Geometry drill-in (CTA "Open in CAD lab" → `/the-forge/cad-lab`). Their CAD lab work is preserved byte-for-byte — same URL, same tables, same illustrations.

---

## 4 · What happens if the flag flips off?

**Nothing breaks. That's the safety net.**

- User returns to `/the-forge` (current experience). Works unchanged.
- New tables (`memberships`, `event_log`, `projects`, `project_transitions`) remain in the DB, empty or populated. No read path depends on them during flag-off. No RLS or server action assumes their presence.
- `profiles.feature_flags` column remains — flipping a flag key to `false` or removing it both evaluate as "off".
- Today V3 is **already unflagged** (ships for everyone at PR #1 merge). Its Forge panel remains an empty placeholder regardless of the flag — it only populates once Forge routes in PR #2+ start writing to `event_log`. No flag-off rollback needed for Today because there's nothing to roll back.
- `audit_log` dual-write keeps legacy readers working regardless of flag state.

Rollback instruction for incident response:
```sql
-- Flag off globally (emergency)
UPDATE profiles SET feature_flags = feature_flags - 'new_forge_experience';
```

---

## 5 · Which legacy routes stay accessible during PR #1?

**All of them.** Every legacy route documented below remains live, routable, and owned by its current implementation. None are redirected, 404'd, or hidden in PR #1.

| Legacy route | Status in PR #1 | Owned by |
|---|---|---|
| `/the-forge` | **Unchanged** — current CAD-lab-and-xray experience | Existing code |
| `/the-forge/cad-lab` (+ subpages) | **Unchanged** — byte-for-byte preserved | Existing code |
| `/strategy` | Unchanged — linked from Plan sidebar's legacy 7-item data | Existing code |
| `/new-objectives` | Unchanged | Existing code |
| `/new-tasks` | Unchanged | Existing code |
| `/review` | Unchanged | Existing code |
| `/reports` | Unchanged | Existing code |
| `/red-team` (if it exists) | Unchanged | Existing code |
| `/knowledge` | Unchanged | Existing code |
| `/cash-burn`, `/cash-burn/cash-out`, `/cash-burn/cash-in`, `/cash-burn/pnl` | Unchanged | Existing code |
| `/investors` | Unchanged | Existing code |
| `/fundraise` | Unchanged | Existing code |
| `/today` | **Re-skinned to V3** — same data sources, new visual frame. No route change, no data loss. | Phase 1 PR #1 |
| `/marketplace` + sub-routes | Unchanged | Existing code |
| `/me`, `/team`, `/agents`, all other non-Forge routes | Unchanged | Existing code |

`/the-forge-v2/*` is **added** in PR #2+, flag-gated. The rename from `/the-forge-v2` → `/the-forge` (cutover PR #12) only happens once Tristan has approved the full Forge experience on Vercel preview.

---

## Change log

| Date | Change | Author |
|---|---|---|
| 2026-04-19 | v1.0 initial — PR #1 shared-primitives scope | Forge+Products terminal (Phase 1) |
