# Red Team — Pivot Plan Stress Test (3 rounds)

**Date**: 2026-04-25
**Trigger**: Tristan added several major strategic constraints across one session (cost-from-revenue mandate, no subsidy from runway, killer-vs-sticky split, Brainstorming-as-Perplexity, Plan/Suppliers/Techniques as retention surfaces, viral credits gated on paid conversion). The "card-required trial replacing anonymous freemium" plan I produced needs adversarial stress-testing before any code lands.

**Method**: Three distinct red-team rounds. Each round writes findings + a concrete plan adjustment. The end of the document converges on the refined plan.

---

## Round 1 — Founder personas re-stress-test the card-required trial

The proposal: sign-up requires a payment card, 7-day trial £0, auto-converts to Explorer £2/month unless cancelled, hard caps during trial (5 brainstorms + 10 investor searches over 7 days). Does this filter the right people in/out, or does it kill the funnel?

### 1A — Maya (pre-seed bootstrapped, anonymous-curious)

**How she behaves**: lands on homepage cold, evaluates in 90 seconds, won't put a card down to "look around". Has £50K savings, used to free Notion / free GitHub / free ChatGPT.

**Objection**: *"You're charging me £2/month before I've seen anything work? Stripe means you have my card. I just want to see if this thing is real."*

**What she actually does**: bounces. Goes to ChatGPT for free, asks Perplexity her pricing question, manually emails 3 investors she found on LinkedIn. Doesn't come back. Lifetime value: zero.

**Counter-argument**: card-required IS the ceiling on bot abuse. £0 trial is industry-standard SaaS — Notion Plus, Linear, Figma all do it. Maya's actually fine with this if the LANDING PAGE shows enough proof that it works.

**Diagnosis**: the binding constraint isn't "card up front" — it's "I haven't seen anything work". She needs to be IN the app, looking around, before being asked for anything.

**Plan adjustment 1A (REVISED 2026-04-25 by Tristan)**: NOT a product video. Instead: anonymous app browsing. Maya lands directly inside the app — sees the Brainstorming idea grid, the Investors database, the Forge surface — without signing up. She can BROWSE freely. Interaction (clicking a prompt to start a brainstorm, running an investor search, opening a Forge project) triggers a signup wall, but the wall is framed as a benefit: *"Save this search to your private sandbox — takes 20 seconds."* Privacy + sandboxing of HER work is the value proposition, not a paywall. She signs up because she wants to KEEP what she just discovered, not because she has to in order to see anything.

This kills the chicken-and-egg problem (no PMF without users; no users without product proof) — Maya gets product proof from BROWSING the actual app, then converts to signup at the moment her interaction creates something worth saving.

### 1B — Priya (Series A, time-constrained)

**How she behaves**: doesn't care about £2/month. Cares about saving 4 hours of investor research. Card-required is fine. Will trial.

**Objection**: *"I trialled. Brainstorming errored on first click. Investor search returned nothing. I cancelled before day 7."*

**What she actually does**: Stripe trial cancellation rate ~70% if the product fails at first use. Even if she liked it, she'd downgrade to keeping it as "maybe later" and never renew.

**Diagnosis**: Priya's funnel survival depends on the killer features WORKING. The trial structure is fine; the killer-feature reliability is the gate. Tier 0 P0 (Investor search + Brainstorming reliability) is the actual lever.

**Plan adjustment 1B**: trial-with-card depends entirely on killer features working at first use. Reorder: **don't ship the trial flow until Investor search returns matches + Brainstorming completes a session without erroring**. The trial wrapper isn't the bottleneck.

### 1C — Jamal (deep-tech, regulated, uncommercial)

**How he behaves**: technical. Tolerates ugly UX if the output is good. Patient with bugs if the conversation is useful. Will trial £2/month for 7 days easily.

**Objection**: *"5 brainstorms in 7 days is too few. I have 10 different regulatory questions to work through. I'll burn the cap day 2 and have nothing to do days 3-7. Do I just stare at it?"*

**What he actually does**: hits the trial cap day 2, doesn't see "upgrade now" as the right answer (he's not validated yet), tries to use ChatGPT for the rest. By day 7 he's forgotten why ForgeOS was different.

**Diagnosis**: trial caps need to be calibrated to FOUNDER use patterns, not abuse-prevention patterns. A founder with a real problem will run 10-20 sessions in their first week — that's the use case we want.

**Plan adjustment 1C (REVISED 2026-04-25 by Tristan)**: viral mechanic for power users. Tesla / Claude Cowork model. The deal: power users get the platform FREE (or near-free) in exchange for recruiting paying customers. This is the inverted incentive — instead of charging power users for high usage, they earn their usage by bringing in revenue.

Specifically: each invited friend who SIGNS UP AND CONVERTS TO PAID gets the inviter +100 free investor searches that month. The invitee gets +50 free searches as a welcome bonus. Both meters are visible in the sidebar footer with a one-click "Copy invite link" CTA.

For Jamal specifically: he runs out of his 100 monthly leads in the first 3 days. The system shows him "10 more searches available" + "Invite a friend who pays for £20/month → +100 searches" + "Top up 100 more for £10 → continue now". Jamal picks based on his hour cost vs the recruiting effort. Either way, ForgeOS wins: more revenue OR more viral spread.

This MUST gate on PAID conversion, not signup, or the system gets gamed by free-tier signup farms. The 7-day quality guard from earlier (invitee must have run ≥1 brainstorm OR ≥1 search) becomes "invitee must have converted to a paid tier" — higher bar but ensures real revenue per credit grant.

### Round 1 plan adjustments

1. **Add a homepage live-demo** so Maya sees output before the card prompt. Use Tristan's own foundry as the demo data.
2. **Don't ship the trial flow until killer features work** — reliability first, trial wrapper second.
3. **Raise trial caps to 15 brainstorms + 30 searches over 7 days.** Card-required is the abuse filter, not the cap-tightness.

---

## Round 2 — Unit-economics adversarial debate (Bull / Bear / Realist / Disruptor)

Stress-testing whether the trial→Explorer math actually pays for itself.

### Numbers I'm working with (assumptions to be verified)

- Trial cap (post-1C): 15 brainstorms + 30 searches over 7 days
- Cheapest-tier model cost per brainstorm: assume 5p (multi-specialist, ~30K tokens at Haiku rates)
- Cheapest-tier cost per investor search: assume 0.5p (one embedding + pgvector query, mostly DB)
- Worst-case trial LLM cost per user: 15 × 5p + 30 × 0.5p = **£0.90**
- Explorer monthly: £2 (50 brainstorms + ? searches per memory)
- Explorer monthly LLM cost worst-case: 50 × 5p = **£2.50** ← above the price
- ⚠️ **Explorer at £2 is currently LOSS-MAKING at full use, even at cheapest models.**

### Bull case

*"Conversion of trial → paid SaaS averages 25-35% in the SMB segment. If 30% convert, every 10 trials = 3 Explorer subscribers = £6/month MRR. Trial cost was 10 × £0.90 = £9. You break even on month 2 of the cohort. After that it's pure margin minus retained-user LLM cost. Long-tail LTV (12-18 months for SaaS) makes this very fundable."*

### Bear case

*"Trial conversion in B2B SaaS is 15% on average, lower for tools where the outcome is hard to evaluate in 7 days. If 15% convert, every 10 trials = 1.5 Explorer subscribers = £3/month MRR. Trial cost was £9. You're losing £6 on every 10 trials forever, because Explorer is loss-making at usage. Worst case: your most engaged users generate the most cost AND pay the least. The price tier is broken."*

