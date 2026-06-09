# Handover — Tristan's AI-Compute-Site Development Venture

**For:** a Claude coworker taking over the outreach.
**Date:** 8 June 2026.
**Read this top to bottom once; it's self-contained.**

---

## 0. TL;DR (the whole thing in a paragraph)

Tristan is launching a **capital-light** venture: he is a **developer/originator of AI-compute sites**, not a compute operator. He secures sites that have (a) an **existing power connection** (so no 12–15-year grid-queue wait), (b) **renewable generation** behind the meter, and (c) a **continuous heat demand / offtake** — and he sells or partners them to AI-compute operators and heat-network operators who are desperate for exactly this and can't find it fast enough. The current job is **outreach to a target list**. The first email (Deep Green) is **sent**; five more are drafted with contacts. **Your job: get the remaining approaches out, prep the discovery-call brief, manage replies and follow-ups.**

---

## 1. Who Tristan is (this drives the whole strategy)

- Ex-**Citigroup**, ex-**Shell**.
- Founded **Lumicity** — an agricultural energy-services company that **financed, built and operated 500 MW of solar and 30 MW of biomass heating across UK farms** (the "we own/finance the kit, the host gets the benefit" model). ⚠️ **Use only these two figures** (Tristan-confirmed). A scraped old Lumicity website gave different/lower numbers (67 MW solar, a "£25m turkey plant", "£100m raised", "248 installs") — those were **unreliable**; do not use them unless Tristan re-confirms.
- Earlier ran a **biomass-heating-to-poultry-houses** business → real farm relationships + plant-room / wet-heat-loop install expertise.
- Now runs **Fractional Forge**. Lives at **HP14 4AA** (Stokenchurch, Chilterns). His father is a resident at **Stone House care home** (HP17 8QX, near Aylesbury, oil-heated) — a personal warm-host contact.
- **Why it matters:** the venture *is* the Lumicity model (originate → de-risk → sell/partner sites) applied to AI compute. His credibility = real at-scale energy development + farm/heat relationships + having already run the same "we invest, the host benefits" model these operators run.

---

## 2. The model, one line

**Be the developer who brings power-secured, heat-capable sites to the AI-compute operators who can't get them fast enough — capital-light, paid on the development uplift / partnership, NOT by owning depreciating compute.**

---

## 3. How we got here (so you DON'T re-litigate the dead ends)

It started as "build compute boxes with heat recovery and rent them out / sell tokens." We modelled it exhaustively and it **failed**. Keep these hard-won conclusions:

- **GPU chips die economically in ~3 years** (rental rates collapse 80–95% in 5–6 yrs; a V100 now rents at $0.02/hr). Any compute payback must beat 3 years.
- **Realistic consumer-GPU (RTX 4090) utilisation ≈ 40%** (real host reports); the model needed ~55–77% to pay back. So the operator play doesn't.
- **Two markets — they don't overlap:** Market A = frontier training/inference (H100/B200, **sold out**, the trillion-dollar boom) — unreachable with £100k (sold out + capital + Nvidia allocation). Market B = commodity open-model inference on consumer GPUs — **oversupplied**, price racing to $0.03/M, **demand-saturated**. A small player can only serve B, which doesn't pay. **Token-serving ≈ raw rental — no uplift.**
- A small player's edge (cheap power, free heat) is **supply-side**, and neither market rewards cheap supply. **The binding constraint everywhere is a BUYER, not cheap supply.**
- **→ The pivot:** stop trying to own compute. Be the **site developer**. Power/grid is THE bottleneck (UK connection queue 12–15 yr; "powered land" trades at a 2.5–3× premium). Tristan's existing-connection + renewable + heat sites are precisely what operators are short of.

---

## 4. Current state — what's done

- **Deep Green email SENT** (to `hello@deepgreen.energy`, FAO **Mark Lee**, CEO) ~7–8 June 2026.
- **Five more tailored emails drafted**, with contacts (§6 / §7).
- Deep Green diligence done — Companies House + website (§5).
- A large set of earlier **analysis artifacts** exist (§8) from the operator-modelling phase. **They are largely superseded by the pivot** — reference them for numbers, but the live strategy is site development, not building compute.

---

## 5. Key intelligence (verified — don't re-derive)

