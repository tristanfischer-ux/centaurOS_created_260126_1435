# ForgeOS Pricing Restructure — 2026-04-25

> Locked decisions from `RED-TEAM-PIVOT-PLAN.md` (Round 2 revision) and
> `FREEMIUM-PLAN.md`. This file is the migration record + Stripe-dashboard
> action list.

## Summary

| | |
|---|---|
| **Files changed** | 6 |
| **Lines added** | ~340 |
| **Lines removed** | ~80 |
| **New Stripe price IDs Tristan needs to create** | 3 (Starter monthly, Starter annual, Investor Search Add-On) |
| **Existing Stripe price IDs to deprecate** | 2 (Seed £19 monthly+annual, Startup Team £49 monthly+annual) — keep ACTIVE in Stripe so existing subscribers don't churn; just stop linking to them from the public catalogue |
| **Tests** | 73 suites, 847 passing, 8 skipped, 0 new failures |
| **Type-check** | Clean — zero new TS errors in any file touched |

### Files changed

| File | Change |
|---|---|
| `src/lib/billing/plans.ts` | Added `'starter_v2'` to `SubscriptionTier` union; widened `SubscriptionPlan` interface with `legacy?: boolean` + 3 new limit fields (`investorLeadsPerMonth`, `brainstormSessionsPerMonth`, `savedSearchesLifetime`); reframed `free` from "Explorer" to "Free" copy (limits left at legacy values to avoid price-shock); marked `seed` and old `starter` (Startup Team £49) as `legacy: true`; added new `starter_v2` tier (£20/mo, 100 leads, 10 brainstorms); relabelled Pro to "Pro" with "Deep Council" copy; relabelled Enterprise with "Strategy Council" copy; added new `INVESTOR_SEARCH_ADDON` constant for the £10/100-leads upsell |
| `src/lib/billing/fees.ts` | Added `starter_v2: 10` to `TIER_FEE_PERCENT`; refreshed `FEE_TIERS` labels (Free / Starter / Pro) and added legacy entries for Seed and old Startup Team; updated header comment |
| `src/app/pricing/pricing-content.tsx` | Replaced 4-column grid (Explorer/Seed/Startup Team/Pro) with 3-column grid (Free/Starter/Pro); added Investor Search Add-On upsell card; rewrote header copy, marketplace fee banner, FAQ items, and platform fee note; rebuilt comparison table around the new tier set with new feature rows (investor leads, brainstorms, Deep Council, Strategy Council); replaced "AI tasks"/"AI specialists" wording with "specialists"/"Council" per No-AI-Emphasis rule |
| `src/app/page.tsx` | Replaced landing-page `PRICING_TIERS` (Explorer/Seed/Startup Team/Pro) with new four-card layout (Free/Starter/Add-on/Pro); updated JSON-LD `@type: Offer` schema (Free £0, Starter £20, Pro £149); rewrote the "How much does it cost?" FAQ entry |
| `src/app/(platform)/settings/billing/billing-content.tsx` | Updated tier-filter to hide legacy plans from the upgrade catalogue (current legacy subscribers still see their own card); reordered `getPlanOrder` so new Starter sits below legacy Seed/Startup Team |
| `src/app/api/billing/test-activate/route.ts` | Added `'starter_v2'` to `VALID_TIERS` so the test-mode activation route can flip a test user to the new Starter tier |

---

## What changed in tier semantics