### Realist case

*"You don't know your actual cost-per-session because you have no logging. The numbers above are guesses. Step one: instrument logging, run a week, get real numbers. Step two: only THEN calculate trial cap + tier price. Don't ship anything that depends on £2 = breakeven without proving £2 = breakeven. Also: Explorer might be a strategic loss-leader to upsell to Starter/Pro — but only if Pro IS profitable. Audit Pro maths first. If Pro at £100 doesn't cover a Pro user's typical spend, the whole tier ladder is broken."*

### Disruptor case

*"Why are you charging £2 at all? Either it's free (loss-leader funded by Pro/Enterprise) or it's £29 minimum (the SaaS-floor price every B2B tool charges because below £29 customers don't take it seriously and you have admin cost per customer that £2 doesn't cover). The £2 tier is the worst of both worlds: it has all the support cost of a paying customer, none of the marketing benefit of free, and can't fund itself. Kill Explorer. Make Starter (£25) the entry point. Use the trial for evaluation only — no permanent free or near-free tier."*

### Where the four converge

All four agree: **the £2 Explorer tier is the unit-economics weak point**, and the unknown-cost-per-session is the binding-constraint risk before any pricing decision lands.

### Round 2 plan adjustments

4. **Build the cost-logging instrumentation FIRST. Nothing else lands until you have 5-7 days of real data.** This is non-negotiable. All four red-team voices agree.
5. **Audit Pro/Starter break-even, not just Explorer.** If Pro doesn't cover its typical user, the whole ladder is wrong. Calculate from logged data, not assumption.
6. **Seriously consider killing Explorer £2.** Disruptor's argument is strong: £2 has all the cost overhead of a paying customer (Stripe fees, churn admin, support) without funding itself. Either price the entry tier at the SaaS floor (£25-29) or make it free with hard caps. The middle ground is dangerous.
7. **Trial converts to STARTER £25, not Explorer £2.** If Explorer is killed, the trial-to-paid path runs straight from £0 trial → £25 Starter. Higher friction at conversion, but the conversions you DO get are net-positive from day one.

### Plan adjustment 7 has a knock-on

If Explorer dies and trial converts to Starter, the conversion rate will drop further (£25 hurts more than £2). The 15-25% conversion estimate becomes 5-10%. To compensate, the trial cap needs to be MORE generous so triallers see real value: 20-25 brainstorms + 50 searches over 14 days, not 7. Trial worst-case LLM cost: 25 × 5p + 50 × 0.5p = £1.50. Still well under Starter £25 month-1 revenue.

### Round 2 revision (Tristan, 2026-04-25 — actual model)

The card-required trial replaces with a free-after-signup tier + investor-search-as-cash-cow model. £25 was directionally right but Tristan locks it at £20 with a much clearer revenue engine.

**Pricing tiers (final — pending cost-logging audit confirmation):**

| Tier | Price | Investor leads / month | Why founders pick it |
|---|---|---|---|
| Anonymous (no signup) | £0 | Browse only — see results, can't open them | Discover the product without commitment |
| Free (post-signup) | £0 | Cap-limited (e.g. 5 saved searches lifetime, 1 brainstorm/month) | Save what you've discovered, keep it sandboxed |
| **Starter** | **£20/month** | **100 leads/month with full why+how output** | **The entry point for any real fundraise** |
| Add-on | **£10 per 100** | One-click upsell from inside the product | Run out mid-fundraise → click yes → keep going |
| Pro / Enterprise | (audit-pending) | More leads, integrations, team seats | Multi-fundraise teams, agencies |

**The cash cow is the £10/100 add-on.** Once a founder has used the system to find their first investor match worth pursuing, they will want to search for more — different sectors, different cheque sizes, different geographies. The add-on is the natural one-click upsell. Make it frictionless. The £20 entry is the door; the add-ons are the recurring revenue.

**Second upsell lever — drafted outreach emails (Tristan, 2026-04-25)**: for any matched investor result, generate a drafted email the founder copy-pastes into their own email client (Gmail / Superhuman / etc). Manual copy-paste at this stage — automated sending is poor today and we shouldn't promise quality we can't deliver. Frame it as *"We draft a starting point. Edit it, then send from your own inbox."* Sets the right expectation: useful save-an-hour-per-email tool, not a magic auto-pilot.

Pricing options for drafted emails:
- **Bundled in £20 Starter**: all 100 monthly leads come with a drafted email. Highest perceived value, most generous, simplest UX. Loses the upsell revenue.
- **Per-email pay-per-draft**: e.g. £0.50 per drafted email, one-click yes from inside the search result. Pure usage-based. Could feel nickel-and-diming.
- **Tier upgrade**: Starter £20 (matches + why-fit + how-to-pitch only) → "Outreach" tier £40 (everything + drafted emails for all 100 leads). Two-tier ladder.

Recommendation: **bundle in Starter £20** for the launch. Drafted emails are the time-saved demonstration that drives the £20-to-£10/100-to-Pro ladder. Hiding them behind a paywall reduces the felt value of Starter. Once you have data on per-email cost, revisit — if average user generates 30+ drafted emails/month and that costs more than the Starter margin allows, split it out into the Outreach tier.

**The £2 Explorer tier is dead.** All four red-team voices in Round 2 agreed. Disruptor was right.

**Free tier exists** because it (a) keeps the user sandboxed/private (their saved data lives in their account), (b) gives them a few searches to get hooked, (c) gives the viral mechanic something to seed (free users referring paying customers earn additional searches and may upgrade themselves).

**Referral mechanic locked**:
- Each invited friend who signs up and converts to **a paid tier** (Starter or above) → inviter gets **+100 searches free** that month
- Invitee gets **+50 searches free** as a welcome bonus on signup, redeemable once they pick a paid tier
- Inviter cap: +500 free searches/month (i.e. 5 paying referrals; beyond that they should arguably be on a partner programme not the referral system)
- Quality guard: counts only on PAID conversion, not signup. No free-tier-farming.