- **Deep Green** (first target): UK, Octopus-backed. Companies House reality: **pre-revenue; only ~£9m of the headline £200m commitment actually drawn; 1 live site (Manchester, 400 kW); no disclosed revenue; ~9 staff.** Model: they **invest everything** ("no capex, no catch" for the host) and deal **direct with heat hosts** — they do **not** advertise a co-investing site-developer/JV role. Bottleneck looks like **sites/install, not demand**. Their site says they are **"actively seeking heat-network / district-heating partners"** — headline want is **network-scale heat offtake**, not single-facility hosts. CEO = **Mark Lee** (founder Mark Bjornsgaard moved to Chief Innovation Officer, US-focused).
- **Era4** = the rebrand of **Carbon3.ai** (verified: carbon3.ai 301-redirects to era4.com; announced 2 Mar 2026). UK sovereign-AI, brownfield + renewable-powered data centres, 40+ sites, CEO **Tom Humphreys**. Strong-fit operator (needs many powered sites) — but now emphasises **brownfield land they own/control**, so rural farms are a softer fit; lead on power + renewables + heat.
- **THE OPEN STRATEGIC QUESTION (unvalidated — every call must test it):** will operators actually **pay or formally partner** a developer for sites, or just take free introductions and deal direct with hosts? Deep Green's "invest + deal direct" model implies the developer's value is a **qualified, exclusively-locked, pre-surveyed power/heat site pipeline**, not a mere intro. **Defensibility = lock the host/site relationship (exclusive option) BEFORE revealing it.** If a target won't pay/partner for originated sites, that's the answer for the price of a call.

---

## 6. Target list — contacts & status

| # | Target | Role | Send to | Confidence |
|---|---|---|---|---|
| — | **Deep Green** (Mark Lee, CEO) | compute operator (heat-host) | `hello@deepgreen.energy` FAO Mark Lee | ✅ **SENT** |
| 1 | **Era4** (was Carbon3.ai — Tom Humphreys CEO / Karl Havard CCO) | compute operator — best fit | `hello@era4.com` FAO Tom Humphreys | ✅ verified |
| 2 | **Digital Reef** (Piers Slater, founder) | fellow site developer (collaborate) | **LinkedIn → Piers Slater** (site blocked; no inbox) | 🔎 LinkedIn |
| 3 | **Hemiko** | heat-network operator (you = heat source) | `bidding@hemiko.com` (or `hello@hemiko.com`) | ◑ general inbox |
| 4 | **1Energy** | heat-network operator (NE England) | **LinkedIn / 1energy.uk** (site unreachable) | 🔎 find dev lead |
| 5 | **nLighten / Proximity** | edge colocation (sub-20 MW sites) | contact form at nlighten.com, or LinkedIn | ◑ leadership unclear (Harro Beusker vs Dawn Childs) |
| 6 | **Pulsant** (Victoria Marcer, Corporate Development Director) | edge colocation | `partners@pulsant.com` FAO Victoria Marcer | ✅ **best-verified — named, exact-fit role** |
| 7 | **Zendo Energy** (Jade Batstone CEO / Drew Barrett COO) | energy integrator/packager | `hello@zendoenergy.com` | ◑ general inbox |
| 8 | **Argyll Data Development** | compute operator (Scotland only) | `info@argylldev.com` | ◑ general inbox — *only if Scottish sites* |

Note: personal emails aren't public for any of them (same as Deep Green). For **founder-led** targets (Era4, Digital Reef, Zendo) **LinkedIn to the named person is the better channel** than a generic inbox.

---

## 7. The outreach emails (templates — tailored by the recipient's ROLE)

**Standing blanks in all of them:** the two call slots `[day/time]`, and confirm the sign-off entity (default "Founder, Fractional Forge").

### Email type A — Compute operator (Era4; adapt for Argyll)
> **To:** hello@era4.com — FAO Tom Humphreys (or Karl Havard, CCO)
> **Subject:** Powered, renewable-backed sites for your rollout
>
> Hi Tom,
>
> I'm Tristan Fischer. I founded Lumicity, an energy-services company — we financed, built and operated 500 megawatts of solar and 30 megawatts of biomass heating across UK farms.
>
> I've been following Era4's model — turning powered, renewable-backed land into compute — and it's close to what I develop: sites with an existing power connection (no grid-queue wait), renewable generation, and, with biomass, continuous year-round heat. With 40-plus sites to find, I think I can bring you a pipeline.
>
> What's your site spec — power, generation, location — and how do you work with developers who bring you sites? If there's a fit, I can move quickly.
>
> Worth 20 minutes in the next week or two? I'm free [day/time] or [day/time].
>
> Best, Tristan
> Tristan Fischer, Founder, Fractional Forge

