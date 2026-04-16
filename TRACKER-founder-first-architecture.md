# Tracker — Founder-First Architecture

**Created:** 2026-04-16
**Owner:** autonomous execution, one phase per commit
**Target:** every user lands on the founder side by default. Fractional-executive listing + supplier capabilities become opt-in flags layered on top. The existing `/supplier-portal` parallel app collapses into a "Supplier Portal" sidebar section inside the main platform, visible only when a user has opted in as a supplier.

**Source of truth:** Tristan's brief, verbatim — "everybody lands on the founder side and then they get their own unique location. Everybody also is given the question: do they want to become a fractional executive and have themselves listed, and we always recommend it. There is another option: are you a supplier? If you want to be a supplier, you can be a supplier as well. There can be another page on the main part of the app, which might be under me, so there's between me and my plan. That could be a supplier portal area."

**State before this work:**
- 9 suppliers flipped to founders manually (DB).
- `account_type='supplier'` still routes to `/supplier-portal` at every login entry point.
- `/join?role=supplier` + `/provider-signup` still create supplier accounts.
- No UI anywhere for a founder to opt in as a fractional executive.

---

## Phases (executed in this order, each one a single commit)

### Phase 1 — Strip the supplier routing divert

Every login / auth / workspace path lands everyone on `/today`. No more `account_type === 'supplier'` branch.

Files to edit:
- `src/app/login/actions.ts`
- `src/app/login/page.tsx`
- `src/app/auth/callback/route.ts`
- `src/app/workspace-picker/page.tsx`
- `src/app/join/success/success-content.tsx`
- `src/lib/auth/setup-new-user.ts`
- `src/app/(supplier-portal)/layout.tsx` — soft guard until Phase 3; redirect to `/today` instead of blocking

Outcomes:
- [ ] Fresh signup via any entry point → lands on `/today`
- [ ] Existing supplier accounts → land on `/today` (no more fenced portal)
- [ ] Direct URL visits to `/supplier-portal` still work but will be migrated in Phase 3

### Phase 2 — Schema + onboarding opt-in questions

Two new boolean columns on `profiles`:
- `is_fractional_executive` — "yes, list me on the marketplace as available to other companies". Default false. When flipped true, the existing `complete-profile-wizard` flow is triggered to create a `provider_profiles` + `marketplace_listings` row.
- `is_supplier` — "yes, I am also a supplier of goods or services". Default false. When true, the sidebar reveals the Supplier Portal section (Phase 3).

Backfill on migration:
- `is_fractional_executive = true` for any profile that has a matching `provider_profiles` row (preserves existing fractional-exec intent)
- `is_supplier = true` for any profile that had `account_type='supplier'` historically (none after the flip, but defensive)

Onboarding UI changes (`src/components/onboarding/unified-onboarding.tsx`):
- Add two new steps after the existing "Company Name" step:
  - "Would you like to be listed as a fractional executive?" — Yes (recommended) / Not now. Yes → flips `is_fractional_executive = true` and routes to the profile-completion wizard on first /today visit.
  - "Are you a supplier?" — Yes / Not now. Yes → flips `is_supplier = true` and reveals the Supplier Portal section in the sidebar.

Outcomes:
- [ ] `is_fractional_executive` + `is_supplier` exist in DB
- [ ] Onboarding modal presents both questions on first signup
- [ ] Existing users: backfill populates `is_fractional_executive` from provider_profiles where it already exists
- [ ] Generated types regenerated

### Phase 3 — Rehome the Supplier Portal under the main sidebar

Move the pages from `src/app/(supplier-portal)/supplier-portal/*` → `src/app/(platform)/supplier/*`. The pages inherit the main platform layout (sidebar, header, Forge branding).

New sidebar section between "Me" and "Plan":

```
— ME —
  Today
  My Profile
  Comms
  Time
  Google Apps
— SUPPLIER PORTAL —   (only shown if profile.is_supplier)
  Dashboard
  My Listing
  Orders
  RFQs
  Analytics
  Settings
— PLAN —
  …
```