**Margin math at £20:**
- 100 leads/month × cost-per-search (assume 0.5p semantic + ~10p for the why+how generation per result) = **£10.50/user worst-case LLM cost**
- £20 - £10.50 = **£9.50 margin/user/month**
- Add-on £10 for 100 more leads = **£10 - £10.50 = -£0.50** ⚠️ *the add-on is loss-making at full use unless the why+how is cached or cheaper*
- **CRITICAL FIX FOR ADD-ON ECONOMICS**: the why+how generation per investor result is the cost driver. Either (a) cache aggressively (each investor's why+how only generated once per founder-context, reused across searches), (b) raise add-on to £15/100, or (c) downgrade add-on results to "match score only, no why+how" with a "Generate why+how for £0.20 per result" upsell.
- Pricing audit must validate cost-per-result FIRST. £20 entry with margin > 0 is non-negotiable; £10/100 add-on may need adjustment.

---

### Brainstorming → Forge handoff + Brainstorming → Investor-test (Tristan, 2026-04-25)

Two cross-surface flows that turn Brainstorming from a sticky retention tool into the funnel feeder for the killer features. Both build on the existing `/agents` Brainstorming page.

**Flow A — Brainstorm an idea, then build it in The Forge**

1. Founder uses Brainstorming for "What product should we build?" or "How do we evolve our existing product?" or types a free-form idea.
2. After the brainstorming session produces a description, surface a primary CTA: *"**Build this in The Forge** →"*
3. One click → the product description from the brainstorm transcript becomes the `/the-forge-v2/new` brief, pre-filled. Founder reviews/edits, hits Start.
4. Forge runs its 20-minute pipeline. The framing on Forge's running state explicitly references back: *"Building from your brainstorm with Sage and Max on [date]..."* — continuity matters.

This is the highest-leverage retention loop in the whole product. Brainstorming reveals what to build → Forge builds it → founder has a buildable spec to take to the BOM/manufacturer/investor flow. Each surface feeds the next.

**Flow B — Brainstorm an idea, then test it with investors**

1. Founder uses Brainstorming with an investor-fit prompt (existing prompt: *"Should we raise more money or get to profitability faster?"* or new one: *"Would investors back this idea?"*).
2. Sage + Fiona discuss the idea against current market conditions and investor appetite. Output includes the investor-thesis fit.
3. Surface CTA at end of session: *"**See which investors would back this** →"*
4. One click → carry the brainstorm's product framing into `/investors` as a search query. The matched results return the same why-fit + how-to-pitch + drafted-email output, but anchored on the brainstormed product specifically.
5. Founder gets to "test" their idea with real investor matches before committing to build. This is the dream: validate-investor-interest BEFORE you spend 20 minutes generating CAD.

**Build implications for both flows**:
- Add a structured "product description" extraction step at the end of every Brainstorming session that produces a clear product framing (hidden from user, used for handoff).
- Add CTAs to the team-meeting end-state: "Build this in The Forge" / "See which investors would back this".
- Add deep-link parameters: `/the-forge-v2/new?from-brainstorm=<session_id>` and `/investors?context-from-brainstorm=<session_id>` that prefill the relevant input.
- Track conversion: % of brainstorms that lead to a Forge build / investor search. This becomes the funnel-health metric for the cross-surface integration.

**Why these matter for the freemium funnel**:
- A free user who brainstorms an idea, sees "Build this in The Forge" as a CTA, clicks it, and is asked to upgrade — the upsell ask is contextual ("you've already done the thinking; now let's make it real for £20"). Higher conversion than a generic upgrade prompt.
- A founder evaluating ForgeOS as a tool sees the cross-surface integration as a product differentiator — Crunchbase doesn't talk to Onshape doesn't talk to ChatGPT. ForgeOS specialists carry context across surfaces. That's the moat.

---

### "Show the work" — copy principle across Investor + Forge + Suppliers (Tristan, 2026-04-25)

A founder will pay £20/month for an output that took 30 seconds to render only if they BELIEVE there is genuine work behind it. Free tools also return outputs in 30 seconds — what they don't return is depth, specificity, or the felt sense of "someone has done their homework". ForgeOS must visibly show the work behind every paid result.

**Applies to** all three surfaces with paid output: Investor results, Forge end-to-end pipeline, Supplier matches.

**Mechanics**:
- **Pre-result framing**: before showing matches, show what was computed. Examples:
  - Investor: *"Searched 8,264 UK investors against your profile across 12 dimensions: stage, sector, cheque size, geography, portfolio fit, partner thesis, recent decisions, hardware orientation, climate alignment, food-tech specialism, deal velocity, and exit pattern. Surfaced the 100 highest-fit matches with personalised pitch framing for each."*
  - Forge: *"Read your one-paragraph brief, generated 7 candidate system architectures, scored them against manufacturability, cost, regulatory fit, and supply chain risk, picked the optimal one, decomposed it into 6 functional modules, expanded each module's spec, ran 14,000 part candidates through your BOM constraints, ranked supplier shortlists per module."*
  - Supplier: *"Indexed 13,700+ UK manufacturers, scored them against your BOM specs (geometry, tolerance, material, volume, lead time), filtered for ones that have made similar parts in the last 24 months, ranked the top 20 with capability-fit reasoning and what to ask each one to qualify them."*
- **Post-result confidence anchors**: after each match/result, show ONE concrete data citation that backs the synthesis. Investor: *"Source: Tina Patel on Sifted Talks Mar 2026 + Conviction Q3 thesis update."* Forge: *"Spec basis: BOM line 14 + DFM rule 207 + supplier capability filter."* Supplier: *"Match basis: 4 prior similar-parts builds 2024-2025 + cert ISO 13485 + lead time 18d ± 3."*
- **Visual texture**: lists, counters, "we ran X computations" framing. Founders read effort cues. Generic copy ("here are your matches") feels cheap; itemised effort ("we ran 12 dimensions of analysis across 8,264 records") feels paid.

**Test**: a founder seeing the results page should say *"this would have taken me 6 hours to do manually"* — not *"this is the same list I'd get from Crunchbase"*. The framing IS the difference.

---

### Forge demo projects + LinkedIn shareability (Tristan, 2026-04-25)

Three high-quality demo projects always present in the Forge "Saved" folder for any user (anonymous or signed-in). Each demo has BOTH the HTML rendered output (in-app browsable) AND a PDF download. Three reasons:

1. **Anticipation**: a user about to type their own brief sees what the output will look like. Reduces "is this thing real?" hesitation.
2. **Quality calibration**: the demos are deliberately varied in brief depth — Demo 1 from a one-paragraph throwaway, Demo 2 from a 500-word detailed brief, Demo 3 from a fully-specified founder doc. Visible delta makes the case for putting effort into your brief.
3. **LinkedIn marketing engine**: each demo is a shareable artefact Tristan can post on LinkedIn with the framing *"Look what I got from just a simple prompt. The more I put in the brief, the higher the quality."* Drives signups.

**Demo project criteria**:
- Realistic hardware-startup product types covering the target persona spread (e.g. smart consumer device, B2B industrial sensor, low-cost emerging-markets device — covering Maya/Priya/Jamal personas)
- The output (architecture + BOM + manufacturer shortlist + cost model + risk register) is genuinely strong — these are the showcase. NOT scaffolds.
- Public-shareable URL: `fractionalforge.app/forge/demos/<slug>` works without login. Anonymous user can read the full output, can NOT edit or fork without signing up.
- HTML + PDF parity: same content, both formats available.

**Build implications**:
- Tristan generates the 3 demos using the live system (against his own foundry), once they're high-quality enough. No hard-coded mocks — these run through the same pipeline real users will hit.
- A "Saved" folder UI on /the-forge-v2 always lists the 3 demo projects + the user's own (separated by section: "Examples to learn from" / "Your projects").
- LinkedIn distribution: Tristan posts a screenshot of one demo + the input brief + a link to the live shareable URL. Each post is a signup funnel.

---

### Forge running-state UX (Tristan, 2026-04-25 — pivotal for excitement during 20-min churn)

The Forge end-to-end pipeline takes ~20 minutes to run (paragraph-in → architecture + BOM + supplier shortlist out). Twenty minutes of staring at a spinner kills excitement and erodes the "show the work" trust that the upfront framing built. The running state must turn the wait into anticipation.

**The current `feat/forge-v2-cutover` build (commit `f6c94c1b`) added an 11-stage progress checklist with 12-second auto-refresh — that's the foundation. This spec extends it.**

**Each stage shows**:
1. **Stage name** (e.g. "Generating system architecture")
2. **What's happening behind the scenes** — explanatory paragraph framed for excitement, not just "Loading..."
3. **What input it's working from** (your brief, prior stage's output)
4. **What output it will produce next** (so the user anticipates)
5. **Live counter where appropriate** ("Evaluated 247 of 14,000 parts...")
6. **Cumulative work counter at the top** ("So far: 7 stages complete · 14,328 computations · 3 specialists involved")