### Email type B — Fellow developer (Digital Reef — collaborate, don't sell)
> **Subject:** Powered-land developer — worth comparing notes?
>
> Hi Piers,
>
> I'm Tristan Fischer. I founded Lumicity, an energy-services company — we financed, built and operated 500 megawatts of solar and 30 megawatts of biomass heating across UK farms.
>
> I saw the Teesside / Sembcorp deal — we're doing the same thing: originating power-secured sites and packaging them for compute operators. I'm working the smaller, distributed end (existing-connection renewable and heat sites, sub-10 megawatts), where you're at hyperscale.
>
> I wondered if there's value in comparing notes — you refer smaller sites to me, I feed larger ones to you, or we co-develop where it fits. Happy to share what I'm seeing.
>
> Worth a short call? I'm free [day/time] or [day/time].
>
> Best, Tristan / Tristan Fischer, Founder, Fractional Forge

### Email type C — Heat-network operator (Hemiko; for 1Energy swap "Old Oak and Park Royal" → "your Sunderland data-centre heat project")
> **Subject:** Data-centre heat sources for your networks
>
> Hi [name],
>
> I'm Tristan Fischer. I founded Lumicity, an energy-services company — we financed, built and operated 500 megawatts of solar and 30 megawatts of biomass heating across UK farms.
>
> I saw your work building heat networks around data-centre waste heat (Old Oak and Park Royal). I develop the supply side: power-secured sites that host compute and produce continuous, recoverable heat — and I have the host relationships and the energy-development background to make the offtake real.
>
> If I bring forward sites near your networks or zones, would you contract the heat — and could that help unlock Green Heat Network Fund support for the offtake infrastructure? I'd value understanding what makes a heat source bankable for you.
>
> Worth 20 minutes? I'm free [day/time] or [day/time].
>
> Best, Tristan / Tristan Fischer, Founder, Fractional Forge

### Email type D — Edge colocation (nLighten / Pulsant)
> **Subject:** Connected sites for your UK edge expansion
>
> Hi [name],
>
> I'm Tristan Fischer. I founded Lumicity, an energy-services company — we financed, built and operated 500 megawatts of solar and 30 megawatts of biomass heating across UK farms.
>
> I see you're expanding your UK edge footprint. I develop sites with an existing power connection (no grid-queue wait), behind-the-meter renewable generation, and — where it fits — a heat offtake. With new connections now on a 12-to-15-year queue, an existing one is the scarce thing, and I can bring you a pipeline that already has it.
>
> What's your site spec — power, location, size — and how do you work with developers who bring you sites? If there's a fit, I can move quickly.
>
> Worth 20 minutes? I'm free [day/time] or [day/time].
>
> Best, Tristan / Tristan Fischer, Founder, Fractional Forge

### Email type E — Energy integrator (Zendo)
> **Subject:** Powered sites with heat offtake — for packaging
>
> Hi [name],
>
> I'm Tristan Fischer. I founded Lumicity, an energy-services company — we financed, built and operated 500 megawatts of solar and 30 megawatts of biomass heating across UK farms.
>
> I saw your work on the energy side of Deep Green's Urmston site. I develop what sits upstream of that — existing-connection, behind-the-meter renewable generation, with a continuous heat offtake. What I don't yet have is the compute-operator relationship to complete the deal.
>
> I wondered whether there's a fit: I bring the powered, heat-capable site; you package the energy and bring — or introduce — the compute operator. Happy to share what I'm developing.
>
> Worth a short call? I'm free [day/time] or [day/time].
>
> Best, Tristan / Tristan Fischer, Founder, Fractional Forge

### The Deep Green email (already sent — for reference)
Same structure as type A, addressed to Mark Lee, leading on "I've already run the model you do" + "I saw you're actively seeking heat-network partners."

---

## 8. Files created (in `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/`)

