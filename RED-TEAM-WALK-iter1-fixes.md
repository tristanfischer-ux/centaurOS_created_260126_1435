# Red-Team Walk — Iteration 1 — Fixes Applied

Branch: `feat/forge-v2-cutover`
Date: 2026-04-25

## Fixes (commit hash → finding)

| # | Commit | Finding | Severity |
|---|--------|---------|----------|
| 1 | `fc381a3a` | Hydration mismatch on `/agents` (logged in). `usePageBriefing` read localStorage during `useState` init so server rendered the fallback while client immediately swapped to the cached briefing. Moved cache read into `useEffect`. | bug |
| 2 | `fc381a3a` | `/agents` page heading rendered "AI Team". Project CLAUDE.md "No AI Emphasis" rule explicitly forbids "AI" labels in product copy when the description makes sense without them. Renamed to "Your Specialists" to match the anonymous landing and the briefing context label. | bug (voice) |
| 3 | `fc381a3a` | `/investors` Investors-by-Type chart leaked raw firm_type slugs (`GOVT_GRANT`, `CVC`, `VC`, `PE`) straight into the legend AND double-counted `GOVT_GRANT` vs `Government Grant` as separate buckets. New shared normaliser `src/lib/investors/firm-type-labels.ts` collapses every observed variant to a fully spelled-out human label. Server aggregation and per-card type badge both use it. | bug (voice) |
| 4 | `3ad1b502` | `/the-forge-v2/projects/<id>/suppliers` threw a Build Error every load (`Only async functions are allowed to be exported in a "use server" file`) because `src/actions/project-supplier-shortlists.ts` re-exported the synchronous `computeLeadTimeBuffer` helper. Removed the dead re-exports — the only consumer already imports from the lib directly. | bug (P0 — page broken) |
| 5 | `3ad1b502` | Council brainstorm collapsed-row preview rendered the Voice Sandwich opener as literal markdown (`**Quick take —**` with the asterisks visible). `getPreview()` was passing source markdown straight through. It now strips bold / italic / code emphasis markers before truncating. The expanded row continues to use the Markdown component, so the bold opener still styles correctly when open. | bug |
| 6 | `befaf51b` | Eight occurrences of "smart assists" / "Smart Assists" across `/settings/billing` and `/settings/help`. Project CLAUDE.md "No AI Emphasis" rule explicitly forbids "Smart" / "Intelligent" labels. Renamed to "specialist tasks" / "Specialist Tasks". | bug (voice) |
| 7 | `a3bb9eea` | New signup was 100% broken. Two compounding bugs: (a) the `select_foundries` RLS policy still referenced `centaur-guild` / `centaur-suppliers` from before the rebrand — newly-signed-up users could not SELECT the renamed `forge-guild` / `forge-suppliers` rows; (b) `setupNewUser` inserts foundries with `owner_id = NULL` to break the circular FK, but neither INSERT RLS policy allows that. Migration `20260425230000_fix_select_foundries_policy_rebrand.sql` fixes (a); the helper now uses a service-role admin client for bootstrap-only foundry writes (insert / cleanup / set-owner) to fix (b). Verified: a fresh signup now lands at `/welcome` with the new user inside their own auto-named sandbox foundry. | bug (P0 — signup broken) |

## Open findings — needs design (will not fix in this loop)

| # | Finding | Why deferred |
|---|---------|--------------|
| A | Three Supabase RPCs (`ensure_foundry_exists`, `update_foundry_purpose`, `update_company_profile`) have `search_path=""` AND reference unqualified `profiles` / `foundries` in their bodies. Logs `[Plan] Failed to fetch foundry: ... err=relation "profiles" does not exist`. Page still renders without the RPC return value. | Schema-level fix — three RPC bodies need `public.` prefixed. Brief says "Do NOT modify production Supabase schema" so deferring (the equivalent migrations exist in the repo but the deployed bodies have drifted; needs Tristan's call on whether to re-apply). |
| B | All 13 specialist titles use acronyms in the council picker dialog (`CTO`, `VP Engineering`, `VP Manufacturing`, `VP Supply Chain`, `HR`). CLAUDE.md "no acronyms ever" rule explicitly mentions "Chief Technology Officer in copy (the slug `cto` stays in code)". | Specialist personality config is off-limits per "Specialist Configuration Protocol — never modify blind without the benchmark suite". |
| C | Mobile-nav and other pages occasionally surface a benign hydration warning from the vaul Drawer primitive. Page works correctly. | Third-party library quirk — Radix-based primitive uses `useId` and ARIA states that intermittently mismatch under turbopack HMR. Not user-affecting in practice. |
| D | "AI Tasks" still used as the in-product label for the usage budget (sidebar `AI Tasks` chip, billing card, upgrade prompt). The "no AI emphasis" rule may apply to this too. | Sweeping rename touching 15+ files; needs Tristan's call on whether to standardise on "Specialist tasks" or keep "AI tasks" as the meter unit. |
| E | Forge Ambassador surface is invisible until the user has 10+ paying referrals (the badge gates on `since !== null`). The "Refer a friend, +100 searches" surface from Tier 5 step 22 is not yet wired. | Per audit doc — referral credits engine is separately tracked work. |
| F | Sidebar lists "Outputs" but the page heading is "Deliverables". | Friction-level inconsistency, not a bug. |
| G | Cookie banner overlays bottom of viewport on `/` and `/investors` and partially obscures the hero paragraph. | Per audit doc Tier 3 step 19 — known gap, separately tracked. |

## Persona verdicts after iteration 1

| Persona | Verdict before | Verdict after | Why |
|---------|---------------|---------------|-----|
| Ready Buyer | Bounce (signup broken) | On the fence | Signup works, /investors loads, Council brainstorm runs and produces real specialist replies. /the-forge-v2/projects/<id>/suppliers no longer crashes. Still no V1 Forge running-state UX detail per audit. |
| Skeptic | Bounce (signup broken + acronym leaks + literal `**bold**` in Council preview made it look like a bug) | On the fence | Acronyms cleaned up on /investors and billing. Council preview reads cleanly. Signup actually works. The remaining trust gap is the hand-crafted seed data on the /agents teaser brainstorm — labelled "EXAMPLE" but the Skeptic still wants to see their own data. |
| Confused Visitor | Bounce (heading said "AI Team", page said "13 specialists ready to help — strategy, engineering, finance, legal" without explaining what they actually do) | On the fence | Heading and copy are now coherent. Still no clear "start here" path on first login — the welcome page lists four doors without naming the first one to open. Per audit Tier 2 step 17 the post-signup landing should be /investors. |