**Example stage card during Forge run** (mockup-style):
```
[●] Stage 4 of 11: Decomposing your product into functional modules
                   ─────────────────────────────────────
Max (CTO) is reading the system architecture from Stage 3 and
splitting it into 5–8 functional modules — each one a self-contained
piece with its own purpose, interface, and constraints. This is
the layer that determines what gets BUILT vs what gets BOUGHT, so
the cost ceiling and the manufacturing route both anchor here.

Working from: System architecture (Stage 3 output, 2,847 tokens)
Producing next: Module specs with interface contracts (Stage 5)

Live: 4 of 7 candidate decompositions evaluated...

──────────────────────────────────────────────────────────────────
Cumulative: 3 stages complete · 4,127 computations · Max + Sage
```

**Visual rhythm**:
- Soft pulsing accent on the active stage (orange dot)
- Completed stages collapse to one-line summary with green tick
- Upcoming stages visible but greyed, so user sees the road ahead
- "Cumulative work" header counter ticks up live so the magnitude grows visibly
- Periodic "moment of celebration" — at certain milestones (e.g. Stage 6 "BOM skeleton complete"), brief flash + a one-line specialist quote: *"Fang: 'This is where the cost picture becomes real. Hold tight.'"*

**Why this matters commercially**: a founder who watches their idea become an architecture become a BOM become a supplier shortlist over 20 minutes feels they bought something substantial. They tell other founders. The 20-minute build IS the demo.

**Build implications**:
- The running-state UI on `feat/forge-v2-cutover` needs the explanatory copy per stage — flesh out the 11 stages with what/why/cumulative-counter copy. ~½ day of writing + UI work.
- Stage-progress LLM calls should emit structured output (current sub-step, sub-step total) so the live counter is real, not faked.
- Periodic "moment of celebration" can be deterministic (fixed messages at fixed milestones), not LLM-generated. Cheap.

**Verification**: agent-browser run of the full Forge pipeline post-merge — does the user-observable surface stay engaging through all 20 minutes? Take a screenshot every 90 seconds, confirm progressive change.

---

### Supplier search output spec (Tristan, 2026-04-25 — mirrors Investor dynamic)

The Suppliers page (currently `/marketplace`) needs the same why+how treatment as Investor results. A free founder gets a list. A £20 founder gets the list + the reasoning + the qualifying questions. Same time-saved framing, same "show the work" principle.

**Every paid supplier result must contain:**

**1. Why this supplier is relevant to YOU.**
- Specific match reasoning citing the supplier's prior work, capability fingerprint, and how it intersects with your BOM/specs.
- Examples: *"Brixham Precision has run 4 similar-volume injection-moulding jobs in 2024-2025 — 2 in your sector. Tooling cost band matches your Q3 budget. Lead time 18 ± 3 days fits your launch window. ISO 9001 + AS9100 (you'll need the latter for the aviation OEM partnership). Their stated minimum order matches your forecast."*

**2. What to ask them when you reach out.**
- Tailored qualifying questions drawing on what THIS supplier has indicated matters in their domain + what's specific to YOUR project's risks.
- Examples: *"Three things to ask Brixham: (1) capacity for parallel runs in Q1 — they ran 3 simultaneous jobs in 2024 but you'll be #4. (2) Their stance on near-shore tooling sourcing — you mentioned IP sensitivity; they have a stated UK-tooling-only policy that would help. (3) Lead-time compression on tooling iterations — your design is 80% locked but expect 1-2 revisions and you'll need to know the cost-per-revision before you commit."*

This is what saves a founder a 90-minute supplier qualification call. They walk in already knowing the right questions.

**Sponsorship / dual-side revenue (DEFERRED — Tristan flagged for later)**:
- Suppliers may eventually sponsor visibility on this page (preferential placement, "Recommended by ForgeOS" tier, lead capture). Revenue from supplier side, not founder side.
- Investors looking for deal flow may pay to access aggregated founder pitch decks/early-traction data (with founder consent). Revenue from investor side, not founder side.
- Both create dual-sided marketplaces around the existing matching engine. Worth designing the data model now (consent flags, sponsor flags, deal-flow tags) so retrofit is clean — but the customer-facing flows are post-launch.

---

### Investor search output spec (Tristan, 2026-04-25 — non-negotiable)

The product anyone pays £20 for is the OUTPUT, not the search itself. Free tools (Crunchbase, LinkedIn) return matches. ForgeOS must return matches plus two specific synthesised outputs per result. Without these two pieces, this is just another investor database.

**Every paid investor result must contain:**

**1. Why this investor would back YOU.**
- Specific match reasoning, drawing on the founder's company context (sector, stage, traction, team, IP, cap-table).
- Examples: *"Conviction VC has led 4 of the last 6 UK food-tech Series A rounds in the £4-6M band. Your £400K pre-orders + 5-person team match the operational maturity bar partner Tina has previously cited as a deal-breaker. Their Q3 thesis update mentioned vertical farming as a watch area."*
- Built from: investor profile + portfolio data + recent partner statements + founder's foundry profile. Cached per founder-context (regenerate only when founder profile changes).
- **NOT** generic "they invest in your stage" filler.

**2. How to pitch THIS proposal to THEM.**
- Tailored opening framing, drawing on what THIS investor has stated they care about.
- Examples: *"Open with the unit economics — Conviction's last three deals all anchored on cost-per-customer or cost-per-output rather than top-line growth. Lead with: 'We can deliver kg-of-leafy-green at 38% of supermarket cost, and our Q1 contracts cover 71% of FY26 capacity.' Skip the TAM slide — Tina has publicly said she dismisses pitches that lead with TAM."*
- Built from: investor's stated thesis + portfolio decision patterns + recent public posts/podcasts/talks + founder's pitch raw material.
- This is the time-saver. A founder writing 30 personalised investor emails @ 30 minutes each = 15 hours per fundraise. With this tool, 5 minutes per email × 30 = 2.5 hours. Saves 12.5 hours per fundraise. At £50-200/h founder rate = £625-£2,500 of value per fundraise — vastly more than £20 month.

**Drafted email (third upsell lever)** is essentially the "How to pitch THIS to THEM" content rendered as a complete email body the founder copy-pastes into Gmail. Same underlying data, different output format.

**Output structure to render in the UI** (per match result):
```
Conviction VC                                   [SAVED]   [DRAFT EMAIL]
Match: 91%                                      Tina Patel · Partner
─────────────────────────────────────────────────────────────────────
WHY YOU SHOULD INTEREST THEM
Conviction has led 4 of the last 6 UK food-tech Series A rounds in
the £4-6M band. Your £400K pre-orders + 5-person team match the
operational maturity bar Tina cited as a deal-breaker on the
"Hardware in Climate" episode of Sifted Talks (Mar 2026).
Their Q3 thesis update flagged vertical farming as a watch area.

HOW TO PITCH THIS TO THEM
Open with unit economics — Conviction's last 3 deals anchored on
cost-per-output not top-line growth. Lead with:
> "We deliver kg-of-leafy-green at 38% of supermarket cost,
> and Q1 contracts cover 71% of FY26 capacity."
Skip the TAM slide. Tina dismisses TAM-led pitches publicly.
Mention the OEM partnership pipeline — they will ask about exit risk.
```

