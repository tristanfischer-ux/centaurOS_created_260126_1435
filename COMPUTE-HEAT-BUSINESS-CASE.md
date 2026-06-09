# Compute-Heat Brick — Business Case & Revenue Report

*A standalone techno-economic analysis for an England-based operator. Distinct from the **Anvil** Design Dossier (which engineers the box + bill of materials); this report decides whether the box is worth building at all. All prices in GBP; all regulation England/UK-specific. Researched live from primary sources, June 2026 — URLs cited. Confidence stated per section.*

*Currency note (read carefully — this is where revenue is easy to overstate): GPU-rental markets quote **US dollars**, and the price you see on `vast.ai/pricing/gpu/<model>` is the **renter** price, not what you receive. Two corrections apply to every dollar figure: **(1) host haircut** — Vast.ai's own data says live prices run *"about 25% above what hosts earn"*, so you keep ~80% (**÷1.25**); **(2) FX** — **£1 ≈ $1.27** (**÷1.27**). Chained: **host £/hr = renter $/hr ÷ 1.25 ÷ 1.27**. Example: RTX 4090 **$0.58 renter → $0.46 host → £0.37/hr**. Earlier drafts skipped step (1) and ran ~25% hot; §1a is the corrected, fully-sourced table.*

---

## 0 · Bottom line up front (read this first)

> ## ⚖️ VERDICT — is there a business here, or a waste of time?
>
> **As a "GPUs-in-a-box rented on Vast.ai" play: no — it does not clear your 1–2-year payback bar.** On fact-checked June-2026 UK prices *and* the **typical achieved** rental rate (not Vast's headline ceiling), the best practical card — the RTX 4090 — pays back in **~28 months GPU-only and ~3.5 years fully-loaded** (once the box, heat-recovery loop, pool install, maintenance and opex are in). The 5090 is no better once priced correctly at £3,270. Hardware lasts 3–5 years, so you'd recover capital roughly as the cards die. *Confidence: moderate-high — this holds across the entire audited price/rate range; only a joint-optimistic corner (top-of-range rate **and** 65% occupancy together) reaches ~21 months.*
>
> **The only version with a path to your return target is Phase 2 (§1d)** — becoming an inference *provider* with your **own near-continuous demand**, so you are not at the mercy of Vast.ai occupancy. That is a **software/coordination build, not a hardware bet**; its economics need token prices to clear ~£0.36/M and the fleet kept busy. Unproven — but it is where any upside lives.
>
> **Recommended decision:** do **not** commit capital at scale on the rental-only maths. The **~£2,000–2,500 one-box experiment is still worth running**, but reframed — to answer two specific questions before you spend more: (1) what occupancy and rate can you *actually* achieve on Vast, and (2) can you stand up a reliable token endpoint that beats raw rental? **If neither beats the central-case maths, it's a no.**
>
> *Why this is the third revision of the numbers: the first draft stacked two optimism errors — buy prices anchored on MSRP/cheapest-listing (5090 £2,200 vs real £3,270), and the rental rate taken from Vast's headline (4090 $0.58) when the typical achieved rate is $0.37–0.40. Both corrected below; both moved the answer the same way.*

1. **Per-GPU revenue is thin at realistic rates.** At the *typical* Vast rate a practical card nets ~**£20–120/month** (4090 ≈ £65/mo); only datacenter cards at high occupancy clear £150. Real money needs scale **and** measured-high utilisation.
2. **You sell compute two ways, in sequence.** **Phase 1 — rent the raw GPU** (Vast.ai), live in weeks. **Phase 2 — sell tokens** by becoming an inference *provider* on OpenRouter (you *can* do this — see §1b — and OpenRouter takes **0% from providers**). Phase 2 is higher-margin but needs the coordination core built first.
3. **Utilisation is the single make-or-break number, and nobody publishes it for home GPUs.** Everything hinges on it. You can only learn it by running one.
4. **Heat is a cost, not revenue.** You pay the power, give heat free. Heat recovery adds ~£750/box with no direct return — it buys free siting and the host relationship, nothing more.
5. **The boxes need a big heat sink — finding one is the prize (§6), and there are three tiers.** **Residential indoor pools** — strongest residential value (~£2,400–3,700/yr owner saving, SPATA installer channel) but narrow (~30–50k). The **schools** channel (your friend's 400). And **industrial/commercial hot-water hosts** — the biggest, most continuous sinks — where **laundries** (the *best* temperature fit, 24/7, ~10–15 operators reachable via one trade body) and **care homes** (right-sized, 24/7, ~16,500 sites, *no competitor*) are the standout new targets. Note: **Deep Green already owns leisure-centre pools** (£200M) — avoid that fight.
6. **The right first move is cheap and decisive:** build ONE air-cooled box at home (**~£1,100–2,200**), run Salad + Vast.ai for a month, **measure the real utilisation**. That number decides whether this scales.

**The card choice, on audited numbers (§1a).** If you build this, the **RTX 4090** is still the least-bad practical unit — 24GB clears the demand floor, 450W is real heat, it drops into any box — but at the typical rate it's a **~28-month GPU-only / ~3.5-year loaded** payback, not the ~15 I had before. The **RTX 5090** (£3,270, not £2,200) is no better. A **used A100 40GB PCIe** (~27mo) and **A100 80GB SXM** (~22mo) rank highest on return-on-capital but are passive/SXM — they need a server chassis and airflow engineering, not a simple distributed box. The cheap cards stay dead: **RTX 3090 ~40 months** (rent rate a third of the 4090's), and **everything under 16GB VRAM loses money after electricity** — renters won't hire it, so it just makes heat you paid for. *(Two corrections from the first draft: real buy prices, and the typical rental rate instead of Vast's headline ceiling — both made the picture worse.)*