⚠️ Most of these are from the **superseded operator-modelling phase** — keep for the numbers, but the live strategy is §2.
- `COMPUTE-HEAT-BUSINESS-CASE.md` — the full operator business case (GPU economics, electricity, heat, go-to-market). Rendered via `~/.claude/scripts/show-md`.
- `COMPUTE-HEAT-FINANCIAL-MODEL.xlsx` — pool-deployment financial model.
- `COMPUTE-HEAT-VIABLE-MODELS.xlsx` — the 4 viable-lever scenarios grounded in real operators.
- `COMPUTE-HEAT-POULTRY-MODEL.xlsx` — broiler-house plant-room model (330 MWh/yr heat) + a **Demand** tab (the ~40% utilisation reality).
- `COMPUTE-SOLAR-SITE-MODEL.xlsx` — 4 MW solar+battery+grid site model.
- `COMPUTE-HEAT-100K-BOOTSTRAP.xlsx` — "where does £100k go" model.
- `HEAT-HOST-MAP.html` + `heat-host-layer.geojson` — map of care homes near Aylesbury, colour-coded by **confirmed** heating fuel (EPC-verified: Stone House/Hulcott/Woodlands Park/The Lindens = oil).
- `HEAT-HOST-TARGETS.md` — ranked heat-host types (poultry/care homes/schools/hospitality).
- `SCHOOLS-CONVERSATION-PREP.md` — prep for the solar-schools-friend conversation.

---

## 9. Next actions (prioritised)

1. **Send the ready inboxes now:** Era4 (`hello@era4.com`), **Pulsant** (`partners@pulsant.com`, FAO Victoria Marcer — strongest verified contact), Hemiko (`bidding@hemiko.com`), Zendo (`hello@zendoenergy.com`).
2. **LinkedIn (Tristan does this himself):** connect with **Piers Slater** (Digital Reef) and **Victoria Marcer** (Pulsant) with a ~200-char note; find **1Energy's** development lead. Offer to draft the 200-char notes.
3. **Prep the discovery-call brief** for when an operator replies — the four questions: (a) is your bottleneck sites or demand? (b) how do you work with / pay developers who bring you sites? (c) what site profile — heat load, power, location, single-facility vs heat-network? (d) what do you most need from a partner? Plus: **hold the specific poultry/farm pipeline** — lead with energy-development credibility + heat-network offtake, play the farm card only once you know their priority.
4. **Follow up Deep Green** if no reply in ~2 weeks (one-line LinkedIn nudge to Mark Lee).
5. **Argyll** only if Tristan has Scottish sites.

---

## 10. How Tristan wants you to work (his rules — follow them)

- **Outreach voice:** first-person, **British spelling**, **specific numbers over adjectives**, **one** clear ask, **NO acronyms** (spell everything out — "joint venture" not "JV", "megawatts" not "MW"), sign "Tristan — Founder, Fractional Forge". **Match his voice; if a draft is "not my voice" twice, stop and ask for a writing sample.** Lead with the recipient's benefit; never failure-framing.
- **Cost discipline:** use **cheap models (Haiku)** for lookups/grunt work; keep agent briefs tight; don't over-research. He notices wasted spend.
- **Accuracy over approval:** **never put a number, claim or contact under his name that you haven't verified.** (We caught wrong Lumicity figures, verified the Era4 rebrand, and corrected the Deep Green CEO this way.) Verify, then assert.
- **No reflexive agreement.** Push back with reasons; give **independent estimates first**; state **confidence levels** (high / moderate / low / unknown). "I disagree" is a complete sentence.
- **Tristan does not run terminal commands** — do everything autonomously.
- Render markdown for him via `~/.claude/scripts/show-md <path>`. Light mode only.

---

## 11. Honest caveats to carry (do not oversell this to him)

- The venture rests on an **unproven assumption**: that operators will pay/partner a developer for sites rather than take free introductions. **Test it on the first calls.**
- The targets are **mostly small, early-stage** (Deep Green pre-revenue; Era4 early). Near-term volume is limited — this is a portfolio-of-conversations play, not a sure thing yet.
- **Heat-network offtake (Hemiko / 1Energy) is the differentiator** that makes a site fundable to *any* compute operator and can unlock grant money — line one up early.
- His **Lumicity track record + farm/heat relationships are the real moat** — but the moat only holds if he **locks sites/hosts exclusively before revealing them**, or he gets disintermediated.

---

*End of handover. The single most useful next move is sending the four ready emails and prepping the call brief; the single most important thing to learn is whether any operator will actually pay/partner a developer for originated sites.*