**Why this matters for the freemium funnel**:
- Maya (anonymous) sees ONE example match with FULL why+how output as a teaser. She thinks: *"I would have spent 90 minutes researching this investor — and I'd never have found the Tina-says-no-TAM detail."* That's the conversion moment. She signs up.
- Free user gets the why+how on 5 results lifetime. Enough to taste, not enough to fundraise.
- £20 Starter user gets the why+how on all 100 monthly results. Enough for one fundraise.
- £10/100 add-on user gets the why+how on extras. The cash cow.

**Build implications** (added to Phase G — Investors redesign):
- The why+how generation IS the LLM cost driver. Caching is not optional — same investor + same founder context = same output, cache aggressively.
- Quality bar: each why+how must be specific (cite a real fund decision, real partner statement, real portfolio precedent). Generic outputs = founder cancels. Run a quality benchmark before launch (10 real investor pairs, judged on specificity 1-5; minimum 4.0).
- Source citation: every claim links to where the data came from (investor profile field, portfolio entry, public talk transcript). No hallucinations — and visible source citations build trust.

---

## Round 3 — Competitive pressure (what stops a founder using free tools and never paying)

A hardware founder evaluating ForgeOS has free alternatives. Does ForgeOS deliver enough lift over the free stack to justify £25/month?

### The free stack a hardware founder can assemble today

- **Brainstorming**: ChatGPT (free GPT-4o-mini) or Perplexity (free) for any business question. Both produce decent responses.
- **Investor research**: Crunchbase free tier (basic profiles), LinkedIn search, founder Slack groups, free newsletters (Sifted, EU-Startups). Free if you put 3-5 hours per week into it.
- **CAD / Forge equivalent**: Onshape free, Fusion 360 free for hobbyists/startups, ChatGPT for spec generation.
- **Marketplace / Suppliers**: Alibaba search, supplier directories (Thomasnet, Industrytrust), word-of-mouth.
- **Manufacturing techniques**: free YouTube tutorials, MIT/MOOCs, open-source DFM guides.

### Where ForgeOS WINS on pure value (defensible against the free stack)

1. **Brainstorming-with-multiple-specialists is unique.** ChatGPT gives you one voice. Perplexity gives you one voice + sources. ForgeOS gives you Sage + Finn + Sal in conversation — different lenses on the same question. *This is real differentiation.*
2. **Investor matching with founder-context** is unique. Crunchbase shows you funds; ForgeOS shows you funds matched to your stage/sector + drafts the email. The drafted email is the time-saver — 30 minutes per outreach × 30 investors = 15 hours saved per fundraise.
3. **Forge end-to-end pipeline** (paragraph → architecture → BOM → manufacturer shortlist) is unique IF it works. ChatGPT will hallucinate the BOM. Onshape doesn't generate from text. The "real BOM with real supplier shortlist" is the moat.
4. **Manufacturing techniques curated for hardware founders specifically.** YouTube has it but unsorted. The pinned-per-project + annotated + Q&A pattern is the value.

### Where ForgeOS LOSES on pure value (the free stack is good enough)

5. **General Brainstorming on commercial questions** (pricing, hiring, fundraising story). Perplexity is genuinely close. ChatGPT is close. Founder might say *"I'd pay for the Forge but Brainstorming is just another wrapper."*
6. **Strategy/Objectives/Tasks (the Plan section)**. Notion is free, Linear is £6, Asana is free at small scale. ForgeOS's Plan section needs strong stickiness levers (history, decisions log, weekly digest) to be more sticky than Notion's free tier.
7. **CAD library searches.** McMaster-Carr has more parts than ForgeOS. Octopart has more electronics. ForgeOS aggregates but doesn't dominate.

### The 80/20 of "would they pay £25/month"

A founder pays £25/month if ForgeOS saves them >2 hours/month. That's 24 hours/year. Where do those hours come from?

- **15 hours/year from drafted investor outreach emails** (assuming 30 outreaches and 30 minutes saved each). Strongest single justifier.
- **5 hours/year from Forge's BOM + manufacturer shortlist** (assuming 1 product, 5 hours saved on supplier hunting). Second-strongest.
- **3 hours/year from Brainstorming pre-paired specialists** (5 minutes saved × 30+ sessions vs typing the question into ChatGPT and waiting).
- **5 hours/year from Plan section history/decisions log** (lookup time saved during fundraising diligence). Sticky lever.

**Total: ~28 hours/year saved. At a founder's effective hourly rate (£50-200/h), that's £1,400-£5,600/year of value. £25/month = £300/year. 5-20x value-to-price ratio.** This justifies the price IF the killer features work. Otherwise the founder uses free tools.

### Round 3 plan adjustments

8. **Marketing copy needs to lead with the time-saved math, not the feature list.** "30 investor outreach emails drafted in an hour, not a week." Founders respond to time-saved framing.
9. **Investor outreach drafting needs to be a featured demo** — it's the strongest single value lever and free tools can't do it.
10. **Plan section's stickiness levers (decision history, weekly digest, search history) are NOT optional.** They're the difference between "we use Notion" and "we use ForgeOS for the strategy bit". Without them, Plan is the weakest moat.
11. **Brainstorming alone is not a sales pitch.** It's a sticky retention tool, not a killer acquisition feature. ChatGPT does enough of it free. The Brainstorming page's job is to keep paying customers using the platform daily; not to convert non-paying ones.

---

## Convergence — the refined plan

Combining all 11 plan adjustments above:

### Adjusted strategic frame

- **Killer features (trial-converts-because-of-these)**: Investor outreach drafting + Forge end-to-end (paragraph → BOM → suppliers). Both deliver concrete time-saved on first use that free tools genuinely can't match.
- **Sticky features (paying-customers-stay-because-of-these)**: Plan with history/decisions-log/digest, Suppliers with shortlists/quote-tracking, Manufacturing Techniques with annotations/personalised tracks, Brainstorming-as-Perplexity-history. Justify month 6+ retention.
- **NOT a killer feature, despite my earlier framing**: Brainstorming itself. ChatGPT/Perplexity do enough of it free. Brainstorming is a retention/sticky feature dressed as the front door.

### Adjusted pricing

- **Kill Explorer £2.** Doesn't fund itself. Has all the overhead of a paying customer.
- **Make Starter £25 the entry point.** SaaS floor. Funds the unit economics.
- **Pro £100 and Enterprise £400 stay** — pending audit against logged data.
- **Trial: 14 days, card required, £0 charged, 25 brainstorms + 50 searches cap, auto-converts to Starter £25.**
- **No anonymous mode until paid base subsidises it** — feature flag on the plumbing, off by default.

### Adjusted execution order

#### Tier −2 — Onboarding reliability (do this before anything else)
*Added 2026-04-25 after Tristan flagged: "most people who have tried to sign up have had problems and have walked away".*

This is now P0 above cost. Card-required trial is meaningless if signup itself is broken. The whole funnel collapses at step one.

