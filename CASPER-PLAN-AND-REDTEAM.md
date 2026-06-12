# ForgeOS / Anvil — Plan from the Casper call + Red-team

*Drafted 2026-06-09 after the Concrete4Change call. Source notes: `CASPAR-FOLLOWUPS.md`. This is a decision-forcing document, not a wish-list.*

---

## 1. North star (CURRENT — revised 2026-06-09)

Fractional Forge is **"AWS for hardware founders": a non-engineer founder goes from idea → credible concept → expert-vetted design → costed build → funding, at a fraction of the time / cost / people, keeping 100% of their IP and equity.**

It is a **hardtech origination + capital business, not a report shop.** The AI dossier + expert vetting are the cheap, scalable **de-risking / origination funnel**; the margin and venture upside are **downstream — funding (a cut of the raise + a small equity stake) and build coordination**, powered by the forge-capital investor database. Closest analogue: **Entrepreneur First / HAX, inverted** — every accelerator dilutes the founder; FF lets them keep equity and wins downstream.

Durable moat: the **investor-database-fed-by-dossiers data loop** + the **founder-keeps-equity inversion**. The AI-dossier edge narrows as tools mature (today's AI design tools are point tools for engineers — see §7) → the race is to lock the **build + fund rails and the data loop** first.

---

## 2. The plan (CURRENT — staged, money downstream)

**Stages — what the founder gets / how FF earns:**
1. **Free** initial concept report — lead-gen (AI, ~£0 COGS).
2. **£1,000** — report + supplier shortlist — ~pure margin (AI; near-zero cost to produce).
3. **£5,000** — **expert-vetted** ("does this make sense / what's missing", real experts at a market day-rate; **FF takes 30–40%** — NOT 10%, which on £5k = £500 = unviable). Then the founder draws down on expert time via the existing **escrow** system.
4. **Costing / RFQ** — curated supplier RFQs (FF identified the suppliers); **founder-paid coordination fee**, NOT a supplier kickback (kickback = legal exposure + immaterial).
5. **Build** — coordinate the build; **consume Xometry / Fictiv / Protolabs as the rail** — do NOT build manufacturing.
6. **Funding (the engine)** — build the deck + match to a curated early-stage hardtech investor network (forge-capital); demand-side first ("what would you fund?"), then originate to match. Revenue = **a cut of the raise + a small equity stake**. ⚠️ **FCA:** a cash success fee on a raise can make FF an unregulated placement agent (financial-promotion / "arranging deals in investments") — **equity-for-services is cleaner**; get it checked before this is more than introductions.

**Dropped (red-team + Tristan agree):** the editable engineering-tool-integration layer (an engineer's nice-to-have, not the founder's need; others are better placed to build it). The existing builder/module output is fine — the frontier is **buildability**, not tool integration. Also dropped: supplier kickbacks; AI-vs-expert opacity (be transparent — "AI-generated, expert-reviewed"); auto pipe-routing (a multi-year CAD trap); DWSIM-embed (use DWSIM offline as a validator only).

**Correctness bar:** the buyer can't vet the output → the bar is *higher*, not lower — "no error an expert would laugh at." Fix the wind £3,233/kW + CO₂ cost misses before any buyer test.

**The one test that matters now:** take one real concept (CO₂) to 3–5 early-stage hardtech investors — *"would you fund this?"* Prove downstream demand before more dossier work.

> §3–6 below = the red-team that drove this revision (kept as the evidence/audit trail). §7 = the full revised model + the 2025-26 competitor scan with cites.

---

## 3. Red-team (my own — independent critique panel appended below)

1. **"Engineering isn't essential" is a trap if over-applied.** Casper is a chemical engineer; he can spot credible-enough vs wrong. The *buyer* is a non-engineer who CANNOT. Ship plausible-but-wrong numbers, the founder pays £5k, the expert they hire says "this is garbage" → you've burned the customer AND the expert. So the credibility bar is *higher*, not lower. Re-target correctness from "score ≥8" to "no expert-credibility-killing errors" — and the wind/CO₂ cost misses fail that bar today.

2. **The editable-tool DAG is a major re-architecture.** Editing one input (CP) must propagate through downstream tools, mass balance, cost, BoM. The chain is a batch pipeline, not a reactive dependency graph. Interactive per-tool re-run = dependency tracking + partial re-run + state consistency = months. High cost for a feature whose user (engineer) isn't the payer.

3. **Customer-of-one risk + incentive mismatch.** This is ONE call with ONE person who is (a) an engineer (not the target persona) and (b) a would-be supplier (his expert catalogue). He wants the tool that makes *his* consulting flow. The plan over-indexes on his "engineer's dream tool." Validate with an actual non-engineer founder buyer before building Phase 1.

4. **Funnel economics are unproven.** Free→£5k→£20k assumes conversion at each gate. Unknown: conversion %, CAC, expert supply/margin at £5k, whether suppliers pay 2–3% without proven volume (chicken-and-egg). The free doc is cheap to make but worthless if it converts at ~1%.

5. **The moat is the flywheel + network, not the tool integration.** "All tools in one place" is replicable (Aspen, DWSIM, a funded competitor). The durable moat is expert-correction data + the expert/supplier network. Lead with B, not A.

6. **AI-vs-expert opacity is a trust/legal landmine.** Casper floated being opaque about whether it's AI or experts. If a founder pays believing experts reviewed it, it was AI, and it's wrong → reputational + possible liability. Be explicit about what's AI vs human-reviewed at each gate.

7. **Engineering-first layout was validated by one engineer.** A non-engineer buyer may find 30 pages of maths up front intimidating. Test the doc structure with the actual persona.

8. **Focus risk.** Three big builds (tool layer, flywheel, funnel) + the existing engine, for a near-solo founder = none done well. The plan must force ONE bet (above).

---

## 4. Independent red-team panel (three agents, distinct lenses)

### 4a. Unit economics — *Verdict: not viable as framed*
- **Conversion math inverts the cost structure.** Free→£5k for a considered purchase by a pre-formation, no-budget buyer is realistically **1–3%, not 10%+** → ~50 free 80-page dossiers per sale. The "free" artefact is the expensive part.
- **The £5k gate has no margin once a real expert corrects it.** A credible review = 2–4 days @ £600–1,200/day = **£1,500–4,800 on a £5k ticket** (4–70% margin; the *thorough* reviews are the *worst* margins). The gate meant to fund the business is structurally low-margin and you can't cut the expert without killing the value prop.
- **Casper's "back-catalogue" is a Rolodex, not supply.** Works for ~5 deals, gone by deal 10. Expert supply (not demand, not AI) is the binding throughput constraint.
- **Supplier-paid 2–3% rebate is a fantasy now + possibly a kickback.** Suppliers pay for proven volume (you have none); 2.5% of a £200k one-off pilot = £5k once after an 18-month cycle; undisclosed supplier-paid referral fees poison the "trusted advisor" position and raise procurement-conflict issues. **Drop it from the model.**
- **Solo-founder time is the real working capital** — every Gate-1 needs *you* to recruit/QA the expert + handle the customer. This looks like a consultancy with an AI front-end, not a product.
- **Single biggest economic unknown: true expert-hours-to-credible per dossier at Gate 1.** That one number decides whether the funnel has any gross margin. Measure it before building anything.

### 4b. Technical feasibility — *(read the actual codebase)* — *Verdict: build Pillar A the cheap way; avoid two traps*
- **Correction to my red-team #2: a tool dependency graph ALREADY EXISTS** (`scripts/lib/orchestrator/auto-planner.ts::composeToolGraph` — Tarjan SCC + Kahn topo-sort + coupled-pairs). The DAG is the easy 20%.
- **The expensive 80% is the contract + ~34-gate replay.** Re-running one tool must re-derive the frozen engineering-contract and re-run every downstream consumer + the gates — several of which are *hard chain exits* (gate 33 physics, gate 10 BoM, gate 20 hallucination). Gates today are exit-coded sequential stages over `state.json`, not pure functions.
- **De-risk = don't build "live reactive". Build edit → queue → full batch re-run → diff view.** Reuses 100% of the existing gate/correctness machinery; a 90-second spinner, not a 3-month reactive refactor. This *is* Casper's #1 ask, delivered in weeks.
- **Make re-run transactional**: an edit that fails a hard gate must surface "your change makes the column infeasible — here's which gate, here's why" (a *feature* for an engineer), never a half-updated contradictory doc.
- **0/229 tools have an input/output schema** → every editable card is bespoke schema work; make the schema a required field on `registerTool` and auto-generate cards from the registry. Start with 3–4 process tools.
- **DWSIM: do NOT integrate** (C# interop + data-model impedance + GPL-linking issues = multi-month rabbit hole, and it doesn't cover the real gap — ASF/FT chain-growth). **Use it OFFLINE as a validation oracle** ("our column matches DWSIM ±5%").
- **Auto pipe-routing is the trap** — a multi-year CAD research problem (what AVEVA E3D charges six figures for). A half-version produces routes an engineer instantly rejects, destroying the credibility the whole thesis rests on. Ship **manual** drag-drop + allowable-space envelopes (the Blender collision-box repurpose is cheap and sound) + clash *highlighting*, not auto-routing.
- **Edited inputs must stamp `provenance: user_override` + bust the cache** for their transitive closure, or you'll show an "Oxford packet" badge on a number the user typed (an expert-credibility-killer).

### 4c. Market & moat — *Verdict: moderate-low that it's venture-worthy as framed*
- **The plan is reverse-engineered from one engineer who is also a supplier** — the load-bearing flaw. The editable-tool feature is an *engineer's* workbench wish that conveniently routes paid work to people like Casper. n=1 discovery with a respondent whose incentives diverge from the payer's.
- **Buyer-vs-user mismatch: the editable tool likely *scares* the payer.** A non-engineer concrete CEO can't meaningfully edit a flowsheet; handing them editing power transfers the burden of being right back onto the person who came to you *because they can't carry it*. Editing belongs in the £20k tier (where a hired engineer uses it), not top-of-funnel.
- **"All tools in one place" is a feature, not a moat** — contested by AVEVA/AspenTech + commoditised by DWSIM + replicable by any funded AI competitor in a fortnight.
- **The only candidate moat is the data asset** — *a proprietary, structured, cross-archetype corpus of validated branded BOM/supplier + validation data*. "Experts correct dossiers" is hand-wavy until corrections are high-volume, structured, and generalise across archetypes (cement fixes don't improve a battery dossier). Dozens/year = a consulting file, not a flywheel.
- **Market size looks lifestyle, not venture**: non-engineer, pre-incorporation founders who'll spend £5k–£20k of *personal* cash = low single-digit thousands globally, brutal conversion.
- **AI-vs-expert opacity is a self-inflicted trust/legal wound** — for a product whose entire value is credibility to a non-expert. "AI-generated, expert-reviewed" transparency almost certainly *helps* conversion.
- **Substitutes already do 80% free**: a ChatGPT session, a consultancy's free scoping call (loss-leader to win the build), a £1–2k advisory day. The £5k tier sits in a dead zone — you must prove 10× better than the *free scoping call*, not 10× cheaper than the £20k design.
- **Single biggest market unknown: will the actual non-engineer persona PAY (live Stripe, not "I would") for an AI-generated, expert-reviewed dossier — before you build a single editable tool?**

---

## 5. What the red-team changes (the revised plan)

The three lenses converge on the same three moves. I'm changing the plan accordingly — the original "single next bet" (harden the doc + build the funnel) was **wrong**: it still assumes the funnel works.

**Convergent finding #1 — Validate willingness-to-pay BEFORE building anything.** All three agents, independently. The editable-tool layer (Casper's ask) serves the engineer (who doesn't pay) and scares the founder (who does). Do not build it, or the £20k tier, or DWSIM, or layout, until a real non-engineer founder pays.

**Convergent finding #2 — The moat is the data corpus, not the tools.** The market agent independently re-derived **exactly THE AIM** already in memory (`forgeos_the_aim`): the long pole is per-archetype branded-BOM/supplier data coverage, not code. The business moat and the engine's technical long-pole are *the same asset*. Lead with it.

**Convergent finding #3 — Cut the liabilities.** Drop the supplier-paid rebate (immaterial + legally dubious until volume + an LOI). Be transparent about AI-vs-expert ("AI-generated, expert-reviewed"). Don't attempt auto pipe-routing. Don't embed DWSIM.

**Reframed correctness bar (my point, sharpened by the panel):** because the buyer is a non-engineer who *cannot* vet the output, the credibility bar is *higher*, not lower. "Engineering isn't essential" (Casper) is true for him because he can self-check; it's false for the buyer. Re-target from "score ≥8" to "no error an expert would laugh at" — the wind £3,233/kW and CO₂ cost misses fail that bar today and must be fixed *before* the smoke-test, or the test fails for the wrong reason.

**Revised sequencing:**
- **Bet A (this week, ~£0): prove the funnel.** Live Stripe £5k checkout behind the existing dossier; drive ~20 qualified non-engineer founders to it; 20 persona discovery calls that do NOT demo editable tools (does it come up unprompted?); blind-rate your dossier vs a ChatGPT run vs a free consultancy scoping call with 5 founders. Decision metric: real paid conversion + does yours win on trust/usefulness.
- **Bet B (parallel, cheap): prove the margin + the flywheel.** Time-box ONE real expert review of one real CO₂ dossier → the expert-hours-to-credible number. Instrument the next ~20 reviews as *structured deltas*; does feeding them back measurably lift the next dossier? If you can't show a learning curve on 20, the flywheel is narrative.
- **Then, only if A+B clear:** (1) fix the credibility-killers; (2) build the editable-tool layer the cheap way (edit→batch-re-run→diff, reusing `composeToolGraph` + gates), positioned for the paid/£20k tier; (3) pour effort into the per-archetype data corpus = the moat = THE AIM.

---

## 6. Do this next (ordered, cheapest-first)

1. **Fix the dossier credibility-killers** (specialist-repeat, taxonomy prose [run verifying now], the cost misses) — a few days; prerequisite for any buyer test.
2. **Stand up the £5k smoke-test** — Stripe checkout + a one-page "expert-reviewed refinement" offer behind the dossier. ~1 day.
3. **20 persona calls** (non-engineer hardware founders) + the blind 3-way dossier rating. ~2 weeks, ~£0.
4. **Time-box one real expert review** of the CO₂ dossier → get the margin number. ~1 week (needs one expert).
5. **Decide** on the editable-tool layer *after* 1–4, and build it as edit→re-run→diff if and only if the buyer is real.

**My honest overall read (moderate confidence):** as Casper framed it, this is a productised consultancy, not an obvious venture. The venture-scale wedge is the *data corpus* (which you already believe — it's THE AIM). The editable-tool interface is a genuine product improvement and Casper's enthusiasm is real, but it's not the moat and not first. **The single highest-value action is the willingness-to-pay smoke-test — everything else is premature until a non-engineer founder pays.**


---

## 7. Revised business model (Tristan, 2026-06-09) + competitive scan

### The reframe — money is downstream; the dossier is origination, not product
Selling reports is a job (£500 on a £5k report). The model is a **hardtech origination + capital business**: the free→£1k→£5k AI+expert funnel is the cheap, scalable **de-risking/origination layer**; the margin + venture upside are in **funding (cut of the raise + small equity) and build coordination**, powered by the forge-capital investor DB. This is the **Entrepreneur First / HAX model with an AI origination engine** — but inverted: the founder KEEPS their IP and equity; FF wins downstream. Dossier = dealflow funnel.

### Revised stages (Tristan's car version)
1. **Free** initial report (lead-gen, AI).
2. **£1,000** — report + supplier info etc. ~pure margin (AI, near-zero COGS).
3. **£5,000** — vetted by real experts (initial "does this make sense" validation), experts paid a market day-rate, **FF takes 30–40%** (NOT 10% — 10% of £5k = £500 = unviable). Post-vet: founder can interrogate the experts via the **escrow/drawdown system (already built)**.
4. **Costing** — curated supplier RFQs (FF identified the suppliers). Monetise by charging the **founder** a coordination fee, NOT a supplier kickback (kickback = legal + immaterial).
5. **Build** — coordinate the build (consume Xometry/Fictiv/Protolabs as the rail; don't build manufacturing).
6. **Funding** — the engine. Build the deck + match to a curated early-stage hardtech investor network (forge-capital). Demand-side first: ask investors what they want to fund, originate to match. Revenue = **cut of the raise + small equity stake**. ⚠️ FCA: a cash success fee on a raise can make FF an unregulated placement agent (financial-promotion / "arranging deals in investments"). **Equity-for-services is cleaner than cash success fees** — check before scaling past introductions.

### Decision taken: DROP the engineering-tool-integration layer
Both the red-team and Tristan agree — integrating all the engineering tools (Casper's ask) is an engineer's nice-to-have, not what a founder wants, and others are better placed to build it. The existing builder/module output is fine. **Buildability** (not tool-integration) is the interesting frontier.

### Competitive scan (web, 2025-26 — cited) — *no one integrates the full chain*
- **Accelerators / studios (closest):** HAX/SOSV (~$250k for ~10–20% equity, uncapped SAFE), Bolt ($200k–$1m, in-house build + fundraising help), Entrepreneur First, Antler (7–12% for ~$150k), Deep Science Ventures, Marble. **All DILUTE the founder** — the structural opposite of "keep your equity." Selective cohorts, human-bandwidth-limited, none AI-dossier-driven.
- **Design consultancies:** Cambridge Consultants (Capgemini), TTP, PA, Plextek, Synapse, IDEO, frog — $150–500/hr, ~$30k–150k+/programme, no equity, no funding tie. The cost incumbent FF undercuts with AI (and their free scoping call is the real top-of-funnel substitute).
- **RFQ/build marketplaces:** Xometry (35.7% GM), Fictiv (→MISUMI 2025), Protolabs, Hubs, Jiga — brokers add 20–40%. **Consume these as the build rail, don't compete.**
- **AI-native design tools (the real threat — but all POINT tools):** Circuit Mind / SnapMagic (electronics BOM only, for pro engineers), Zoo.dev / AdamCAD (text-to-CAD, $6–18/mo, YC W25), Leap71 / PhysicsX (deep-tech design engines). **None produce a non-engineer-readable concept dossier spanning design+cost+BOM+suppliers; none touch fundraising.** This is FF's current seam.
- **Verdict:** genuine white space, but a **thin seam between five well-funded neighbours**. Closest to fear = **HAX** (already idea→build→fund; add an AI front-end and it replicates most of the thesis minus "keep your equity"). Risks: AdamCAD (cheap YC AI-CAD) going down-market full-stack; investor-matching platforms (OpenVC, Signal/NFX) moving upstream into deal-creation; consultancy/Xometry free-AI-scoping loss-leaders.
- **The compounding moat (the only durable one):** the **investor-database-fed-by-dossiers data loop** (forge-capital) + the **inverted, founder-keeps-equity** model. The AI-dossier edge narrows as tools mature → speed to lock the **build + fund rails + the investor data loop** is the deciding factor.

### Refined conclusion + the one test
FF is a hardtech **origination + capital** business; the AI dossier is the de-risking funnel; the moat is the investor-data-loop + the keep-your-equity inversion; build/manufacturing is bought-in (Xometry et al.), not built. **The single highest-value test: take one real concept (CO₂) all the way to "would you fund this?" in front of 3–5 early-stage hardtech investors.** If they lean in, the downstream model is real — and that, not report quality, is what to prove next.