Files:
- Move `src/app/(supplier-portal)/supplier-portal/page.tsx` → `src/app/(platform)/supplier/page.tsx`
- Move `.../listing/page.tsx` → `src/app/(platform)/supplier/listing/page.tsx`
- Move `.../orders/page.tsx` → `src/app/(platform)/supplier/orders/page.tsx`
- Move `.../orders/[id]/page.tsx` → `src/app/(platform)/supplier/orders/[id]/page.tsx`
- Move `.../rfqs/page.tsx` → `src/app/(platform)/supplier/rfqs/page.tsx`
- Move `.../analytics/page.tsx` → `src/app/(platform)/supplier/analytics/page.tsx`
- Move `.../settings/page.tsx` → `src/app/(platform)/supplier/settings/page.tsx`
- Delete `src/app/(supplier-portal)/layout.tsx`, `src/app/(supplier-portal)/supplier-portal/`, the whole `(supplier-portal)` route group
- Add redirects from `/supplier-portal/*` → `/supplier/*` in `src/middleware.ts` or via per-page `redirect()`
- Update the main sidebar (the Navigation component used in `src/app/(platform)/layout.tsx`) to include the "Supplier Portal" section, rendered conditionally on `profile.is_supplier`

Outcomes:
- [ ] `/supplier` sub-routes render inside main platform shell with the Forge sidebar
- [ ] Sidebar shows "Supplier Portal" only when `is_supplier=true`
- [ ] `/supplier-portal/*` URLs redirect to `/supplier/*` so no external link breaks
- [ ] Layout deletion removes the parallel app

### Phase 4 — Retire supplier entry points

- `/join?role=supplier` → stop using the supplier role. Update `src/app/join/page.tsx` so the "factory" / "supplier" landing copy folds into the normal /join flow. Users hit /join, become founders, then opt in as supplier during onboarding.
- `/provider-signup` → redirect to `/join` with a flag pre-selecting "Yes, list me as a fractional executive" on the opt-in step.
- Update `src/lib/auth/setup-new-user.ts` — drop the "supplier" branch. Every new user creates a real foundry by default.
- Update `src/app/api/dev-login/route.ts` — drop supplier role support (test-only route).

Outcomes:
- [ ] No code path creates `account_type='supplier'` anymore
- [ ] /provider-signup still works (now as a founder-side entry with fractional-exec pre-checked)
- [ ] Test accounts (demo.supplier@, test-supplier@) remain functional; they were already flipped

### Phase 5 — Onboarding flow for "yes, list me as a fractional executive"

When a user says yes during onboarding:
- Creates `provider_profiles` row linked to their `profiles.id`
- Creates `marketplace_listings` row with `category='People'`
- Routes them to the existing `profile-completion-wizard` (the 4-step wizard that was built in commit `9fe47063`) pre-populated with "I am a fractional executive" so they fill in headline, bio, skills, day rate, availability
- After wizard: the listing is live on the marketplace and they can continue using their founder workspace

Files:
- Hook up `is_fractional_executive=true` to trigger `profile-completion-wizard.tsx`
- Confirm the wizard already does the provider_profile + listing creation; if not, wire it

Outcomes:
- [ ] Toggling the opt-in from yes to no deactivates the listing
- [ ] The "My Profile" page shows whether the user is listed + a link to edit the listing

---

## Abort criteria

Stop and re-plan if:
- Any phase breaks the /today page for existing founders
- The supplier section shows up when `is_supplier=false`
- The migration blocks existing supplier data from reading

## Verification after each phase

- [ ] `tsc --noEmit` passes
- [ ] Lint clean
- [ ] Vercel deploy Ready
- [ ] For Phases 1 + 3: agent-browser check that a logged-in user lands on `/today` and the sidebar is correct

## Score card

- [ ] Phase 1 — routing divert removed (commit: TBD)
- [ ] Phase 2 — schema + opt-in questions (commit: TBD)
- [ ] Phase 3 — rehome supplier pages (commit: TBD)
- [ ] Phase 4 — retire supplier entry points (commit: TBD)
- [ ] Phase 5 — fractional-executive opt-in wiring (commit: TBD)