0a. **Map the actual failure modes.** Pass an agent-browser through every signup permutation against production: email+password new account, Google OAuth new account, signup-then-OAuth-link, signup-from-claim-flow, signup-on-mobile (375x812), signup-with-existing-email, signup-with-weak-password, signup-with-card-banner-blocking, signup-on-Safari iOS. Document each failure with: error message, network response, server log line if accessible. Findings appended to this doc as section "Round 4 — Onboarding failure-mode map".
0b. **Eliminate friction in the signup form itself.** Current `/join` requires Full Name + Email + Password + Confirm Password + complexity hint. Compare against industry SaaS norm of email+password (one field each). Decision needed: drop Confirm Password (Stripe and most SaaS do); make Full Name optional and prompt for it post-signup; relax complexity to "8+ chars" only.
0c. **Fix the routing inconsistency.** `/signup` → `/login?redirect=/signup` → `/join` is confusing. Either rename `/join` to `/signup` (sed-safe rewrite) OR redirect `/signup` directly to `/join`. Pick one canonical URL.
0d. **Verify post-signup landing always works.** `setupNewUser` has 3 fallback redirect branches today (existing-profile / orphan-cleanup / profile-creation-error). Each one should land somewhere useful. Currently 2 of them route `/agents` (good) but the chain is brittle if anything fails (e.g. Supabase RLS blocks foundry creation, foundry slug collides for the 3rd time, etc). Add error-recovery UI at each branch — never silently strand the user.
0e. **Cookie banner + cookie consent** that don't block the page. Today the banner overlays the homepage AND login AND signup, blocking the actual content. New users see "We use cookies..." instead of the headline.
0f. **Email verification flow** — works at all? Resends? Wrong-link error? Can't sign in if not verified? Walk it.

#### Tier −1 — Cost discipline (do this immediately after onboarding)
1. Build cost-logging instrumentation. Every LLM call writes to `llm_usage` table.
2. Build admin cost dashboard at `/admin/cost` — Tristan-only.
3. Run cost-logging for 5-7 days under your own usage. Get real numbers.
4. Tier-aware model selector: trial = Haiku/Gemma; paid = current per-specialist mappings (Sonnet/DeepSeek/etc per existing benchmarks); paid-premium = same. **Quality is a feature.** Tristan's words 2026-04-25: *"no point having stupid thoughts"* + *"there is an advantage of having different LLMs for different personas. let's keep the existing LLMs and personas for now."*
5. Default-model audit, NUANCED: don't blanket-downgrade. Per specialist benchmarks in MEMORY.md (composite scores 4.29-4.46), each specialist's model is calibrated to deliver a specific quality bar. **The audit looks ONLY for over-specced cron/autopilot calls** (e.g. is a status-update template using Sonnet when Haiku would produce identical output? then switch). Anything user-visible stays at its current model unless the benchmark suite confirms equivalent quality at lower cost. Run `experiments/autoagent-strategy-specialist/benchmark/runner.py` before any specialist-config change.
5b. **Anonymous/trial tier model downgrade is OK** — trial users haven't paid for premium quality, and the cheap-model output is still better than ChatGPT free for matched-prompt situations. The trial benchmark needs to clear voice score >= 4.0 (per CLAUDE.md "voice hard floor" rule) but doesn't need to match paid composite.

#### Tier 0 — Killer features must work (and be smart, not just reliable)
6. Brainstorming reliability AND QUALITY: fallback chain is reliability-first; the PRIMARY model per specialist stays at its currently-benchmarked best (per MEMORY.md). The cascade is "primary fails → DeepSeek → Sonnet → graceful empty-state with retry". Most calls hit the primary; only persistent failure escalates. Run the benchmark suite after any change to confirm composite stays within -0.2 of baseline (per CLAUDE.md keep/discard rule).
6b. **Brainstorming output quality red-team** — separate from reliability. After 6 lands, a sub-agent runs 10 real founder-prompts through team-meeting and judges output on a 5-dim rubric: actionability, specificity, strategic depth, voice consistency, multi-specialist coherence (does Sage and Finn actually disagree productively, or do they parrot each other?). Any composite score < 4.0 is a fix-before-launch.
6c. **Investor result spec implementation** — every paid match returns: (a) why this investor would back YOU, (b) how to pitch THIS to THEM, (c) drafted email body for copy-paste. Caching mandatory. Source citations visible per claim. Quality benchmark on 10 real investor-founder pairs before launch.
6d. **Forge running-state UX** — flesh out the 11-stage progress checklist in `feat/forge-v2-cutover` with what/why/cumulative-counter copy per stage. Live counters where applicable. Periodic moment-of-celebration messages. Greyed roadmap of upcoming stages.
6e. **Forge demo projects** — 3 high-quality demos always in the Saved folder, public-shareable URLs (HTML + PDF parity), brief-depth varied to make the case for putting effort into the brief. Generated by Tristan against his own foundry through the live pipeline.
6f. **Supplier result spec implementation** (mirrors 6c) — every paid supplier match returns: (a) why this supplier is relevant to YOU, (b) what to ask them when you reach out. Same caching + sourcing + benchmarking discipline as Investor.
6g. **Brainstorming → Forge handoff** — extraction of structured product description at end of relevant brainstorm sessions. CTA: *"Build this in The Forge"*. Deep-link prefills the Forge brief.
6h. **Brainstorming → Investor-test handoff** — CTA at end of investor-fit brainstorm sessions: *"See which investors would back this"*. Deep-link prefills the Investor search context.
6i. **"Show the work" copy** across Investor + Forge + Suppliers — pre-result framing ("we ran X computations across Y dimensions"), post-result citations, cumulative counters during runs. The framing IS the difference between £20 product and free Crunchbase.
7. Investor search end-to-end: verify embedding fix landed; run real queries against logged-cost; confirm matches + draft-email pipeline produces useful output.
8. Forge new build (`feat/forge-v2-cutover`) deploy to main. Verify end-to-end: paragraph → architecture → BOM → manufacturer shortlist actually arrives. Without this, Forge isn't killer.

#### Tier 1 — Pricing audit + tier restructure (REVISED 2026-04-25)
9. Pricing audit against the now-real cost-logging baseline. Calculate per-result LLM cost (search + why+how generation + drafted email).
10. Confirm Starter £20 / 100 leads / month margin > 0 with the bundled why+how + drafted-email content. If not: split drafted email into a £40 Outreach tier OR cache aggressively.
11. Confirm £10/100 add-on margin > 0. Almost certainly needs aggressive caching of why+how per investor-context.
12. Update Stripe products: kill Explorer £2, set Starter £20, set the £10/100 add-on as a metered/one-click upsell, audit Pro/Enterprise pricing, configure referral-credits engine.

#### Tier 2 — Free-after-signup + anonymous browsing (REPLACES the trial wrapper)

**Anonymous lands on `/investors` first — the key draw (Tristan, 2026-04-25)**. The Investor page is the strongest single acquisition surface (matched leads + why+how + drafted email = the 15-hours-saved-per-fundraise demo). Brainstorming and Forge come later in the journey, accessed via sidebar after they've been hooked.

13. **Homepage CTA → `/investors` directly** (anonymous mode). Skip the marketing scroll for users who clicked "Start free". They see the Investor page with a sample fully-rendered match (real investor data, why-fit + how-to-pitch + drafted email) so they grasp the value in 60 seconds.
14. **Anonymous browsing of `/investors`**: search box visible, results list visible, ONE result fully expanded as a teaser, the rest blurred/locked with *"Sign up to see your matches"* overlay. They get the proof of value, not the pile of value.
15. **Interaction triggers signup**: typing in the search box and hitting enter, OR clicking a locked result, OR clicking "draft email" — any of these triggers the signup wall framed as *"Save this search to your private sandbox — takes 20 seconds."*
16. **Anonymous browsing extends to `/agents` and `/the-forge-v2`** for users who explore the sidebar — but `/investors` is the first room they enter. Each surface follows the same pattern: see one teaser result, sign up to see more.
17. **Post-signup default landing — REVISIT Phase C**. Currently post-login routes to `/agents` (Brainstorming) per the Phase C decision earlier in this session. Given Investors is now the key draw + anonymous landing target: **change post-signup default to `/investors`** so the new user continues the journey they started. Existing logged-in users with established workflow continue to whatever route they last visited (or stay on /agents — split decision per user).
18. **Free tier post-signup**: 5 saved investor searches lifetime, 1 brainstorm/month, ability to save and revisit. Enough to taste; not enough to fundraise.
19. **Pricing options shown alongside free** at signup completion: "Stay on free / Start Starter £20 / See more". One-click upgrade.
20. **In-app upsells**: when a free user runs out, the prompt is *"Upgrade to Starter £20 for 100 searches/month with full why+how + drafted email"* + secondary CTA *"Or invite a friend — they pay £20, you get +100 searches free this month"*. Both options visible. Both one-click.

