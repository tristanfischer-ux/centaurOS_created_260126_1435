# Early-Access Implementation

Implementation date: 2026-04-25
Branch: feat/forge-v2-cutover

---

## Cohort definition

The first 100 users who create a ForgeOS account receive Starter-level limits for free for 30 days. This is the "early-access cohort."

- Cohort size: 100 profiles
- Duration: 30 days from sign-up (profiles.early_access_until)
- Sequential number: each cohort member gets a 1 to 100 position (profiles.early_access_user_number)
- Auto-grant: a Postgres trigger (trg_auto_grant_early_access) fires on every INSERT to profiles and sets the columns if the cohort is not yet full
- After 100 sign-ups: the trigger checks the count first and becomes a no-op; no manual intervention required

### Starter-level limits granted during early access

| Limit | Free tier | Early-access | Starter (paid) |
|---|---|---|---|
| Investor leads per month | 0 | 100 | 100 |
| Brainstorm sessions per month | 1 | 10 | 10 |
| Saved searches (lifetime) | 5 | no cap | no cap |
| AI tasks per month | 50 | 200 | 200 |
| Verified investor emails | no | yes | yes |
| Investor intelligence | no | yes | yes |

### Effective tier resolution

Application code should call `getEffectiveTier(userId)` from `src/lib/billing/subscriptions.ts` rather than reading `user_subscriptions.tier` directly. This function returns `'early_access'` for cohort users within their window, and falls back to the DB tier for everyone else.

Limit objects are resolved via `resolveEffectiveLimits(effectiveTier)` from the same module.

---

## Referral mechanic delta (free-signup credits during early access)

### Steady-state rule (non-early-access)
The existing `grant_referral_credits_on_paid_conversion` function fires when an invitee upgrades to a paid tier:
- Inviter: +100 investor searches
- Invitee: +50 investor searches

### Early-access relaxation
A new trigger (`trg_early_access_referral_signup`) fires on every INSERT to `referral_signups`. If the inviter is currently in their early-access window, it immediately grants:
- Inviter: +50 investor searches (cap: 500 per month, same as paid-conversion cap)
- Invitee: +25 investor searches as a welcome bonus

Credits are tagged with `granted_during_early_access: true` in `bonus_feature_credits.metadata` (JSONB) so post-cohort accounting can distinguish them from paid-conversion credits.

After early access expires (inviter's early_access_until has passed), the trigger fires but the function returns `inviter_not_in_early_access` and no credits are granted. The existing paid-conversion path resumes.

### Idempotency
`referral_signups.early_access_signup_credited` (boolean, default false) prevents double-grants on trigger replays.

---

## Marketing copy delta (at-limit upsell)

### For early-access users (isEarlyAccess = true)
The `LimitReachedUpsell` component renders the early-access variant:

Primary CTA: "Copy invite link" (full-width, default button style)
Secondary CTA: "Read about Starter, £20 per month" (secondary button style)

Copy pattern:
- Headline: "Free for your first month"
- Body: "Invite a friend to extend your free time and get them a free month too. Both of you get +50 searches for each friend who joins."
- Primary option label: "Invite a friend"
- Primary option body: "They get a free month. You both get +50 investor searches the moment they sign up."
- Secondary option label: "After your free month"
- Secondary option body: "Starter gives you 100 investor leads per month with full why-fit and a drafted email."
- Secondary CTA: "Read about Starter, £20 per month" (positioned as next step, not immediate pressure)
- No "Cancel anytime" on the primary CTA — that line is reserved for the paid option

### For non-early-access users (isEarlyAccess = false, the default)
No change. The existing "Two ways to keep going" framing with "Upgrade to Starter" as the primary CTA is preserved exactly.

### Approaching-limit banner
`ApproachingLimitBanner` gains an `isEarlyAccess` prop. When true:
- Copy changes to "Invite a friend to get both of you +50 more searches"
- Inline "Copy invite link" button replaces the "See Starter" link

---

## Pricing-page implication

For early-access users, the at-limit upsell positions Starter as "after your free month" rather than as an immediate upgrade. The £20 price is still visible but in the secondary CTA, not the primary.

The public pricing page (`/pricing`) is not modified. Early-access users who visit the pricing page see the same four-tier catalogue as everyone else; the difference is only in the in-product upsell surfaces where the context (they are in a free month) is known.

---

## Database objects created

| Object | Type | Purpose |
|---|---|---|
| profiles.early_access_until | column (timestamptz) | Expiry timestamp for early-access window |
| profiles.early_access_user_number | column (integer) | Sequential 1-100 cohort position |
| idx_profiles_early_access_until | partial index | Fast is-in-early-access lookups |
| auto_grant_early_access() | trigger function | Assigns cohort membership on profile insert |
| trg_auto_grant_early_access | trigger (AFTER INSERT profiles) | Fires the grant function |
| get_early_access_cohort_count() | function | Returns how many cohort spots are taken |
| is_early_access_active(uuid) | function | Boolean fast path for limit checks |
| get_early_access_profile(uuid) | function | Returns both early-access columns |
| referral_signups.early_access_signup_credited | column (boolean) | Idempotency flag for free-signup grants |
| bonus_feature_credits.metadata | column (jsonb) | Tagging for post-cohort accounting |
| grant_referral_credits_on_signup_if_inviter_early_access(uuid, uuid) | function | Issues immediate free-signup credits |
| trg_fn_early_access_referral_signup() | trigger function | Calls the grant function on signup |
| trg_early_access_referral_signup | trigger (AFTER INSERT referral_signups) | Fires immediately on new referral signup |

---

## TypeScript surface added

### src/lib/billing/plans.ts
- `EffectiveTier` type (union of SubscriptionTier | 'early_access')
- `EARLY_ACCESS_LIMITS` constant (Starter-level overrides)

### src/lib/billing/subscriptions.ts
- `getEffectiveTier(userId)` — resolves effective tier including early-access check
- `resolveEffectiveLimits(effectiveTier)` — returns the limits object for any effective tier

### src/actions/referrals.ts
- `ForgeAmbassadorStatus.freeSignupsThisMonth` — new field on existing interface
- `getForgeAmbassadorStatus()` — now also returns freeSignupsThisMonth
- `EarlyAccessProfile` interface — earlyAccessUntil, earlyAccessUserNumber, cohortCount, isEarlyAccess
- `getEarlyAccessProfile()` — server action returning EarlyAccessProfile

### src/components/referrals/ForgeAmbassadorBadge.tsx
- `ForgeAmbassadorProgressChip` — in-progress chip (1-9 paid referrals) with thin progress bar
- `ForgeAmbassadorChips` — top-level resolver component that picks badge vs chip vs nothing
- `freeSignupsThisMonth` chip — shown alongside badge or progress chip when > 0

### src/app/(platform)/investors/components/LimitReachedUpsell.tsx
- `LimitReachedUpsellProps.isEarlyAccess` — new optional prop
- Early-access variant rendering when isEarlyAccess is true
- `ApproachingLimitBannerProps.isEarlyAccess` — new optional prop
- `ApproachingLimitBannerProps.referralUrl` — new optional prop
- Early-access banner variant