| Tier key | Status before | Status after | Visible on /pricing? | Notes |
|---|---|---|---|---|
| `free` | Free £0 / "Explorer" / 50 AI tasks | Free £0 / "Free" / new freemium copy | YES | Limits unchanged at runtime so existing free-tier users aren't downgraded. Marketing copy reframes the tier as 1 brainstorm/mo + 5 lifetime saved searches. Tighter freemium-gate enforcement is a follow-up commit — search for `FREEMIUM_GATING_TODO` in `plans.ts`. |
| `seed` | £19/mo / 250 tasks / 50 leads | £19/mo / **legacy** | NO | Existing £19 subscribers continue resolving against this entry untouched. Hidden from public catalogue and from the in-app upgrade UI. |
| `starter` | £49/mo / "Startup Team" / 750 tasks | £49/mo / **legacy** | NO | Existing £49 subscribers continue resolving against this entry untouched. Hidden from public catalogue and from the in-app upgrade UI. **Distinct from the new £20 Starter** — different tier key. |
| `starter_v2` | (did not exist) | **NEW** £20/mo / 100 leads / 10 brainstorms | YES, highlighted "Most Popular" | The new entry tier. Replaces the killed Explorer £2 / 50 brainstorms idea (loss-making at full use). |
| `professional` | £149/mo / "Professional" | £149/mo / "Pro" / "Deep Council" copy | YES | Pricing PENDING AUDIT (likely £100/mo per the pivot plan) — not changed yet. Limits unchanged. Council relabelled to "Deep Council" (depth-of-reasoning, extended thinking). |
| `enterprise` | £499/mo | £499/mo / "Strategy Council" copy | Contact-sales row only | Pricing PENDING AUDIT (likely £400/mo per the pivot plan) — not changed yet. Limits unchanged. Council relabelled to "Strategy Council" (depth-of-context: custom specialists + RAG over foundry data + audit/SSO/SLA). |

**No Anonymous / browse-only tier** in this commit — that's a future-state phase per the pivot plan and isn't gated by anything that lives in `plans.ts` today.

---

## Existing Explorer / Seed / Startup Team subscriber handling

**Hard rule: nobody gets price-shocked.**

1. **Explorer (free) users.** The `free` tier's runtime limits are unchanged — `maxAiTasksPerMonth: 50`, `maxComputeBudgetUsd: 9`, etc. The marketing copy on `/pricing` and the landing page reframes the tier as the new freemium "Free" (1 brainstorm/month + 5 lifetime saved searches), but the enforcement code still gives existing accounts the legacy 50-tasks behaviour.
2. **The actual freemium gate** (1 brainstorm/mo + 5 lifetime saved searches) is wired in a follow-up commit. Search the codebase for `FREEMIUM_GATING_TODO` — there's one comment in `plans.ts` flagging the spot. When that gate ships, it should:
   - Apply to accounts created **after** the cutover date (so existing free users stay on the legacy 50-tasks behaviour for goodwill, OR get a 30-day transition email).
   - OR apply to all `free` accounts uniformly with an in-app upgrade nudge before the limit bites.
   - That call is for Tristan to make.
3. **Seed (£19) subscribers.** Continue to be billed £19/month against the existing `STRIPE_PRICE_SEED_MONTHLY` / `STRIPE_PRICE_SEED_ANNUAL` price IDs. Their limits resolve via `SUBSCRIPTION_PLANS.seed` which is unchanged. The Stripe products stay ACTIVE; we just stop linking new signups to them.
4. **Startup Team (£49) subscribers.** Same pattern — continue to be billed £49/month against the existing `STRIPE_PRICE_STARTER_MONTHLY` / `STRIPE_PRICE_STARTER_ANNUAL` price IDs against the legacy `starter` tier. Stripe products stay ACTIVE.
5. **In-app billing-settings page** (`/settings/billing`): legacy subscribers still see their CURRENT plan's card via the `isCurrent` branch. The upgrade options shown to them are filtered to non-legacy tiers only — so a Seed user sees Starter and Pro as upgrades, never the old Startup Team. A Startup Team user sees Pro as the upgrade target.

---

## Stripe dashboard action items for Tristan

Run these in the Stripe **Live** dashboard (test mode first if you want to dry-run). Tristan owns these — the agent doesn't touch the Stripe dashboard directly because Stripe is a third-party UI without an MCP tool wired up in this project.

### 1. Create the new Starter (£20) product