#### Tier 3 — Acquisition polish (after free-after-signup ships)
18. **Marketing copy rewrite**: lead with time-saved math ("30 investor emails drafted in 3 hours not 15"). Drop "AI agents" emphasis. Show one full why+how match as a screenshot above the fold.
19. **Smaller cookie banner** / accept-on-first-action. The current banner blocks clicks AND headline copy.
20. **Onboarding form simplification** (after Tier −2 investigation lands): drop Confirm Password, soften complexity to "8+ chars", make Full Name optional, canonicalise URL to /signup.

#### Tier 4 — Stickiness rebuild (paying customers stay)
18. Compressed Plan port + stickiness levers (history feed, streak, weekly digest, decision log, "what changed" banner).
19. Suppliers stickiness rebuild (shortlists per project, quote-tracking ledger, lead-time alerts, comparison view, procurement diary).
20. Manufacturing Techniques stickiness rebuild (saved-per-project, annotations, learning tracks, Q&A feed, founder-contributed content).
21. Brainstorming-as-Perplexity history (persistent URLs, citations, follow-ups, searchable history, branching).

#### Tier 5 — Viral mechanic (Tesla / Cowork model — REVISED 2026-04-25)
22. **Referral credits engine**:
    - Inviter gets **+100 free searches that month** for each invited friend who CONVERTS TO A PAID TIER (Starter £20+).
    - Invitee gets **+50 free searches** as welcome bonus, redeemable on first paid tier upgrade.
    - Inviter cap: +500 free searches/month (5 paying referrals — beyond that move them to a partner programme).
    - Quality guard: only PAID conversion counts. No free-tier-farming.
    - One-click "Copy invite link" CTA in the sidebar footer with running counter: *"42/130 searches this month · Invite a friend → +100 free"*.
23. **Power-user "free for life" lane**: founders who recruit 10+ paying customers earn unlimited investor searches as long as their referrals remain paid. Ungrades them to "Forge Ambassador" badge in the product.
24. **Anonymous mode unlock**: anonymous browsing is already shipped in Tier 2 (read-only); upgrading to anonymous brainstorm/search runs ONLY when MRR funds it. Feature flag gated on MRR threshold.

#### Tier 6 — Cleanup
24. AdvisorPanel removal (10 call sites mapped, ready to go).
25. Welcome page rebuild (lost in repo thrash earlier; re-do).
26. 9th idea prompt for deep-tech founders.

---

---

## Round 4 — Onboarding failure-mode map (added 2026-04-25)

After Tristan flagged that "most people who have tried to sign up have had problems and have walked away", I ran a live test against production. **Confirmed reproducible failure on the email+password signup path.**

### Test 1: signup with sentinel email + strong password
- URL: `https://fractionalforge.app/join`
- Browser: agent-browser headless, 1280px viewport
- Inputs: Full Name "Claude RedTeam Test", Email `claude-redteam-1777083185@forgeos.test`, Password "TestPassword2026" (Strength: Strong shown, matches confirm)
- Steps: dismissed cookie banner → clicked CREATE ACCOUNT → waited 10 seconds
- **Result**: form did not navigate. No error message, no loading state, no toast notification, no console-visible feedback. The form just sat there exactly as before.

### Test 2: same path with real-looking gmail.com email
- Inputs identical except Email `claude.test.1777083361@gmail.com`
- **Result**: identical. Silent failure. Email-domain hypothesis ruled out.

### Possible root causes (Tristan needs to investigate from server-side)
1. **Submit handler not firing** — JS error breaking the click handler, but no visible message in the page.
2. **Server returning 4xx/5xx silently** — fetch error not surfaced to UI.
3. **Rate limiter firing on first attempt** — possible if the rate-limit table treats a fresh anon-IP as recently-active. The login flow has a similar `withTimeout` + audit-log pattern; signup may share the bug.
4. **Form validation client-side rejecting silently** — the form requires the cookie banner to be dismissed, but post-dismissal there may be another invisible gate (CSRF token? ToS checkbox missing?). Note: there is NO "I agree to ToS" checkbox visible — the page just says "By joining, you agree to our Terms of Service" — possibly the auto-acceptance pattern is broken.
5. **Supabase auth.signUp throwing without UI catch** — the action runs but the error response never surfaces.

### What I'd test next from server-side (not possible via browser alone)
- Vercel function logs for the `/join` POST around the test timestamps (1777083185 and 1777083361)
- Sentry / equivalent error tracker for client-side exceptions
- Supabase Auth logs for any signup attempts in that window
- Browser DevTools → Network tab during a signup attempt: is the request firing? what's the response code? what's the body?

### Vercel-logs follow-up (added 2026-04-25 after Tristan flagged direct log access)

After Tristan reminded me I have direct Vercel access, I pulled production logs (`npx vercel logs --environment production --since 2h --level error -x`). Findings:

**SIGNUP**: zero `POST /join` entries in the last 2 hours, despite my submit attempts. **The submit click never reaches the server.** This rules out server-side bugs (rate limiter, RLS, Supabase auth) and points to a client-side block:
- Hypothesis A: Vercel BotID is silently dropping headless-browser submissions. agent-browser may be detected and the form-action POST is intercepted at the edge before logging. Real users on real browsers may NOT hit this — need a check from a normal browser.
- Hypothesis B: A client-side JS error is blocking the server-action invocation before it fires the network request. No Sentry, so I can't see this without DevTools.
- Hypothesis C: The button stays `disabled` due to a code path I haven't traced. Confirmed `disabled={isPending || passwordMismatch}` — `passwordMismatch` requires `confirmPassword.length > 0 && passwordValue !== confirmPassword`. agent-browser's `fill` command may not trigger React's `onChange`, so the controlled state stays `""`, making `passwordMismatch` evaluate `false`. Button SHOULD be enabled. So Hypothesis C is unlikely.
- **Most likely**: combination of A + a real-user-side issue (slow submit, no feedback, click then bounce) that's hard to reproduce remotely. Tristan should have a real friend or two attempt signup from a normal browser on their phone, with DevTools open.

**ACTUAL PRODUCTION BUGS FOUND IN LOGS (independent of signup):**

1. **02:41:58 `POST /investors` — `different vector dimensions 1536 and 768`**. The embedding-dim fix (commit `94b14d74` "swap nomicEmbedQuery → embedQuery in investor search paths") is NOT fully landed. Some code path still passes a 768-dim query embedding against the 1536-dim `marketplace_listings.embedding` column. Surfaces in `searchInvestors` and falls back to keyword search — explains why investor search "feels broken" even when not erroring.

