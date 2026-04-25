# Billing Data Model Reconciliation — Implementation Notes

**Branch:** `feat/forge-v2-cutover`
**Date:** 2026-04-25

This document captures the residual wire-up needed after the
`feat(billing): widen plans for starter_v2 + investor-search add-on; wire UI`
commit. The code in this commit is fully self-contained and ships green;
the items below are external-system actions Tristan needs to take before
the new tier can charge real money.

---

## Stripe Product IDs — TODO

The following price IDs are referenced from `process.env` in
`src/lib/billing/plans.ts` but the Stripe products do not yet exist in
the dashboard. **Configure these in the Stripe dashboard before
publishing the £20 Starter publicly.**

### `starter_v2` Stripe product ID — TODO

- **Name:** Starter
- **Price:** £20.00 / month (recurring)
- **Annual price:** £192.00 / year (recurring, save 20%)
- **Env vars to populate after creation:**
  - `STRIPE_PRICE_STARTER_V2_MONTHLY` — Stripe price ID for the monthly recurring £20 plan
  - `STRIPE_PRICE_STARTER_V2_ANNUAL` — Stripe price ID for the annual recurring £192 plan
- **Apply to:** Production AND Preview Vercel environments
- **Tier internal id:** `starter_v2` (used in `SubscriptionTier` union and as the
  reverse lookup key in `PRICE_ID_TO_TIER` inside `subscriptions.ts`)

### `INVESTOR_SEARCH_ADDON` Stripe product ID — TODO

- **Name:** Investor Search Add-On
- **Price:** £10.00 per 100 extra investor searches (one-shot purchase)
- **Recommended path:** ship as a one-shot Checkout Session for £10 first
  (see plans.ts `INVESTOR_SEARCH_ADDON` JSDoc), then migrate to metered
  billing once usage justifies the meter.
- **Env var to populate after creation:**
  - `STRIPE_PRICE_INVESTOR_SEARCH_ADDON` — Stripe price ID for the £10
    one-shot purchase
- **Apply to:** Production AND Preview Vercel environments

---

## What this commit changed

- `src/lib/billing/plans.ts`
  - Widened `SubscriptionTier` to include `'starter_v2'` (kept legacy
    values for rollback). Existing subscribers on `'seed'` / `'starter'`
    keep resolving against their original limits — no auto-migration.
  - Added `SUBSCRIPTION_PLANS.starter_v2` (£20, 100 leads, 10 brainstorms,
    full why-fit + drafted-email bundle).
  - Added `legacy?: boolean` and `featured?: boolean` flags on
    `SubscriptionPlan`. Marked `seed` and `starter` as `legacy: true`,
    `starter_v2` as `featured: true`.
  - Added new optional `limits` fields used by the public catalogue:
    `investorLeadsPerMonth`, `brainstormSessionsPerMonth`,
    `savedSearchesLifetime` (all `null` = unlimited / not capped).
  - Added `INVESTOR_SEARCH_ADDON` exported constant (£10, 100 leads,
    one-shot purchase).
  - Added `getPublicPlans()` helper returning the public-tier list in
    display order with legacy tiers filtered out.
- `src/lib/billing/subscriptions.ts`
  - Added `'starter_v2'` to `VALID_TIERS` so webhook tier resolution
    accepts the new tier value.
- `src/components/marketing/pricing-comparison-table.tsx`
  - Now reads from `getPublicPlans()` and `INVESTOR_SEARCH_ADDON` instead
    of hard-coding the four columns. Each row's value lookup uses the
    plan's `limits` field. Adding a public tier to `plans.ts` flows
    automatically into the homepage and `/pricing` table without
    touching the table component.
- `src/app/(platform)/settings/billing/billing-content.tsx`
  - In-app billing-settings upgrade catalogue now hides legacy tiers in
    addition to enterprise. Existing subscribers continue to resolve
    against legacy entries elsewhere.

## What this commit deliberately did NOT touch

- Stripe SDK calls or webhook handlers — no code path attempts to charge
  the new prices yet. Adding the Stripe product IDs (above) is sufficient
  to enable the new tier; no further code changes are required to take
  payment, beyond the env vars.
- `MONTHLY_INVESTOR_VIEW_CAPS` and other in-app gating — the new
  `investorLeadsPerMonth` / `brainstormSessionsPerMonth` /
  `savedSearchesLifetime` fields are display-only on the pricing page
  for now. Enforcement of the tighter freemium gate (1 brainstorm a
  month, 5 saved searches lifetime) is a separate follow-up commit.
- `/investors` empty-state copy and the in-product upsell card — those
  pieces are owned by the parallel "in-app upsells when free user hits
  limit" sub-agent. They will import `INVESTOR_SEARCH_ADDON` from this
  commit's `plans.ts`.
- Existing-subscriber migration — `legacy: true` is informational; no
  automatic migration is triggered. Tristan can run a separate
  communicate-and-migrate flow at his pace.
