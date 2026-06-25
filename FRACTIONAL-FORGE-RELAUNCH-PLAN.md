# Fractional Forge — Fast Relaunch & Monetisation Plan
*Synthesised 2026-06-23 from a 5-agent deep dive of the code + 40+ strategy docs. Goal: start making money fast, with the supplier and fractional-executive sides working.*

## The core finding
**This is mostly switching-on and wiring, not building.** Already built and shipped in the repo:
- the dossier engine (now at production quality);
- a full **Stripe billing system** (live keys, subscriptions + webhooks + Stripe Connect escrow marketplace);
- a complete **fractional-executive marketplace** (opt-in → profile wizard → public directory → project matching → booking with escrow → Stripe Connect payout → retainers);
- a **supplier matcher** + paid per-supplier insight cards + a supplier-portal scaffold;
- **~29,000 enriched suppliers** (`~/.forge-truth/forge-truth.db` `companies`) — currently used only by the PDF engine, invisible to founders.

Revenue is blocked by: (a) Stripe config gaps, (b) a `PUBLIC_ROUTES` bug hiding marketing pages, (c) no funnel wired into checkout, (d) no supplier/expert front door, (e) one unresolved strategy split (curated vs marketplace). Fix those and the money paths light up.

---

## 0. Three decisions to lock first (everything sequences off these)
| # | Decision | Recommendation (from the docs) |
|---|---|---|
| **D1** | Money model order | **Services-led first** — £100 dossier + £1,500/day advisory + £3,000 Go/No-Go diagnostic (fastest £, zero build). SaaS £20 second. Marketplace take-rate last. *(matches FRACTIONAL-FORGE-PLAN v4 + MONETISATION-ROADMAP)* |
| **D2** | Expert side: Model A (built marketplace, 10%/5% take-rate) vs Model B (curated lead-gen, the written strategy) | **Use the built marketplace rails, but position curated** — turn the funnel on, gate listings to *vetted* experts, route the dossier's per-module advisor CTA to Tristan's Calendly + a vetted shortlist. Best of both: no rebuild, strategy-aligned. |
| **D3** | Dossier mask policy (contradiction in the two newest docs) | **Show commodity parts free; charge £1k to reveal the bespoke maker + named experts.** *(MONETISATION-ROADMAP — more coherent than mask-everything)* |

These are the only real judgement calls — confirm/adjust and the rest is execution.

---

## Phase 1 — First £ in days (zero / near-zero build)
1. **£100 Design Dossier Stripe Payment Link.** Live keys already configured; the homepage already advertises "first free, then £100" but collects nothing. Create a Payment Link, reply to each post-first brief with it. **Revenue today, no deploy.** *(later: one-shot Checkout in `submitBrief` for repeat briefers — ½ day, reuses existing Stripe client + webhook)*
2. **Productise the services already on the homepage:** keep £1,500/day Advisory (Calendly, live); add a **£3,000 "Go/No-Go feasibility diagnostic"** page (5-day delivery, no expert roster needed) — the documented best-margin first product.
3. **Fix the marketing-pages routing bug** — add to `PUBLIC_ROUTES` in `src/lib/supabase/middleware.ts`: `/about /contact /story /case-study /sample-package /investor-readiness /preview-landing`. These are SEO/lead-gen pages currently **bounced to /login** for anonymous visitors. ~5 min, highest top-of-funnel ROI, near-zero risk. *(Hold `/share /shared /pay /profile` until their token/RLS checks are confirmed.)*
4. **Run the one validation test that de-risks the whole company** (v4 §9): put the existing CO₂/SAF/RAS dossier in front of 5 hardtech investors — "would you fund a deal that arrived like this?" 1–2 weeks; resolves the downstream equity thesis before any platform build.

## Phase 2 — Switch the SaaS funnel on (week 2)
1. **Make the £20 Starter chargeable:** create the `starter_v2` product in Stripe, set `STRIPE_PRICE_STARTER_V2_MONTHLY/_ANNUAL` in Vercel; rename `STRIPE_PUBLISHABLE_KEY` → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; point `/pricing` + `/join` CTAs at `/api/billing/checkout`. (3 fixes — the subscription engine, webhook, tier-gating are all built.)
2. **Build the cost-logging/admin dashboard FIRST** (red-team hard rule, still unbuilt): £20 Starter, the £10/100-lead add-on and Pro are all priced on *unverified* LLM-cost guesses — the add-on may be loss-making. Don't turn on per-unit pricing blind.
3. **Ship the £1k un-mask toggle** on the dossier (near-pure margin; the free/paid flag already exists in the renderer — DEFAULT OFF). Apply D3.

