# Anonymous Browsing — Implementation Notes

> **Reference:** RED-TEAM-PIVOT-PLAN Tier 2 steps 13–17
> **Branch:** `feat/forge-v2-cutover`
> **Status:** Phase 1 shipped (anonymous `/investors`). Phase 2 deferred.

## Phase 1 — `/investors` (shipped)

A founder who clicks "See investors who would back you" on the homepage now lands directly on `/investors` without a signup interruption. They see one fully-rendered teaser match (Planet A by default, real firm row + curated why-fit / how-to-pitch / drafted email), four blurred locked cards for the rest, and a strong "Save my work" CTA. Any meaningful interaction (search submit, locked card click, save click, draft email click) opens a signup wall modal framed as "Save this to your private sandbox", with a "skip and keep browsing" close.

### Code surface

| File | Change |
|---|---|
| `src/app/(public-investors)/investors/page.tsx` (moved) | The `/investors` page now lives in its own `(public-investors)` route group with a layout that does not enforce auth. The deep-dive `/investors/[id]/page.tsx` stays under `(platform)` so it remains auth-gated. The page detects `auth.getUser()` returning no user and branches to `<AnonymousInvestorsView />`, otherwise falls through to the full directory render. |
| `src/app/(public-investors)/investors/loading.tsx` (moved) | Same skeleton. |
| `src/app/(public-investors)/layout.tsx` (new) | Route-group layout that allows anonymous visitors. When `!user`, renders a stripped-down shell (no sidebar, no foundry-dependent providers, marketing-style top bar). When `user` is present, mirrors the (platform) layout chrome (sidebar + nav + command palette) so an authenticated founder sees the same affordances they would on `/today` or `/agents`. |
| `src/app/(platform)/investors/[id]/page.tsx` (unchanged) | Deep dive stays under (platform) — auth-required. |
| `src/app/(platform)/investors/components/*` (unchanged) | Components live here. The new `(public-investors)` page imports across the route-group boundary via a relative path. Next.js route groups affect URL composition and layout chaining, not module resolution. |
| `src/lib/supabase/middleware.ts` | Defence-in-depth: explicit allow list for exact-match `/investors` so a future refactor that moves the page back into `(platform)` doesn't accidentally re-enable the login redirect. The middleware also doesn't run in the current Next.js 16 dev mode (the file convention is deprecated, replaced by `proxy.ts`), so the route-group split is the primary mechanism. |
| `src/actions/investors.ts` | New `getAnonymousInvestorsTeaser()` server action returning the curated teaser firm + four blurred firms + sentinel context. The match output text is hand-curated for a sample "UK pre-seed climate-hardware founder, first commercial pilot signed" so no LLM call fires on the anonymous path. |
| `src/app/(platform)/investors/components/AnonymousInvestorsView.tsx` | New server component. Top banner ("save my work"), example-profile context line, search box + signup wall (client child), teaser card, blurred cards, bottom CTA. |
| `src/app/(platform)/investors/components/AnonymousInvestorsClient.tsx` | New client component. Owns the search input (typing allowed, submit triggers wall), the four trigger flavours (search / locked-card / draft-email / save) and the signup wall modal. Carries the typed query through to `/signup?from=investors-anonymous&q=...`. |

### Homepage CTA changes

Every "Start Free / Get Started Free / See Your Matches / See investors who would back you" CTA on the homepage was switched from `/signup` to `/investors`:

- Hero "Start Free" → "See investors who would back you" → `/investors`
- Top-nav Start Free → `/investors` (label kept short)
- Mobile menu Start Free → `/investors`
- Floating mobile CTA → `/investors`
- Pricing-section "Get Started Free" → "See investors who would back you" → `/investors`
- `ExampleInvestorMatch` "Start Free, See Your Matches" → "See Your Matches" → `/investors`
- `InvestorPreview` "Get Started Free — See All Investors" → "See investors who would back you" → `/investors`

Marketing-nav, marketing-footer, AudienceSection partner links, CloudFactorySection "Join the Forge" intentionally retained their `/signup` targets — these are not "Start Free" energy and are about manufacturer / partner onboarding, not the killer-feature anonymous flow.

### Post-signup landing

Default post-signup / post-login destination is now `/investors`:

- `src/lib/auth/setup-new-user.ts` — both fallback returns updated.
- `src/app/auth/callback/route.ts` — `sanitizeRedirectPath` default + new-user `next` honor + existing-user `redirectPath` all flipped.
- `src/app/(platform)/welcome/welcome-view.tsx` — secondary "skip the new-project tour" CTA routes to `/investors` and the label was updated to "See investors who would back you instead".
- `src/actions/signup.ts` — visitors arriving from the anonymous landing (i.e. `from=investors-anonymous`) skip `/welcome` entirely and continue directly inside `/investors`.
- `src/app/signup/page.tsx` — both forms forward the `from` query param to the action via a hidden input.

### Sentinel teaser data

The teaser firm is **Planet A**, the same investor used on the marketing example match (`src/components/marketing/example-investor-match.tsx`) so the homepage promise equals what the visitor sees inside `/investors`.

Sentinel foundry context:

```
sector: 'climate hardware'
stage:  'pre-seed'
traction: 'first commercial pilot signed'
```

