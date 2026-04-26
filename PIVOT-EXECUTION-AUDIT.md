# Pivot Execution Audit — what's actually shipped vs what was planned

Date: 2026-04-25
Scope: every Tier 0-6 item in `RED-TEAM-PIVOT-PLAN.md`, plus the cross-cutting items (Council UI, intelligence-embedded thesis spread, Forge running-state UX). Branch under audit: `feat/forge-v2-cutover` at HEAD `8ecea913` (or later).

**TL;DR**: roughly **15 of ~50 spec items shipped**. The killer-feature pipeline (Investors why-fit + how-to-pitch + drafted email) and the cross-surface brainstorming handoffs are real. The 20-minute Forge running-state UX, the supplier why+how, the anonymous-browsing flow, the admin cost dashboard, the Council asymmetric-arrival pattern, and the post-signup default rerouting are all NOT done. Several items are "shipped on main, not on cutover" because of the parallel-agent branch flips earlier in the session.

---

## ✅ Shipped on `feat/forge-v2-cutover`

| Item | Source | Commit |
|------|--------|--------|
| Product-ideation huddle in `/agents` | RED-TEAM-PIVOT-PLAN.md, Tristan's directive | `dfebff1f` |
| Brainstorming → Forge handoff CTA + Forge receiver wiring | spec 6g | `dfebff1f` |
| Brainstorming → Investors handoff CTA + investors receiver wiring | spec 6h | `dfebff1f`, `0f3e04d1` |
| Council copy ladder ("Quick take" / "On reflection" / "Thinking about this further" / "Council split") | Council pattern (copy only — NOT the staircase) | `49bc2f19` |
| `/plan` compressed page port (Strategy + Objectives + Tasks → one page) | Phase D mockup | `331de4e4` |
| Cost-logging hook in `callClaudeCentral` + `embedQuery` | Tier −1 step 1 (instrumentation only — no dashboard) | `1c42b041` |
| Phase G — investor why-fit + how-to-pitch + drafted email + cache table | spec 6c (the killer feature) | `6eba1377` |
| Homepage 7 buy-or-bounce fixes (example card, comparison table, hero rewrite, smart-product list cleanup, dropped 13-AI-agents inflation, founder letter compressed, /story split out) | spec Tier 3 | `9f730673`, `d552a0f9`, `90188710` |
| `/about`, `/case-study`, `/sample-package`, `/preview-landing`, `/pricing`, marketing-footer, `/join` aligned with new thesis | Tier 3 acquisition polish | `1133f6ad`, `ec86bd42`, `f1636a4d`, `04b0f924`, `770cb302`, `8ecea913`, `ec937c50` |