## Phase 3 — Supplier side (your focus) — week 3
*The matcher, insight cards and portal scaffold are built; the front door, the data surfacing, and the nav are missing.*
1. **Surface the 29k suppliers (highest leverage, data not features):** one-way sync `companies` (forge-truth.db) → Supabase `suppliers` + `marketplace_listings` **with embeddings on insert** (the matcher needs `embedding`). Kills the cold-start (HVAC/horticulture/refrigeration return 0 today) for manufacturing/cleantech without building the unbuilt AI-discovery engine. New `scripts/push-companies-to-supabase.ts`; dedupe on `companies.supabase_listing_id`.
2. **Open a real supplier signup:** add a public `/become-a-supplier` route + link, and **fix `src/lib/auth/setup-new-user.ts`** so an `is_supplier` signup actually creates a `provider_profiles` + `marketplace_listings` row (today it creates neither → self-registered suppliers are invisible). Fix the dead `/become-provider` link.
3. **Un-retire supplier surfaces:** repopulate the emptied `src/components/sidebar/data/marketplace.ts` arrays; drop the `/marketplace` → `/the-forge-v2` redirect (disabled by nav-removal, not a flag).
4. **Add the missing `the-forge-v2/projects/[id]/suppliers/page.tsx`** — runs the built `matchCadLabModuleSuppliers` + renders the built paid insight cards (the breadcrumb is currently a dead link).
5. **Sign up named suppliers now:** wire `generateClaimToken` into an outreach surface and run the existing claim + `outreach-drip` cron against `SUPPLIER-CONTACTS.md` (Alfa Laval, Rittal, etc.). Defer the unbuilt `SUPPLIER-DISCOVERY-PLAN.md` AI engine.

## Phase 4 — Fractional-executive side (your focus) — week 4
*Model A (peer-to-peer marketplace) is essentially complete in code; Model B (curated) is the written strategy. Per D2, use A's rails, curated.*
1. **Turn on the existing funnel:** drive traffic to `/join/expert` (or `/join?role=executive`) → opt-in flag → profile wizard → `provider_profiles` → public `/experts` directory → CAD-Lab match → booking/escrow → Stripe Connect payout. Seed the first ~10 experts via the built `invite-expert-dialog` referral codes.
2. **Run ONE real paid engagement end-to-end** (booking → escrow → timesheet → payout) — a lot of this is coded but there's no evidence it's been run with real money. Verify before scaling.
3. **Wire the dossier "Take this to your advisors" CTA** (Model B): the per-module generator already produces grounded "who to ask + questions" (`out/*/advisor-engagement.json`); add the "Book a call with Tristan" + vetted-specialist routing (Phase 2 of `DOSSIER-ADVISOR-ENGAGEMENT-PLAN.md`).
4. *"La" is a confirmed typo/cut-off (zero hits repo-wide) — nothing to action.*

---

## What NOT to do (the traps the research surfaced)
- **Don't reactivate the dead businesses:** the CAD-API roadmap (Zoo.dev/Xometry), the standalone fractional-CFO marketplace, the old SaaS "13 specialists" vision — all superseded by v4, but their code/Stripe rails linger and will mislead.
- **Don't try to "switch on" `/products`, `/marketplace-orders`, `/apprenticeship`, `/browse`, `/fundraise`, `/guild`** — these are `<ComingSoon>` placeholders with nothing behind them (building, not flipping).
- **Don't price per-unit before the cost dashboard** (Phase 2.2).
- **Don't expose `/share /pay /profile /shared`** in PUBLIC_ROUTES until each page's own token/RLS check is verified.

## Verification gap to close before flipping anything live
The working copy is the `oxccu-efuel` branch, **119 commits ahead of `origin/main`** (recent commits are engine R&D). MEMORY says canonical production = `origin/main`. **Confirm which branch Vercel Prod deploys** and that `PUBLIC_ROUTES`/billing/middleware match before editing — so the switches land on the branch that actually ships.

## Fastest realistic sequence
- **This week:** Payment Link (£) + diagnostic page + PUBLIC_ROUTES fix + investor test → first revenue + open funnel.
- **Week 2:** SaaS £20 funnel + cost dashboard + £1k un-mask.
- **Week 3:** supplier sync + front door + nav + suppliers page.
- **Week 4:** expert funnel on + 1 paid engagement test + dossier advisor CTA.
</content>