---

## 1 · Revenue — Phase 1: renting the raw GPU

The fast, live-in-weeks channel. You list the GPU; a renter pays by the hour.

### The three platforms

| | **Salad** | **Vast.ai** | **io.net** |
|---|---|---|---|
| Model | They route jobs to your GPU | You set price, rent it out | Decentralised token network |
| OS | **Windows** (easiest) | Ubuntu/Linux | Linux/Windows |
| Residential OK? | **Yes, explicit** | Works in practice | Not restricted |
| Platform cut from you | hidden in the spread | **host keeps ~80%** (renter pays +25% on top) | 0% in $IO / 2% to cash out |
| RTX 3090 you earn | ~£0.07/hr (cut undisclosed) | **~£0.15/hr** ($0.24 typ renter → $0.19 host) | unclear |
| RTX 4090 you earn | ~£0.11/hr | **~£0.25/hr** ($0.40 typ renter → $0.32 host; *not* the $0.58 headline) | not published |
| Payout | PayPal/gift card, min ~£4 | Wise/PayPal, min ~£16, ~2-wk lag | $IO token → exchange only |
| Ease | **30 min, no config** | hard (Linux + verification) | medium + staking |
| Verdict | easiest to *try* | best *earnings* | **avoid first** ($IO down ~98%) |