1. Stripe Dashboard → Products → **+ Add product**
2. Name: **`ForgeOS — Starter`**
3. Description: `100 investor leads/month with full why-fit + how-to-pitch + drafted email, plus 10 brainstorming sessions per month.`
4. Pricing model: **Standard pricing**, **Recurring**
5. Add **two prices**:
   - **Monthly** — £20.00 GBP, billing period Monthly. Lookup key: `forgeos_starter_v2_monthly`. Copy the price ID (starts `price_...`) — this is `STRIPE_PRICE_STARTER_V2_MONTHLY`.
   - **Annual** — £192.00 GBP, billing period Yearly (20% saving vs monthly). Lookup key: `forgeos_starter_v2_annual`. Copy the price ID — this is `STRIPE_PRICE_STARTER_V2_ANNUAL`.

### 2. Create the Investor Search Add-On (£10 per 100 extra leads)

Two paths — **path B is the recommended first cut**, path A is the upgrade.

**Path B (recommended): one-shot Checkout Session for £10**

1. Stripe Dashboard → Products → **+ Add product**
2. Name: **`ForgeOS — Investor Search Add-On`**
3. Description: `Adds 100 extra investor leads to your monthly cap. One-time charge.`
4. Pricing model: **Standard pricing**, **One-time**
5. Price: **£10.00 GBP**. Lookup key: `forgeos_investor_search_addon`. Copy the price ID — this is `STRIPE_PRICE_INVESTOR_SEARCH_ADDON`.

**Path A (when usage justifies it): metered billing**

Only do this once Tristan has telemetry showing >50 add-on purchases/month. Gives smoother UX (single subscription with metered overage line item) but is heavier to wire.

1. Stripe Dashboard → Billing → **Meters** → **+ Create meter**
2. Event name: `investor_search_addon` (matches `INVESTOR_SEARCH_ADDON.stripeMeterEventName` in `plans.ts`)
3. Aggregation: **Sum** of `value` field per customer per period
4. Then create a metered Price under the Starter product at £10.00 per `value=1` event.
5. Wire `stripe.billing.meterEvents.create({ event_name: 'investor_search_addon', payload: { stripe_customer_id: ..., value: 1 } })` from a server action triggered by the in-app one-click upsell.

### 3. Add the new env vars

You have full Vercel access — these go in Vercel via `vercel env add` (or directly through the Vercel project settings UI you already use):

```bash
# In the repo directory, for each of Production / Preview / Development:
vercel env add STRIPE_PRICE_STARTER_V2_MONTHLY production
# paste price_ID when prompted

vercel env add STRIPE_PRICE_STARTER_V2_ANNUAL production
# paste price_ID when prompted

vercel env add STRIPE_PRICE_INVESTOR_SEARCH_ADDON production
# paste price_ID when prompted

# repeat with `preview` and `development` so all environments line up.
```

Also pull them locally so dev mode picks them up:

```bash
vercel env pull .env.local
```

### 4. Existing Stripe products — DO NOT delete

- **`ForgeOS — Seed`** (£19/mo + £182.40/yr) → leave ACTIVE in Stripe. Existing subscribers stay on it. Just don't link to it from the public catalogue (already done in code).
- **`ForgeOS — Startup Team`** (£49/mo + £470/yr) → leave ACTIVE in Stripe. Same reasoning.
- **`ForgeOS — Pro`** (£149/mo + £1,428/yr) → unchanged. Pricing audit is a SEPARATE follow-up commit (likely drop to £100/mo).
- **`ForgeOS — Enterprise`** (£499/mo + £4,788/yr) → unchanged. Pricing audit is a SEPARATE follow-up commit (likely drop to £400/mo).