The match output is hand-curated and lives in `ANONYMOUS_TEASER_MATCH_OUTPUT` inside `src/actions/investors.ts`. **No LLM call fires on the anonymous path** — the cached cost is zero per visit. If the founder wants the live "rebuilt against your actual profile" version, they have to sign up.

The `investor_match_cache` table was intentionally NOT used:

- `investor_match_cache.foundry_id` has a foreign-key constraint to `foundries.id`. A sentinel UUID like `'00000000-0000-0000-0000-000000000000'` would fail the FK without first inserting a sentinel foundry row.
- The hand-curated output is stable and doesn't drift, so caching adds operational risk (stale rows, RLS policies on cache reads from public path) without saving money.
- If we later want to A/B test multiple teaser angles, a small `anonymous_teasers` table is the cleaner shape, not the per-foundry cache.

## Phase 2 — `/agents` and `/the-forge-v2` (deferred)

Per RED-TEAM-PIVOT-PLAN Tier 2 step 16:

> Anonymous browsing extends to `/agents` and `/the-forge-v2` for users who explore the sidebar — but `/investors` is the first room they enter. Each surface follows the same pattern: see one teaser result, sign up to see more.

These are intentionally out of scope for the Phase 1 commit. Reasoning:

- `/investors` is the highest-conversion surface (matched leads + why-fit + how-to-pitch + drafted email = the 15-hours-saved-per-fundraise demo). Get the pattern right there first, then port.
- An anonymous visitor on `/investors` has no sidebar (the platform layout renders a stripped shell), so "explore the sidebar" doesn't apply yet. Phase 2 will need to either (a) add a marketing-style sidebar to the anonymous shell, or (b) deep-link into `/agents` and `/the-forge-v2` from the existing anonymous CTAs.
- Each surface has its own teaser shape:
  - `/agents` (Brainstorming Council): one specialist-only response visible (Sage), the other 12 specialists shown as blurred cards. Signup wall on "ask a follow-up", "see the other specialists", or "save this conversation".
  - `/the-forge-v2`: the project-creation form is visible with one example brief pre-filled ("vertical farm hardware, BRC certification, signed pilot"), the resulting first module result is unblurred, the other modules + cost + suppliers + risks are blurred. Signup wall on "open the next module" or "save this brief".

### What needs to change in Phase 2

- `ANONYMOUS_PATHS` in `src/app/(platform)/layout.tsx` — extend with `/agents`, `/the-forge-v2`, and any deep paths needed.
- `src/lib/supabase/middleware.ts` — extend the exact-match anonymous list. Watch out for `/the-forge-v2/[id]/*` deep links: they should stay gated like `/investors/[id]/*`.
- New `AnonymousAgentsView` and `AnonymousForgeV2View` components mirroring the same teaser + blurred-rest + signup wall pattern as `AnonymousInvestorsView`.
- A small marketing sidebar (or a top-nav row of links) inside the anonymous shell so the "explore the sidebar" path step 16 mentions actually works for unauthenticated visitors.
- Carry-through query params on the signup wall: `?from=agents-anonymous` / `?from=forge-v2-anonymous`. The `signup.ts` action already special-cases `investors-anonymous`; extend the allowlist there in lockstep.

### Estimated effort

- `/agents` anonymous: ~1 day. The Brainstorming Council UI already has tier-aware rendering for specialists and the matching specialist cards are easy to reuse.
- `/the-forge-v2` anonymous: ~2 days. The project-creation flow has more state and the "first module rendered, rest blurred" requires a teaser project shape that doesn't write to the database. Probably a small `getAnonymousForgeV2Teaser()` action mirroring the investor one.

## Verification

Verified locally against `localhost:3001` on `feat/forge-v2-cutover`:

- `tsc --noEmit` clean on all touched files (12 pre-existing errors elsewhere, none introduced).
- `/investors` returns HTTP 200 for an unauthenticated curl (previously 307 to `/login`).
- The page renders the curated Planet A teaser card with real DB-backed firm data (sectors: Agriculture, Forestry & Food / Construction & Real Estate / Energy & Heat / Manufacturing / Transport & Mobility / Water, Waste & Remediation; cheque range £422,650 to £4,226,500), the hand-curated why-fit + how-to-pitch + drafted email, and four blurred locked cards (Octopus Ventures, Highland Europe, ECI Partners, Atomico).
- Search submit opens the signup wall modal with the "Save this search to your private sandbox" framing and the typed query is preserved on close. Verified end-to-end with agent-browser fill + click + snapshot.
- Modal "Or skip and keep browsing" close returns to the page without losing typed search text.
- Locked card click triggers the same modal flow (same React state machine).
- Homepage hero CTA, top-nav CTA, mobile menu CTA, floating mobile CTA, pricing-section CTA all navigate to `/investors` (verified via grep of `src/app/page.tsx` showing five `href="/investors"` and zero `href="/signup"`).
- Authenticated users on `/investors` still see the full directory (tabs, browse, contacts, portfolio, grants) because the `(public-investors)` layout renders the platform chrome when a user is present.
- The `/investors/[id]` deep dive stays inside the `(platform)` group and remains auth-gated.
