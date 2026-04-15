# Viral Freemium Conversion — Implementation Tracker

## Status: IN PROGRESS

## Phase 1: New Seed Tier + Database Foundation
- [ ] Migration: seed tier + bonus_feature_credits + referral_rewards_pending
- [ ] plans.ts: Add seed tier config + SEED_TIER_SPECIALISTS
- [ ] limit-check.ts: Seed daily caps + investor_detail_view feature + weekly free cap
- [ ] subscriptions.ts: Seed checkout + VALID_TIERS
- [ ] Stripe: Create Seed monthly + annual prices
- [ ] Vercel: Set STRIPE_PRICE_SEED_MONTHLY + ANNUAL env vars
- [ ] Type check + push migration

## Phase 2: Investor View Gating
- [ ] investors.ts: Daily/weekly cap checks + view recording + deduplication
- [ ] Investor detail page: Cap-hit overlay + Seed as first upgrade option
- [ ] Investor directory: Remaining views counter + soft warning banner
- [ ] Free tier: 1 view/week with teaser

## Phase 3: Referral Enhancement
- [ ] process-upgrade.ts: Paid-upgrade reward granting with vesting
- [ ] subscriptions.ts: Wire into Stripe webhook
- [ ] vest-referral-rewards cron: Daily vesting processor
- [ ] Referral fraud prevention: rate limits + vesting

## Phase 4: Upgrade Prompts + Share Triggers
- [ ] upgrade-prompt.tsx: Shared dual-path component
- [ ] Update 5 touchpoints with new prompts
- [ ] share-result.tsx: Post-assessment share component
- [ ] Pricing page: Add Seed tier card

## Phase 5: Verification
- [ ] Type check passes
- [ ] Migration applied
- [ ] Stripe prices created
- [ ] Deploy succeeds
- [ ] Agent-browser: test free→seed upgrade flow
- [ ] Agent-browser: test investor view gating