Once the audit lands and you decide on the new Pro/Enterprise prices, create new price IDs (don't edit the old ones — Stripe makes prices immutable for compliance), add new env vars (e.g. `STRIPE_PRICE_PROFESSIONAL_V2_MONTHLY`), and migrate existing subscribers via Stripe's **Update subscription** API. Out of scope here.

---

## Code-side TODOs left for follow-up

These are intentionally out of scope of this commit. Each is grep-able by the marker shown.

1. **`FREEMIUM_GATING_TODO`** in `src/lib/billing/plans.ts` — the `free` tier's `maxAiTasksPerMonth` is still 50 (legacy Explorer behaviour) so existing free-tier users don't get downgraded. When you're ready to enforce the new 1-brainstorm/mo + 5-lifetime-saved-searches gate, drop that to a small value (e.g. `maxAiTasksPerMonth: 5`) AND wire enforcement of `brainstormSessionsPerMonth` and `savedSearchesLifetime` in `src/lib/ai/limit-check.ts` (currently only `MONTHLY_INVESTOR_VIEW_CAPS` is consumed there).
2. **Investor Search Add-On enforcement** — the data structure is in place but no code reads `INVESTOR_SEARCH_ADDON.stripePriceId` yet. When path B is wired, you'll need:
   - A server action that creates a Stripe Checkout Session with that price ID and a `success_url` that POSTs back to a route handler crediting +100 to the user's monthly cap.
   - A `users.investor_lead_addon_credits` (or similar) column to hold the bonus credits per period.
   - The `/investors` page renders the upsell card when monthly cap is exhausted (Mockup-faithful build with the existing Card component is fine — copy the card from `pricing-content.tsx`).
3. **Pro / Enterprise pricing audit** — the current numbers (£149 / £499) are placeholders pending audit. The pivot plan suggests £100 / £400. Once the audit decision is locked, create new Stripe price IDs and update `priceMonthlyGBP` / `priceAnnualGBP` for those tiers.
4. **`src/app/(platform)/settings/billing/page.tsx:48`** — the test-mode detection currently checks `!process.env.STRIPE_PRICE_STARTER_MONTHLY` (the legacy Startup Team price ID). That env var still exists for legacy subscribers, so the check is fine for now, but you may want to switch it to checking `STRIPE_PRICE_STARTER_V2_MONTHLY` once the legacy Startup Team product is ever fully retired. Out of scope today.
5. **Anonymous (no-signup) browse-only tier** — the pivot plan flags this as a later-phase product. Not in `plans.ts` because it doesn't need a tier entry; it's an unauthed-route gating decision. When you get there, the change is in middleware + the public-route allowlist, not here.

---

## Verification that this commit didn't break anything

- ✅ TypeScript: `npx tsc --noEmit` shows zero new errors in any file changed (pre-existing errors in `.next/types/validator.ts`, `tasks.test.ts`, `BatchApprovalSheet.tsx`, `forge-project-list.test.tsx` are unaffected).
- ✅ Jest: `npx jest` — 73 suites, 847 passing, 8 skipped, 0 failures, 4.3s. Same totals as the baseline.
- ✅ Subscription enforcement logic untouched per the brief — `src/lib/ai/guard.ts`, `src/lib/ai/limit-check.ts`, `src/lib/billing/subscriptions.ts`, `src/actions/orders.ts` all still resolve limits via `SUBSCRIPTION_PLANS[tier].limits.*` exactly as before. Existing subscribers keep their existing limits.
- ✅ Stripe webhook handlers untouched per the brief.
- ✅ All four `Record<SubscriptionTier, ...>` exhaustive consumers updated for the new `starter_v2` key (`SUBSCRIPTION_PLANS`, `TIER_FEE_PERCENT`, `getPlanOrder`, `VALID_TIERS`).

---

## Cherry-pick reference

Once you're ready to land this:

1. Review the 6 file diffs.
2. Run `npx jest 2>&1 | tail -5` once more to be sure.
3. Commit with: `feat(pricing): kill Explorer £2, ship Starter £20 + £10/100-leads add-on, mark Seed and Startup Team legacy`.
4. Push to `main` — Vercel auto-deploys.
5. THEN do the Stripe dashboard work in section 3 of this doc.
6. THEN add the env vars via `vercel env add ...`.
7. THEN trigger a redeploy so the env vars are picked up: `vercel --prod` or push an empty commit.