2. **02:55:12 `POST /api/agents/execute` — Anthropic 529 OVERLOADED on `claude-opus-4-7` for `product-lead` specialist (Priya)**. This is exactly the brainstorming error I caught in the agent-browser test. Confirms the failure mode: Anthropic temporarily rate-limited Opus, no fallback chain exists, request errored out, frontend showed "AI provider is temporarily overloaded". Fix per CLAUDE.md spec: cheap-first cascade with retry — but only after benchmark confirms no quality regression per Tristan's "different LLMs per persona" preference.

3. **02:56:56 `POST /investors` — `[AIUsageTracking] Failed to track usage: TypeError: fetch failed`**. The cost-tracking call itself is throwing. This is the existing usage-tracking system I assumed was working — apparently broken. Implications for Tier −1 (cost discipline): when I rebuild cost logging, may need to replace this entirely rather than extend it.

### Round 4 plan adjustments (revised)

12. **Investigate signup silent-failure end-to-end** with: (a) Tristan-side test from a real browser on a phone with DevTools open, OR (b) check Vercel BotID configuration to see if it's blocking server-action POSTs from agent-browser.
13. **Add visible feedback on submit** — button disabled state with spinner, OR inline error with the actual message from server. Never silent.
14. **Make cookie banner non-blocking** — bottom-right toast variant. Doesn't intercept form clicks. Doesn't block the headline.
15. **Drop Confirm Password field**, soften password complexity to "8+ chars", make Full Name optional (collect post-signup if needed).
16. **Canonicalise the signup URL** — make `/signup` the live route, redirect `/join` to it (or vice versa). Pick one.
17. **Add a /post-signup landing diagnostic** — capture exactly what fails for users who reach `setupNewUser` but don't land on `/agents`. Add error UI with a "contact support" CTA at every fallback branch.
18. **(NEW) Fix embedding-dim regression** — find the path still passing 768-dim. Likely an unmigrated caller. Confirmed via Vercel error log.
19. **(NEW) Add Anthropic-overload fallback chain** in `streamSpecialistResponse` (or wherever the team-meeting LLM call lives). Cheap-first cascade with retry. Run benchmark suite to confirm no quality regression.
20. **(NEW) Fix AIUsageTracking fetch failure** — separate bug, surfaces every investor page load. Probably an internal endpoint URL change or an env var missing in production.

### Other onboarding red flags from the same session
- **Cookie banner blocks the form on first load**. Until dismissed, click events on form elements may be intercepted by the banner overlay. Real users may rage-click and see nothing happen. Confirmed: my first CREATE ACCOUNT click while banner present did nothing — accepting the banner first changed the ref tree, suggesting the banner WAS intercepting.
- **No "I'm a real human" indication or progress feedback**. After the click, the user has zero signal that anything happened. Either spinner, button disabled state, or error message is missing.
- **No "resend verification email" link** if the signup did half-succeed and is waiting on email confirmation — user is stuck.
- **"Confirm Password" field is unnecessary friction** in 2026. Stripe, Linear, Notion, Figma all dropped it years ago.
- **Routing inconsistency** persists: `/signup` → `/login?redirect=/signup` → `/join`. Three URLs for one flow.

### Round 4 plan adjustments

12. **CRITICAL: investigate signup silent-failure end-to-end.** Server logs + Network tab + Supabase Auth audit. This is the binding constraint — every conversion-funnel optimization downstream is meaningless if signup itself is broken.
13. **Add visible feedback on submit** — button disabled state with spinner, OR inline error with the actual message from server. Never silent.
14. **Make cookie banner non-blocking** — bottom-right toast variant. Doesn't intercept form clicks. Doesn't block the headline.
15. **Drop Confirm Password field**, soften password complexity to "8+ chars", make Full Name optional (collect post-signup if needed).
16. **Canonicalise the signup URL** — make `/signup` the live route, redirect `/join` to it (or vice versa). Pick one.
17. **Add a /post-signup landing diagnostic** — capture exactly what fails for users who reach `setupNewUser` but don't land on `/agents`. Add error UI with a "contact support" CTA at every fallback branch.

---

## What I want from you before I write code (REVISED 2026-04-25 after Tristan's pricing input)

The original three questions are now mostly answered by Tristan's £20/£10 pricing call. Two remaining strategic confirmations + one cost-question that only logged data can answer:

1. **Free-tier scope confirmation**: 5 saved investor searches lifetime + 1 brainstorm/month + ability to save (sandbox). Enough to taste, not enough to fundraise. Yes/no?
2. **Drafted-email upsell — bundle in £20 or split into a £40 Outreach tier?** My lean: bundle into £20 for launch (drafted emails are the time-saved demo that justifies the £20 price). Revisit once cost data shows what email drafting costs per result.
3. **Pricing audit before launch (not after)** — once cost-logging is in for 5-7 days, I run the maths on £20-with-100-leads-with-why+how-with-drafted-email. If the margin is < £5/user/month, we adjust BEFORE the marketing push. Agreed?

The hard rule from earlier holds: **Tier −2 (onboarding investigation) → Tier −1 (cost logging) → Tier 0 (killer features work) → Tier 1 (pricing audit + tier setup) → Tier 2 (free-after-signup flow with privacy/sandbox framing) → ...** No code commits before this order is locked.

---

## What I'm explicitly NOT doing tonight

- No more code commits. Repo's been thrashing all session and the strategic frame just shifted under me three times.
- ~~No more agent-browser red-team rounds against production. Each one cost £.~~ — **REVISED**: signup-flow testing is exempt because it doesn't burn LLM calls (auth/DB only). Onboarding red-team rounds (Tier −2) ARE happening; killer-feature red-team rounds against LLM endpoints are still on hold until the cost-logging dashboard exists.
- No anonymous-mode plumbing yet — feature flag stays off until the paid base funds it.
- No Plan/Suppliers/Techniques rebuild — Tier 4, gated on Tier 0-3 landing.
- No premature optimisation of the marketing copy — wait for the killer features to actually work, then rewrite the pitch around them.

---

## Post-execution verification (added 2026-04-25)

Tristan: *"once you have executed the local plan you will need several red teaming agent browser walk through to make sure that it all holds together."*

Agreed. After every tier ships locally, before deployment to main:

- **Tier −2 ship-check**: signup with email+password, signup with Google, signup on mobile, signup with bad password, signup with existing email — ALL must complete successfully and land on `/agents`. Add to the regression checklist.
- **Tier −1 ship-check**: every LLM call across the product (brainstorming, investor-search, Forge autopilot, agent insights, autopilot pipelines) writes a row to `llm_usage`. Verify by reading the table after a 30-minute use session.
- **Tier 0 ship-check**: end-to-end killer-feature walks. Investor search returns ≥10 matches AND drafts a real email AND the math on cost-per-search is < £0.10. Brainstorming completes 5 sessions in a row without error AND each session's cost logs correctly. Forge takes a real product paragraph through to BOM + manufacturer shortlist with logged cost < £1 per project.
- **Tier 1 ship-check**: Stripe pricing page renders, all tiers checkout, trial-with-card flow fires the right webhook, auto-conversion works (test against Stripe test mode then live).
- **Tier 2 ship-check**: card-required trial flow works end-to-end on production. Trial caps fire at the right number. Cancel-during-trial works.
- **Cross-tier ship-check**: 3 founder personas (Maya / Priya / Jamal) walk the full path from cold homepage → trial signup → killer feature use → conversion intent. Document where each persona stalls.

Each ship-check is its own commit + agent-browser session + signoff. No "I think it works" — the ship-check has to produce a screenshot + log entry confirming.
