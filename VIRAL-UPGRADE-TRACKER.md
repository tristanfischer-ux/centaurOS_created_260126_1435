# Viral Freemium Conversion — Implementation Tracker

## Status: COMPLETE — Awaiting Tristan's Review

## Phase 1: New Seed Tier + Database Foundation ✅
- [x] Migration: seed tier + bonus_feature_credits + referral_rewards_pending
- [x] plans.ts: Seed tier config (£19.99, 75 tasks, $18 compute, 10 specialists)
- [x] limit-check.ts: Seed daily caps + investor_detail_view + weekly free cap + SEED_TIER_SPECIALISTS
- [x] subscriptions.ts: VALID_TIERS updated, Seed checkout
- [x] fees.ts: Seed marketplace fee (10%)
- [x] Stripe: Seed monthly (price_1TMMhF4EElGVK5OMMcun4b6t) + annual (price_1TMMhF4EElGVK5OMbYU7FCCL)
- [x] Vercel: STRIPE_PRICE_SEED_MONTHLY + ANNUAL set
- [x] Type check clean, migration pushed

## Phase 2: Investor View Gating ✅
- [x] investors.ts: checkInvestorViewCap() + recordInvestorDetailView() + deduplication
- [x] Investor detail page: ViewCapOverlay with tier-specific upgrade CTAs
- [x] Investor directory: remaining views counter + soft warning banner
- [x] Free tier: 1 view/week, Seed: 3/day, Starter: 10/day, Pro+: unlimited
- [x] Bonus feature credits checked before denying

## Phase 3: Referral Enhancement ✅
- [x] process-upgrade.ts: grantReferralUpgradeReward() with tier-based rewards
- [x] subscriptions.ts: Wired into Stripe webhook (subscription.created)
- [x] vest-referral-rewards cron: Daily at 03:00 UTC, checks active subscription
- [x] Rate limiting: max 5 signup rewards per referrer per 30 days
- [x] 30-day vesting prevents upgrade-and-cancel gaming

## Phase 4: Upgrade Prompts + Share Triggers ✅
- [x] upgrade-prompt.tsx: Shared dual-path component (upgrade primary, invite secondary)
- [x] limit-check.ts: Seed in upgrade hint chain for all deny messages
- [x] Pricing page: 4-tier grid with Seed card + updated comparison table
- [x] share-result-banner.tsx: Post-assessment share component (ready for integration)

## Commits
1. `4863bc25` — Phase 1: Seed tier + DB foundation
2. `6d54dc3a` — Phase 2: Investor view gating
3. `6e742c4c` — Phase 3: Referral upgrade rewards with vesting
4. `52b33b62` — Phase 4: Upgrade prompts + pricing page

## For Tristan to Review
- Pricing page now shows 4 tiers — check the layout and copy
- Seed at £19.99 with 10/13 specialists — is the value prop right?
- Investor view caps: free 1/week, seed 3/day — too generous or too restrictive?
- Referral rewards: are the amounts right? (Seed referral: +15 tasks + 3 views)
- Share triggers component created but not yet wired into CAD lab/specialist chat (future pass)