*Sources: [computeprices.com/providers/salad](https://computeprices.com/providers/salad), [vast.ai host-fee removal](https://vast.ai/article/june-2024-product-update), [vast.ai/pricing/gpu/RTX-3090](https://vast.ai/pricing/gpu/RTX-3090), [vast.ai/pricing/gpu/RTX-4090](https://vast.ai/pricing/gpu/RTX-4090).*

---

## 1a · The 12 cards worth costing — audited, ranked by return on capital

Every figure below is **audited to 7 June 2026**: buy prices from bestvaluegpu.com (the live UK eBay-sold tracker) and named UK resellers; rental rates **cross-checked across 2–3 sources** and set to the **typical achieved** rate, *not* Vast.ai's headline page price (which is a ceiling — typically ~40% above what hosts actually realise). The sub-16GB and obsolete cards are **excluded, not omitted**: renters won't hire <16GB VRAM, so every one of them loses money after electricity. They're out of contention, not a data gap.

**The maths, fully explicit:**
> **host £/hr = renter $/hr (typical) ÷ 1.25 (Vast renter premium) ÷ 1.27 (USD→GBP)**
> **ROC %/yr = (host revenue − electricity) ÷ buy price** — *this is the "highest return on capital" ranking you asked for.*

Assumptions (editable in the spreadsheet): electricity **20p/kWh** paid only while computing; **24/7 listing**; **Heat W = board TDP** = watts to the host's water at full load; occupancy = a **reasoned per-card estimate** (Vast publishes none — this is the biggest single uncertainty, §1c).

| GPU | VRAM | Heat W | Form | Buy £ (used) | Renter $/hr (typ) | Host £/hr | Occ% | Net £/yr | **ROC/yr** | **Payback** | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A100 80GB SXM | 80 | 400 | **SXM** | 4,000 | 0.85 | 0.535 | 55 | £2,194 | **55%** | 22 mo | ✗ SXM needs a special server, not a box |
| A100 40GB PCIe | 40 | 250 | passive | 3,500 | 0.60 | 0.378 | 55 | £1,580 | 45% | 27 mo | ⚠ passive; UK used price low-confidence |
| **RTX 5090** | 32 | 575 | PCIe | 3,270 | 0.65 | 0.409 | 55 | £1,419 | 43% | **28 mo** | ~ no better than 4090 once priced right |
| **RTX 4090** | 24 | 450 | PCIe | 1,843 | 0.40 | 0.252 | 55 | £780 | 42% | **28 mo** | ◑ least-bad *practical* card |
| NVIDIA L4 | 24 | 72 | passive | 1,550 | 0.29 | 0.183 | 35 | £516 | 33% | 36 mo | ✗ only 72W — no use as heat |
| H100 80GB PCIe | 80 | 350 | passive | 18,000 | 2.00 | 1.260 | 55 | £5,733 | 32% | 38 mo | ✗ £18k capex; datacenter play |
| RTX 3090 | 24 | 350 | PCIe | 820 | 0.24 | 0.151 | 35 | £249 | 30% | 40 mo | ✗ cheap, but rate ⅓ of the 4090's |
| RTX A6000 | 48 | 300 | PCIe | 2,900 | 0.39 | 0.246 | 45 | £732 | 25% | 48 mo | ✗ |
| A10 | 24 | 150 | PCIe | 1,700 | 0.26 | 0.164 | 35 | £410 | 24% | 50 mo | ✗ |
| RTX A5000 | 24 | 230 | PCIe | 1,100 | 0.20 | 0.126 | 35 | £245 | 22% | 54 mo | ✗ |
| L40S | 48 | 350 | passive | 5,200 | 0.47 | 0.296 | 55 | £1,089 | 21% | 57 mo | ✗ |
| A40 | 48 | 300 | passive | 3,800 | 0.30 | 0.189 | 35 | £395 | 10% | 115 mo | ✗ |

*Buy prices audited 7 Jun 2026: [bestvaluegpu.com/en-gb](https://bestvaluegpu.com/en-gb/) (used eBay-sold), Ballicom, Intelligent Servers, GPUsed, Scan. Rental rates cross-checked: Vast.ai pricing pages, [computeprices.com](https://computeprices.com/providers/vast), gpuperhour.com, getdeploying.com — the **typical** rate, not the Vast headline. Host payout: [Vast.ai earnings article](https://vast.ai/article/how-much-money-can-you-earn-renting-out-your-gpu-on-vast-ai) ("~25% above what hosts earn"). **Best ROC (~55%) is still only a ~2-year payback — and that card (A100 SXM) needs a server, not a box.***

### 1b · The shortlist — and why even the best of it is marginal

A card must clear **three** bars at once: **earn** (≥24GB VRAM or renters skip it), **make real heat** (≥250W or it's useless for a pool), and be **plug-and-play PCIe** (or the box needs a server chassis + airflow engineering). Only two cards clear all three — and neither clears your payback bar at typical rates:

| Pick | Why it's the practical choice | Heat | ROC/yr | Payback (GPU-only / loaded) |
|---|---|---|---|---|
| **RTX 4090** (£1,843 used) | 24GB demand floor, 450W heat, any consumer box | 450W | 42% | **~28 mo / ~3.5 yr** |
| **RTX 5090** (£3,270 used) | most heat/card → fewer cards per pool | 575W | 43% | **~28 mo / ~3.4 yr** |

The A100s rank higher on ROC but are **passive/SXM** — they belong in a server rack, not a pool-side box, so they break the "modular cheap identical units" design. **The honest read of this table: the practical, buildable version of the product does not pay back inside two years on raw rental.**

### 1c · Why the number swings — the optimism corner

The whole verdict turns on two things you can't know from a desk: the **rate you actually achieve** and the **occupancy**. Here's the 4090 (buy £1,843, 450W, 20p power) across that span:

| 4090 scenario | Renter $/hr | Occ% | Host £/hr | Net £/yr | **GPU-only payback** | **Loaded** |
|---|---|---|---|---|---|---|
| **Typical** (multi-source rate) | 0.40 | 50 | 0.252 | £709 | 31 mo | ~47 mo |
| **Base** (typical rate, 55% occ) | 0.40 | 55 | 0.252 | £780 | 28 mo | ~42 mo |
| **Optimistic** (Vast rate **and** 65% occ) | 0.58 | 65 | 0.365 | £1,568 | **14 mo** | ~21 mo |

**Only the optimistic corner works — and it needs the top-of-range rate *and* 65% occupancy to hold at the same time.** That's the bet. Everything points to **Phase 2 (your own token-serving, §1d) as the only lever that can manufacture that corner deliberately** — by filling idle hours with your own demand instead of waiting for Vast renters, you control both occupancy *and* the effective rate. It also stabilises the heat: a card rented 55% of the time only heats the pool 55% of the time.

---

## 1d · Revenue — Phase 2: selling tokens (you become an OpenRouter provider)

**Correction to my earlier "you can't":** you can't list a single home GPU. But **you, the platform, can be a provider** — and it's more open than I said.

**How it works.** Your coordination core aggregates the fleet behind one reliable, OpenAI-compatible public endpoint. You list *that* on OpenRouter as a provider — exactly as **io.net, AkashML, Phala and Chutes already do** (all distributed-GPU aggregators, already live on OpenRouter). OpenRouter only cares that your **public endpoint** holds **≥95% uptime**; it explicitly places **no restriction on the backend architecture** ([openrouter.ai/docs/.../for-providers](https://openrouter.ai/docs/guides/community/for-providers), [openrouter.ai/providers](https://openrouter.ai/providers)).

**The commercial terms are the headline:** **OpenRouter takes 0% from providers.** Its revenue is a **~5% fee charged to buyers** (5.5% on card credit purchases, 5% crypto) — you receive the full token price you set ([OpenRouter platform-fee announcement](https://openrouter.ai/announcements/simplifying-our-platform-fee)). You apply at [openrouter.ai/providers/apply/form](https://openrouter.ai/providers/apply/form); a 100-request grace period applies before uptime is scored.

**What you'd need to build (the catch):** the serving layer that turns flaky distributed GPUs into one dependable endpoint — **vLLM** or **llama.cpp server** on each node, a router that presents a single endpoint and health-checks nodes (**LiteLLM Proxy** or **llmlb**, both open-source), the **same model + quantisation on every node**, pre-distributed weights, and a small **always-on "hot-spare" pool** (a few reserved cloud/datacentre GPUs) to hold the ≥95% SLA when home nodes drop. This is the coordination core — the actual product.

**Market token prices (GBP/million tokens, converted from USD):**

| Model | Cheapest (DeepInfra) | Mid (Together/Fireworks) |
|---|---|---|
| Llama-3.1-8B | ~£0.016–0.04 /M | ~£0.14–0.16 /M |
| Llama-3.3-70B | ~£0.08 in / £0.25 out /M | ~£0.70 /M |

*Sources: [OpenRouter Llama-3.1-8B](https://openrouter.ai/meta-llama/llama-3.1-8b-instruct), [Artificial Analysis providers](https://artificialanalysis.ai/models/llama-3-1-instruct-8b/providers), [DeepInfra pricing](https://deepinfra.com/pricing).*

**Does token-selling beat raw rental? Only at scale + above the commodity floor.** A single 3090 at ~100 tok/s makes ~0.36M tokens/hour. Sell those at:
- commodity (~£0.028/M) → **~£0.01/hr** — catastrophic, far below the **£0.13/hr** (corrected host rate) you'd get renting it raw;
- Together/Fireworks tier (~£0.15/M) → ~£0.05/hr — still below rental;
- **~£0.36/M → ~£0.13/hr — roughly parity** with raw rental;
- ~£0.79/M → ~£0.28/hr — **~2× the rental rate.**

So token inference **only out-earns rental once your blended price is ~£0.55–0.70/M *and* utilisation is high (~60%+)**. That requires demand volume and reliability — which is precisely the moat Together/Fireworks/Groq have. **Sequence it: rent raw for the revenue floor now; graduate to token-selling once the core is built and you have buyers. Keep raw rental as the fallback whenever inference demand is thin.**

*Hyperbolic ([hyperbolic.ai](https://www.hyperbolic.ai/)): you can supply raw GPUs to their marketplace (fast onboarding) as a revenue floor; their exact supplier cut isn't published. More useful as a benchmark than a primary channel.*

**Revenue risks (both phases):** utilisation (#1); commodity price erosion (your heat-funded low cost is the defence); residential ISP/ToS; the demand-aggregation problem for tokens; token volatility (io.net — avoid).

---

## 2 · Core cost — electricity (you pay it; the host gets free heat)

You pay the power; the host gets free heat — the only offer that works (if they paid, they'd "just buy a heater").

**How you pay the host (the Heata mechanism, confirmed):** install a **MID-approved revenue-grade submeter** on the box's supply (legally required — [energycontrols.co.uk/stay-legal](https://www.energycontrols.co.uk/stay-legal/)), read it remotely, and **reimburse the host at their actual tariff** as a credit to their energy account or bank ([heata.co/hosts/sign-up](https://www.heata.co/hosts/sign-up); Heata's illustrative rate ~**22p/kWh**). Reimbursing at-cost is **cost recovery, not resale → no Ofgem supply licence** ([Pinsent Masons](https://www.pinsentmasons.com/out-law/guides/decentralised-energy-exemption-electricity-licence-requirement)). Budget **£500–1,000 for a specialist energy-law opinion** before launch.

**Cheapest compliant submeter:** PJW DR2100-2MOD **£39.50** ([tewltd.co.uk](https://tewltd.co.uk/product/pjw-mid-approved-100a-din-rail-single-phase-kwh-meter-dr2100-2mod/)); WiFi remote-read Eastron SDM630-WIFI-MID **£162.55**; CT-clamp (no rewiring) Eastron SDM630MCT **~£95** + £20–30 CTs.

**Current England electricity rates (June 2026):**

| Tariff | Unit rate | Notes |
|---|---|---|
| **Ofgem price cap (Q2 2026)** | **24.67 p/kWh** + 57.21p/day | rises to **26.11p** from 1 Jul ([Ofgem](https://www.ofgem.gov.uk/information-consumers/energy-advice-households/energy-price-cap-unit-rates-and-standing-charges)) |
| **Octopus Agile** | avg **~17.8p**, off-peak ~15.9p, peak 50–80p, **sometimes negative** | ~200 negative slots in Apr 2026 ([agileprices.co.uk](https://agileprices.co.uk/)) |
| **Economy 7 night** | **~13 p/kWh**, ~29p day | needs host on E7 |
| **Business / commercial** | **~26 p/kWh** | for commercial hosts |

**Annual electricity cost (your COGS), 1 kW 24/7 = 8,760 kWh/yr:** **£2,161** at cap; **£1,400–1,560** time-shifted on Agile (saving **~£600–800/yr per kW**); £332 if Economy-7 night-only (but 29% duty cycle). *Confidence: high.*

---

## 3 · Heat generation (deterministic) — and why it forces a siting choice

Compute is a **coefficient-of-performance-1 heater: ~100% of watts → heat.** Heat is just the card's power draw.

**The crucial subtlety: a GPU only makes heat while it's computing.** Idle, it draws ~30–50W. So the heat actually delivered to the host's water is **TDP × occupancy**, not TDP. A card that doesn't *earn* (low occupancy) doesn't *heat* either — revenue and heat are the same physical event. That ties heat planning directly to the §1a ranking.

| GPU | Power = heat (TDP) | Heat/day @ full load | **Effective heat @ realistic occupancy** | Llama-3.1-8B Q4 |
|---|---|---|---|---|
| **RTX 5090** | 575 W | 13.8 kWh | **~7.6 kWh** (55%) | ~140 tok/s |
| **RTX 4090** | 450 W | 10.8 kWh | **~5.9 kWh** (55%) | 120 tok/s |
| A100 40GB | 250 W | 6.0 kWh | ~3.3 kWh (55%) | ~110 tok/s |
| RTX 3090 | 350 W | 8.4 kWh | ~2.9 kWh (35%, *and* poor payback) | 95 tok/s |
| NVIDIA L4 | 72 W | 1.7 kWh | ~0.6 kWh (35% — negligible) | 43 tok/s |

*Inference throughput: [localscore.ai](https://www.localscore.ai/model/1) (llama.cpp). Effective heat = TDP × occupancy × 24h.*

**The decisive consequence (revised):** the efficient low-watt cards I flagged before (L4, 4070) make **too little heat to be useful** — an L4 delivers ~0.6 kWh/day, a rounding error against a pool's demand. And the idle sub-16GB cards make *no* useful heat because they don't run. **For a heat sink you want high-TDP cards that also earn** — the 4090 and 5090. They minimise the card count for a given heat duty *and* pay back. A residential indoor pool's maintenance load (~5–10 kW continuous, §6b) is roughly **12–25× RTX 4090 at full load** (fewer 5090s); occupancy below 100% raises that count, which is the second reason **Phase 2 token-serving matters — it lifts occupancy, so the same boxes both earn more and heat more reliably.**

---

## 4 · Capital cost — the box (ex-GPUs) and what fits in a home

### Itemised bill of materials — a 3-GPU node (ex-GPUs), England retail GBP

| Item | Product | Price |
|---|---|---|
| Chassis | Open mining frame **or** IPC 4W2 4U case ([Scan](https://www.scan.co.uk/products/4u-ipc-4w2-mining-ai-case-supports-upto-8x-graphics-cards-6x-120mm-fans-2x-usb-20-black)) | £40–110 |
| PSU 1600 W | be quiet! Dark Power Pro 13 Titanium (£310) or 1600 W Gold (~£180) | £180–310 |
| Mainboard | ASUS TUF X670E-Plus (3× PCIe x16) or B650 (~£150) | £150–290 |
| CPU | Ryzen 9 7900X (host only) or Ryzen 5 (~£180) | £180–270 |
| RAM | 32 GB DDR5-6000 | £90 |
| NVMe | Samsung 990 Pro 1 TB | £140 |
| PCIe risers | 3× PCIe 4.0 x16 | £60 |
| **Heat recovery** | 3× GPU water-blocks (£450–520) + 30-plate brazed-plate HX (£80) + DDC pump (£70) + glycol/fittings (£110) | **£710–780** |
| Networking | 2.5 GbE NIC | £15 |
| Controller | Raspberry Pi 5 (node agent) | £80 |
| **UPS** | **Not needed for inference** (graceful shutdown; jobs just retry) | £0 |
| **Total ex-GPUs** | **lean air-cooled: ~£900** · **full with heat recovery: ~£2,000** | |

*Skip the UPS (saves £158–380). Air-cool the prototype — the £710–780 heat-recovery line earns no direct revenue, so add it only once compute economics are proven.*

### How much compute fits in an England home (sourced)

| Connection | Max continuous | GPUs | Cost |
|---|---|---|---|
| **13A socket** (no electrician) | ~2.5 kW | **3–4× RTX 4090** (~2 kW) — the home prototype | £0 |
| **Dedicated 32A radial** (electrician) | ~7 kW | **up to ~12× RTX 4090** or 8× RTX 5090 — the pool-scale node | ~£300–500 |
| 100A house incomer (new build) | 23 kW total; ~6–8 kW realistically spare | several boxes/house | DNO/3-phase beyond |

*Sources: [IET BS 1363](https://engx.theiet.org/f/wiring-and-regulations/25529/bs-1363-13a-socket-continuous-max-load), [BS 7671 loads](https://www.owelectric.co.uk/posts/maximum-loads-assumed-per-circuit-bs7671-regulation/). A 3–4-GPU box on a £400 dedicated circuit never swamps even a 60A house.*

---

## 5 · Unit economics & payback (GBP)

*Audited typical rate (§1a) at 55% occupancy, 20p/kWh. The "optimistic corner" column = Vast headline rate + 65% occupancy together (§1c).*

**Single-GPU prototype — build this to MEASURE, not to profit:**

| Build | Capex (GPU + £400 host) | Net £/mo (typical) | Payback (typical) | Payback (optimistic) |
|---|---|---|---|---|
| **RTX 4090** + host | £1,843 + £400 = **£2,243** | ~£65 | **~35 mo** | ~17 mo |
| **RTX 5090** + host | £3,270 + £400 = **£3,670** | ~£118 | **~31 mo** | ~20 mo |
| **A100 40GB PCIe** + host | £3,500 + £400 = **£3,900** | ~£132 | **~30 mo** | ~24 mo |

The prototype's job is to **learn your real occupancy and rate for ~£2,200** — not to pay back. At typical rates it doesn't.

**The real unit — fully-costed 6× RTX 4090 pool box (the spreadsheet):** full bill of materials (heat-recovery loop, pool plumbing, dedicated circuit, MID submeter, maintenance, opex) ≈ **£15,200**. At the **typical** rate it nets ~**£3,800/yr → a ~4-year payback**. At the **optimistic corner** it nets ~£8,500/yr → **~21 months**. The truth is somewhere between — and you can only find out by running one.

**Honest read:** on audited typical numbers the buildable product pays back in **~3.5–4 years** — at or past the 3–5-year hardware-life margin, so **not a business as a rental play**. It reaches your 1–2-year target *only* in the optimistic corner (top rate **and** high occupancy together), or via **Phase 2 token-serving (§1d)** — the one lever that deliberately manufactures high utilisation. The live model — every line editable and sourced — is **`COMPUTE-HEAT-FINANCIAL-MODEL.xlsx`**.

---

## 6 · Go-to-market: where the boxes go — the heat sink is the prize

The boxes need somewhere to put the heat — finding the sink is the prize. Three tiers: **§6a the schools channel** (your friend's 400), **§6b residential indoor pools** (best residential value), and **§6c industrial & commercial hot-water hosts** — laundries, care homes, hospitals, food, distilleries — the biggest and most continuous sinks of all.

### 6a · Schools + solar (your friend's 400-school channel)

**Verdict: a genuinely valuable *channel*, with a real seasonal flaw to design around. Moderate strength, clear niche — not a silver bullet.**

**Why it's attractive:** your friend's 400 solar schools solve the two hardest problems at once — **host acquisition** (warm, trusted relationships, solar already installed) and the **heat-sink mismatch** (a school's heat demand dwarfs a box's output, so nothing overshoots). Schools are mostly **3-phase** (400–800 kVA supply), have **good broadband** (100 Mbps primary / 1 Gbps secondary, [DfE standards](https://www.gov.uk/guidance/meeting-digital-and-technology-standards-in-schools-and-colleges/broadband-internet-standards-for-schools-and-colleges)), and make a **fundable story**.

**The cheap-solar mechanism, and its limit.** A school exports surplus solar to the grid under the **Smart Export Guarantee (SEG)** at **12–15p/kWh** (Octopus Outgoing 12p, British Gas 15.1p; Ofgem 2024-25 average 13p — [Which?](https://www.which.co.uk/news/article/smart-export-guarantee-rates-the-best-and-worst-seg-tariffs-for-solar-panel-owners-azICP0i78MD8)). If your box consumes that surplus on-site instead, you pay the school ~that rate — cheaper than ~17–26p grid import. Legally clean: a school feeding solar to an on-site operator sits inside the **Class A licence exemption** (private supply up to 5 MW, no licence — [Foot Anstey](https://www.footanstey.com/our-insights/articles-news/a-new-era-for-licence-exempt-supply-p442-and-class-a-guidance-updates/)); formalise with a private-wire PPA + DNO notification + a £200–500 submeter.

**But the seasonal mismatch is the real flaw (rated HIGH risk).** 65–70% of a school's solar lands **April–September** when **no space heating is wanted**; in winter, when heat is valuable, solar is **14–22% of peak**. And schools heat with **cheap gas**. So:
- the **solar-power** benefit peaks in the **summer holidays** — school empty, panels at full output, ~3,000–5,000 kWh of pure surplus a 20 kWp primary would otherwise export at 12–15p. Your box earns that instead.
- the **heat** benefit is real only for **year-round hot water** (kitchens, showers) — **not** winter space heating, because in winter there's barely any solar surplus to run the box on anyway.

**Honest economics (20 kWp primary, [West Mercia benchmarks](https://westmerciaenergy.co.uk/latest-news/energy-benchmarking-for-schools)):** exportable surplus ~6,500 kWh/yr → ~£780/yr of SEG the box can displace; school net benefit ~**£1,000–1,500/yr** (cheaper power + hot-water pre-heat + an operator fee). *Not transformative per school.* It scales better at **secondary level** (50–150 kWp), with **multiple boxes**, or — best of all — at a school with a **swimming pool** (year-round heat demand that fixes the seasonal mismatch).

**Use the channel like this:** pilot at **academies / multi-academy trusts** (commercial autonomy → 3–6 month sign-off vs 6–18 months for council-maintained), **prioritise schools with pools**, site the box in a **plant room on a separate network** (sidesteps safeguarding/data concerns), and lead the pitch with **"we turn your wasted summer-holiday export into income + free hot water."**

**Top 3 blockers (from the research):** (1) **seasonal solar-heat mismatch** — HIGH; design for hot-water + pools, don't oversell winter space heating; (2) **procurement + safeguarding** — HIGH; governor approval, fire risk assessment, insurer notification, data-privacy questions, 6–18 month cycle (the friend's relationships are what make this tractable); (3) **thin SEG-vs-retail arbitrage** (2–10p/kWh) — MEDIUM; the heat value must be properly costed in. *Sources: [DfE procurement](https://www.gov.uk/guidance/buying-procedures-and-procurement-law-for-schools), [GOV.UK school fire safety](https://www.gov.uk/government/publications/fire-safety-in-new-and-existing-school-buildings/fire-safety-in-new-and-existing-school-buildings).*

---

### 6b · Residential pools (indoor) — the best heat sink, a narrow market, a funded incumbent

**Verdict: the strongest residential value proposition and the cleanest heat match — but a premium niche, not a mass play, and Deep Green is already here (commercial only, for now).**

**Why pools beat every other home variant.** A home's hot water is ~5 kWh/day; a pool's heat demand is continuous and far larger, and the pool is a giant thermal store that **buffers your intermittent compute heat perfectly**. An **indoor** pool is heated **year-round** (95%+ utilisation as a heat sink) and — neatly — the heat is *most* valuable in winter, when a pool heat pump's COP drops. Cleanest residential heat sink there is.

**The value proposition (real GBP).** An indoor domestic pool costs **~£2,500–4,000/yr** to heat and run. A right-sized **5 kW** box delivers ~43,800 kWh/yr of free heat, saving the owner **~£2,400–3,700/yr** vs gas/heat-pump — roughly **10× the "free hot water" saving** (~£250/yr, per Heata). A compelling, advertisable offer to a wealthy, decisive owner.

**The channel (commercial, no schools bureaucracy).** The **SPATA** pool trade (~175 accredited members, ~400–600 firms, >£400M turnover, [spata.co.uk](https://www.spata.co.uk/)) installs *and services* private pools — the service contract is the natural place to drop in and maintain a heat box. "Free heating, fitted with your pool" is a clean installer upsell with aligned incentives, and the installer handles the plumbing + Part-P electrical a pool needs anyway.

**Size the compute realistically (smaller than it first seems).** A mid pool's *maintenance* heat demand is only **~5–10 kW** (an 8×4m outdoor pool is 4.8–6.4 kW), so a pool absorbs ~5–10 kW of compute — **~10–20 GPUs**, not 20–60. Residential pools are ~5–10 kW nodes; only a **commercial** pool (25m+, 30–100 kW) takes the big nodes. *(Sources: [Aquinium heat-loss](https://aquinium.co.uk/blog/articles/calculating-pool-water-heating), [Poolstore costs](https://poolstore.co.uk/content/how-much-does-it-cost-to-heat-a-swimming-pool), [Origin indoor running costs](https://www.originpools.co.uk/pools/indoor-pools/advice/cost-guides/how-much-does-it-cost-to-run-an-indoor-pool).)*

**The honest blockers:**
1. **Indoor only.** Outdoor pools are seasonal (~5-month heating window, ~40–58% of the year), risk overheating in summer, and leave heat with nowhere to go for 7 months. Indoor fixes this, but UK stock is small — **~30,000–50,000 indoor pools**, clustered in the wealthy South-East. Narrow, premium market.
2. **Electrical headroom.** A pool already running a 10–15 kW heat pump can exceed a 100A single-phase fuse once you add 5–10 kW of compute — needing a load interlock or a £3,500–15,000 supply upgrade. A siting filter and a cost. (BS 7671 §702: a separated plant room sits outside the pool zones — site there, IPX4, RCD, Part P.)
3. **Deep Green is here, with £200M.** [Deep Green](https://www.datacenterdynamics.com/en/news/uk-data-center-startup-offers-to-heat-britains-swimming-pools-with-waste-heat/) already heats public leisure-centre pools (62% gas cut, ~£20k/yr/pool; £200M from Octopus to scale to 100+) and names domestic-via-district-heating on its roadmap. The model is **validated** — the domestic-pool segment is white space **now**, but you'd be moving where a funded incumbent could extend. Their oil-immersion approach is overkill for a 5 kW domestic unit (a simpler air-cooled water-jacket box is cleaner near a pool plant room), but the competitive clock is real.

**Net:** indoor pools are the **best residential heat sink and value proposition** — pursue them as a premium, installer-channel niche (owners with >£3,000/yr pool bills), not a mass play, and treat Deep Green as the competitor to out-manoeuvre on the domestic end.

### 6c · Industrial & commercial hot-water hosts — the bigger, more continuous heat sinks

Beyond private pools sit businesses with **large, continuous, year-round hot-water demand** — better heat sinks than any home, and mostly uncontested. Researched UK figures (market scale is the column you asked for):

| Host | UK sites | Heat / site | Compute-heat temp fit (55–65 °C) | Year-round? | Channel | Competitor | Verdict |
|---|---|---|---|---|---|---|---|
| **Laundry (industrial)** | ~600–900 large (~4,800 total) | **1–2.5 MW** | **Excellent — wash water 40–60 °C, direct, no heat pump** | Yes (18–24 h) | TSA; ~10–15 big operators (CLEAN, Elis, Fishers) | **None** | **Best new target** |
| **Care home** | **~16,500** | 35–115 kW | Good — DHW 60–65 °C pre-heat | Yes (24/7) | Care England; HC-One, Barchester, Care UK | **None** | **Right-sized, uncontested** |
| Leisure / public pool | ~2,900 sites | 200–800 kW | Excellent — pool 28–30 °C, no boost | Mostly | GLL, councils, Sport England | **Deep Green (£200M)** | Great fit, **contested** |
| Hospital (acute) | ~1,100 | 200 kW–5 MW | Good — DHW/space pre-heat | Yes (24/7) | NHS Estates; FM leads | CHP incumbents | Big, slow, CHP-held |
| Food & beverage (CIP) | ~2,000–4,000 | 0.5–5 MW | Good — needs +10–15 °C boost (CIP 65–80 °C) | Yes | FDF; equipment vendors (GEA, Alfa Laval) | None | Huge scale, temp boost |
| Dairy | **~53 large** | 0.5 MW–multi-MW | Good — CIP 65–85 °C | Yes (24/7) | Dairy UK; top-9 direct | None | Shortest list, professional |
| Scotch distillery | ~154 | **~3.3 MW** | Good — mash 64–67 °C | Yes | SWA | None | Huge heat, but rural Scotland |
| Brewery | ~1,700 | 20–500 kW | Good — mash 65–75 °C | Yes | SIBA | None | Mostly micro = too small |
| Hotel | **~45,000** | 50–400 kW | Good — DHW pre-heat | **Seasonal** | UKHospitality; chains | None | Seasonal, variable |
| District heating | ~10,000+ schemes | MW-scale | Varies (best on 4th-gen low-temp) | **Seasonal** | Hemiko, Vital Energi, DESNZ | Hemiko/OPDC, Tyseley | Big, slow, infrastructure-heavy |

**Two stand out as the best new targets:**

- **LAUNDRIES — the best temperature fit anywhere.** Wash water sits at **40–60 °C**, *exactly* your ~55–65 °C coolant output, so your heat feeds the pre-heat loop **directly, no heat pump** — structurally simpler and cheaper than food/dairy CIP (which need a 10–15 °C boost). They run **year-round, 18–24 h/day** (hospital laundries 24/7), each large site burns **1–2.5 MW** of gas (£380k–735k/yr), and the channel is **concentrated** — ~10–15 multi-site operators via the [Textile Services Association](https://tsa-uk.org/), so one HQ deal rolls across many sites. ~600–900 large UK sites, **no compute-heat competitor**.

- **CARE HOMES — right-sized, continuous, uncontested.** A 47-bed home's ~35–50 kW heat load **matches a small compute node almost exactly** (no over-supply problem), runs **24/7 year-round** (frail residents need constant warmth — heat is *never* stranded), and there are **~16,500** of them under acute energy-cost pressure. **No competitor targets them** — Deep Green is on pools, CHP firms on hospitals.

**The competitive map is the strategic point:** **Deep Green already owns leisure-centre pools** ([£200M from Octopus](https://thenextweb.com/news/deep-green-octopus-energy-swimming-pools-data-centre), scaling to 1,500 sites) — don't fight there. District heating is contested ([Hemiko/OPDC](https://hemiko.com/news/opdc-announces-hemiko-as-development-and-funding-partner-for-innovative-new-heat-network/), Tyseley, Durham) and slow (~5-yr builds). **Laundries, care homes, hospitals, hotels, food/CIP, dairies and distilleries are open white space.**

**Honest caveats across all of these:** they heat with **cheap gas** (the COP-1 issue — your heat displaces gas at a modest £/kWh, so the value is the *volume* of fuel displaced, not a high per-kWh saving); they're **B2B sales** (slower than a homeowner, but facilities/energy managers feel the cost pain acutely post-2022); and temperature fit varies — **pools and laundries are direct; food, dairy and CIP need a small boost** above your output.

## 7 · The recommended first experiment (cheap, decisive)

1. One **used RTX 3090 (£700)** or, for best earnings, an **RTX 4090 (£1,790)** in a basic host (~£400). **Air-cooled, no heat recovery. ~£1,100–2,200 all-in.**
2. Run **Salad** (live in 30 min) *and* **Vast.ai** in parallel for a month.
3. **Measure the one number that matters: actual utilisation %**, and real £/month after electricity.
4. In parallel, test the heat-sink channel directly — through your friend, **one academy with a pool**, and via a **SPATA pool installer, one private indoor-pool home**. Run a box at each. That tests the channel and the year-round heat sink where the value proposition is strongest (~£2,400–3,700/yr saved for the pool owner).
5. If utilisation clears ~40–50% and the schools pilot lands, build out. If not, you learned it for ~£1,100, not by scaling into a loss.

---

## 8 · Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| **Utilisation unproven** | **High** | Measure with one box; the coordination core's job is keeping GPUs sold |
| **Schools: solar-heat seasonal mismatch** | **High** | Target pools + hot-water pre-heat; lead with summer-surplus value |
| **Schools: procurement + safeguarding** | **High** | Academies first; plant-room siting, separate network; lean on the friend's relationships |
| **Indoor-pool market narrow + clustered** (~30–50k) | Medium | Premium installer-channel niche, not mass; target >£3,000/yr pool bills |
| **Deep Green: funded pool incumbent (£200M)** | Medium | Move on the *domestic* white space now; simpler air-cooled box than their oil immersion |
| **Pool electrical headroom (pump + compute > 100A)** | Medium | Target indoor pools; load interlock or supply upgrade where needed |
| Token-selling needs demand volume to beat rental | Medium-High | Sequence it after Phase 1; keep raw rental as the floor |
| Compute price erosion | Medium-High | Heat-funded low cost = you outlast a price war |
| Heat recovery = cost, no revenue | Medium | Air-cool the prototype; add it only where free siting requires |
| Electricity at cap rate kills margin | Medium | Time-shift to Agile; run only when a job pays |
| Electricity-reimbursement / private-wire licensing | Low | Cost-recovery + Class A exemption; £500–1k legal opinion |
| io.net token volatility | Low (avoid) | Don't use io.net early |

---

## 9 · How this connects to Anvil

**Anvil** builds the engineering Design Dossier — the physical box: architecture, bill of materials, licences, the cost engine, investor matches. **This report is the business case in front of it** — does the money work, who buys, what does power cost. The revenue, electricity, capital and channel figures here feed Anvil's deterministic economics section. Keep it living: GPU spot prices, Vast.ai/OpenRouter rates, the Ofgem cap and SEG rates all move — re-verify on the day you commit capital.

---

*Every figure sourced to a live URL, June 2026, England/UK. GPU and token prices move fast — re-check before spending.*