**Plus, on `main` only** (not on cutover — branch divergence from earlier in the session):
- AdvisorPanel removal (`5d3c1875` on main; cutover's `specialists-landing.tsx` and `brief-specialist-dialog.tsx` still import `useAdvisorPanel` from `@/contexts/advisor-panel-context`)
- Pricing tier restructure (`7282645b` on main; cutover's `src/lib/billing/plans.ts` still defines legacy Explorer/Seed/Startup Team tiers)
- Welcome page rebuild (`7ddaaf0b` on main, status on cutover unverified)
- Specialist model swap sweep (`0e90147a` on main)
- Tier 2 cost-logging into 22 direct-fetch sites (`eab6caa1` on main)

**These need to be reconciled before cutover can deploy.** Either cherry-pick onto cutover or merge main → cutover.

---

## ❌ NOT shipped — and could ship without your input

These are the gaps. Listed roughly in priority order (highest commercial-impact first).

### Forge surface

1. **Forge running-state UX flesh-out**. Spec 6d. The 11-stage progress checklist exists (`running-state.tsx`) but each stage is just a label and one-line hint. The spec calls for: per-stage explanatory paragraph ("what's happening behind the scenes"), what input it's working from, what output comes next, live counter where appropriate ("Evaluated 247 of 14,000 parts"), cumulative counter at the top ("So far: 7 stages complete · 14,328 computations · 3 specialists involved"), milestone moments-of-celebration. The 20-minute wait IS the demo and right now it's a spinner with labels.
2. **Forge "Saved" folder UI + public-shareable demo URLs**. Spec 6e infrastructure. The 3 demo projects need you to generate, but the surface that hosts them (a "Saved" section on `/the-forge-v2` with "Examples to learn from" / "Your projects" split, plus the public route `/forge/demos/<slug>` that works without login) is not built.
3. **Forge intelligence-layer stage**. Spec under the intelligence-embedded thesis. The 11-stage pipeline doesn't currently include a "Considering intelligence layer — what makes this 10× better with cheap compute embedded?" stage. Bolt-on to running-state.tsx. Half-day at most.

### Suppliers surface

4. **Supplier result spec — every paid supplier match returns (a) why this supplier is relevant to YOU, (b) what to ask them when you reach out**. Spec 6f. Mirror of the Investor pattern that Phase G shipped. Same caching + sourcing discipline. Not started.
5. **"Show the work" pre-result framing on Suppliers**. Spec 6i. Investor has it (the Phase G banner). Suppliers does not.

### Council UI

6. **Asymmetric-arrival staircase**. Spec under "Brainstorming Council — speed-as-feature + asymmetric arrival". Currently every specialist replies sequentially through the same path. The spec calls for INTENTIONALLY mixing model latencies (Haiku ~2s, Sonnet ~8s, Opus / V4-Pro ~18-30s) so the user reads top-down as new voices stream in. Only the COPY phrases are in place via `49bc2f19`; the actual orchestration that picks 2/4/5 specialists with staggered latencies is not.
7. **Tier-named Council UI** (Quick / Full / Deep / Strategy). Spec under same section. The brainstorming dialog still talks about specialist count, not Council tiers. No tier-named entry points.
8. **Council tier-test 3-question replication + non-Anthropic judge cross-check**. Task #20. Single-question Anthropic-judging-Anthropic test from `BRAINSTORM-TIER-DEBATE-TEST.md` is NOT a hard pricing rule until replicated. Pre-condition for repositioning Strategy Council ("RAG over foundry data + custom personas") with confidence.

### Onboarding (Tier −2 — was supposed to be P0 above cost)

9. **Cookie banner non-blocking**. Spec Tier 3 step 19 + Tier −2 0e. Currently overlays the homepage and `/join`, intercepting clicks. Real users may rage-click and bounce.
10. **Drop Confirm Password, soften password complexity to "8+ chars", make Full Name optional**. Spec Tier −2 0b + Tier 3 step 20.
11. **Canonicalise signup URL** — pick `/signup` or `/join`, redirect the other. Spec Tier −2 0c. Three URLs for one flow today.
12. **Signup-flow regression matrix**. Spec Tier −2 0a. Email+password new account, Google OAuth new account, signup-then-OAuth-link, signup-on-mobile, signup-with-existing-email, signup-with-weak-password, signup-with-card-banner-blocking, signup-on-Safari iOS — none of these have been agent-browser-verified end-to-end.
13. **Post-signup landing diagnostic**. Spec Tier −2 0d + Round 4 step 17. `setupNewUser` has 3 fallback redirect branches — none surface a meaningful error to the user if anything fails.

### Cost discipline (Tier −1)

14. **Admin cost dashboard at `/admin/cost`**. Spec Tier −1 step 2. Logging instrumentation exists but nothing visualises it. Tristan can't see real per-feature costs without it.
15. **5-7 days of cost data → pricing audit**. Spec Tier −1 step 3 + Tier 1 step 9-11. Gated on the dashboard.
16. **Tier-aware model selector** (trial/free = Haiku/Gemma; paid = current premium mappings). Spec Tier −1 step 4 + 5b.

### Anonymous browsing (Tier 2)

17. **Homepage CTA → `/investors` directly for anonymous users**. Spec Tier 2 step 13. Currently still routes to `/join`. Loses the "see one example match in 60 seconds" demo before signup.
18. **Anonymous `/investors` browsing with one teaser result + rest blurred**. Spec Tier 2 step 14. Phase G's blur overlay exists for unauthenticated users but the homepage doesn't direct them there, and the search-box-triggers-signup wall isn't wired.
19. **Anonymous browsing extends to `/agents` and `/the-forge-v2`**. Spec Tier 2 step 16.
20. **Post-signup default landing → `/investors`** (currently `/agents`). Spec Tier 2 step 17. Tristan's specific revision because Investors is the new key draw.
21. **In-app upsells when free user runs out**. Spec Tier 2 step 20. The "Upgrade to Starter £20" + "Or invite a friend, +100 searches" prompts are not wired.

### Stickiness (Tier 4 — gated on Tier 0-3 but worth flagging)

22. **Plan stickiness levers** (history feed, streak counter, weekly digest, decision log, "what changed" banner). Spec Tier 4 step 18. The Plan port has the surface (`331de4e4`) but none of the retention mechanics.
23. **Suppliers stickiness** (shortlists per project, quote-tracking ledger, lead-time alerts, comparison view, procurement diary). Spec Tier 4 step 19.
24. **Manufacturing Techniques stickiness** (saved-per-project, annotations, learning tracks, Q&A feed). Spec Tier 4 step 20.
25. **Brainstorming-as-Perplexity history** (persistent URLs, citations, follow-ups, searchable history, branching). Spec Tier 4 step 21.

### Viral mechanic (Tier 5)

26. **Referral credits engine** (+100 free searches per paid referral, +50 welcome bonus). Spec Tier 5 step 22. Not wired.
27. **Power-user "free for life" lane** (10+ paying referrals → unlimited searches + Forge Ambassador badge). Spec Tier 5 step 23.

### Cleanup + reconciliations

28. **AdvisorPanel removal on cutover**. The `5d3c1875` commit is only on main; cutover still imports `useAdvisorPanel`. Will fail to build on a clean checkout of cutover unless reconciled.
29. **`src/lib/billing/plans.ts` migration** for the new £20 Starter + £10 add-on. Currently still defines legacy tiers; the dangling commit `e4da952a` has a competing implementation that uses `SUBSCRIPTION_PLANS.starter_v2` + `INVESTOR_SEARCH_ADDON`. Two viable approaches to `/pricing` exist in the repo's history. Pick one before deploy.
30. **Platform-internal "20 minutes" copy hedge**. The marketing surfaces all use "Twenty-minute first pass, hours of detail after" now. The in-product surfaces (`the-forge-v2/page.tsx`, `autopilot-button.tsx`, `running-state.tsx`, `start-forge-box.tsx`) still say "about 20 minutes" without the hedge.
31. **AIUsageTracking fetch failure**. From the Vercel-log Round 4 finding (item 20): every investor page load logs `[AIUsageTracking] Failed to track usage: TypeError: fetch failed`. Either fix the existing tracker or remove the dead path.
32. **9th idea prompt for deep-tech founders**. Spec Tier 6 step 26.

### Verification ship-checks (NONE done)

33-37. Tier −2 / −1 / 0 / 1 / 2 ship-checks per the "Post-execution verification" section of the plan. None have been run end-to-end with screenshots and log entries. **This is the work Tristan is asking for as Stage 2.**

---

## What's properly deferred (gated on something else)

- Anonymous-mode unlock (gated on MRR threshold per Tier 5 step 24)
- Card-required Stripe trial (gated on cost-logging giving real numbers per Tier 1)
- Sponsorship / dual-side revenue on Suppliers (Tristan flagged for later)
- 3 Forge demo projects (need you to generate via the live pipeline)
- Strategy Council reposition (gated on Council tier-test 3-question replication landing first)
- Audit Pro/Starter break-even (gated on cost-logging dashboard)

---

## Recommended next moves (you pick the cut)

If we're going to do Stage 2 (the 3 red-team agent-browser walkthroughs across the whole site), we have a choice:

**Option A — Walk now, find more gaps in real surfaces.** Run the walkthroughs against what's actually on `feat/forge-v2-cutover` today. The walkthroughs will surface bugs and UX issues across the WHOLE journey (not just the homepage), which is what you asked for. They'll also expose where shipped surfaces (`/agents`, `/the-forge-v2`, `/plan`, `/investors`) drift from the new thesis. Each persona produces a case-study report.

**Option B — Close the highest-impact gaps first, then walk.** Items 1, 4, 5, 9, 17 (Forge running-state explanatory copy, Supplier why+how spec, Show-the-work on Suppliers, cookie banner non-blocking, anonymous /investors landing) are the highest-leverage items where shipping changes what the personas would experience. ~3-5 subagent rounds to land. Then walkthroughs hit a more complete site.

I'd default to **A**. The walkthroughs themselves will tell us which gaps actually matter when a real user flow hits them, vs the gaps that look big on a spec sheet but don't bite. After the walkthroughs we can prioritise the next round of fixes against the case-study findings rather than against the spec.

Tell me which.
