# The Brief — Compute-Heat Brick (Modular Core Unit)

*One small, cheap, identical compute-heat unit — a "brick." One brick heats a house; fifty heat a swimming pool; five hundred heat a food factory. Same part, just more of them. Each brick runs artificial-intelligence inference sent by a central coordinator and pours its ~50–65 °C waste heat into whatever hot-water loop it is plumbed to. We sell the compute; the host gets the heat. The product is not a home appliance or an industrial container — it is a **modular brick** that spans both by replication.*

**Author:** Fractional Forge · **Date:** 2026-06-07 · **Status:** Brief v3 — modular core unit (supersedes the home-appliance and the big-container framings) · **Engine class name:** `compute_heat_module`

---

## 0 · The one-line

A roughly one-kilowatt, self-contained, liquid-cooled inference node with a standard heat-output connector and a network port. It is cheap, identical, and bench-testable. You deploy one in a home, gang fifty on a manifold for a leisure-centre pool, or rack five hundred at a factory — the unit never changes, only the count. A central platform sells the aggregated compute to artificial-intelligence buyers; each host gets low-grade heat that carries their hot-water base load. Scale, capital, and testing are all *linear in the number of identical bricks* — which is the whole point.

---

## 1 · The architecture decision (why modular — the core principle)

A bespoke ~250-kilowatt container is a big, lumpy capital item: hard to test, hard to finance before a customer exists, and re-engineered per site. The founder's call — **a modular system of identical, cheap, easy-to-test parts** — is the correct architecture, and it resolves the home-versus-industrial question by eliminating it:

- **One brick, any market.** The same unit is the atom of a home install (one brick), a pool (tens), and a factory (hundreds). We choose a *quantity*, not a market. The home model and the industrial model become the same product at different counts.
- **Linear capital.** Fund the fleet one brick at a time as demand lands — no £250,000 bet on a container before there is a customer. Capital expenditure tracks revenue.
- **Test one, trust the fleet.** Qualify a single brick on a bench (thermal, acoustic, safety, compute, heat-transfer); every other brick inherits that qualification. A bespoke big-box must be commissioned afresh at every site.
- **One stock-keeping unit.** A single mass-produced part beats N site-specific engineering jobs on unit cost, lead time, spares, and reliability.
- **The bitcoin-miner precedent, done right.** Miners scaled exactly this way — one identical ASIC unit, deployed from one-in-a-spare-room to thousands-in-a-warehouse. We borrow the form factor *and* the fleet-coordination model (§9).

**Honest nuance (moderate confidence):** a ~1-kilowatt brick produces ~24 kilowatt-hours of heat a day — more than a single house's hot-water-only demand (4–6 kilowatt-hours). So "one brick in a house" means it serves hot water *and* space heating in winter, with a small dry-cooler shedding the summer surplus (or the home runs a throttled brick). **The brick count tracks the available heat sink; the brick itself stays identical.** There is also a mild compute-density penalty versus a big rack (more overhead per watt) — accepted, because the cheap/testable/linear-scale wins dominate.

---

## 2 · The market reality (research synthesis)

- **SPAN XFRA** (SPAN + NVIDIA, 2026) proves paid distributed home compute is fundable — **but dumps the heat as waste.** Everything it throws away is our product.
- **Heata (United Kingdom)** bolts a compute unit onto a domestic hot-water cylinder for free hot water (saves ~£340/year), British Gas-backed — the *one-brick-in-a-house* precedent.
- **Deep Green (United Kingdom)** drops immersion-cooled compute into a leisure centre and **heats the pool**, saving ~£20,000/year and paying the host — the *many-bricks* precedent.
- **MintGreen (Canada)** heats a distillery, a sea-salt works, and **district heating** at >96% recovery — the *hundreds-of-bricks* precedent.
- **Qarnot (France)** digital boilers in housing and bakeries.
- Regulatory tailwind: the European Union Energy Efficiency Directive pushes datacentre waste-heat reuse.

**The unclaimed position (moderate-high confidence):** a *single modular compute-heat brick* that spans home → pool → factory by replication, monetised as coordinated, **verification-backed inference** (§9). Heata proves the home brick, Deep Green the pool fleet, MintGreen the district fleet — **but none runs one identical unit across all three counts as a trustable multi-tenant compute marketplace.** The moat is the coordination core + verification layer + the single-SKU manufacturing/supply position, not the heat idea.

---

## 3 · The physics (non-negotiable constraints)

1. **Compute is a perfect heater (coefficient-of-performance 1).** ~100% of the electricity becomes heat. One ~1-kilowatt brick = ~24 kilowatt-hours of heat a day.
2. **The heat is low-grade — roughly 50–65 °C** (moderate-high confidence; set by the cooling-loop temperature). It is an excellent **pre-heater / base-load source** (lifting cold mains from ~10 °C to ~55 °C is most of the energy) but **cannot reach high final temperatures alone** (clean-in-place 60–85 °C, pasteurisation 72 °C+). The host's boiler tops up. Frame as "carry 50–80% of the heat load," not "replace the boiler."
3. **The heat sink sets the brick count.** A house absorbs ~1 brick (with summer reject); a pool ~50–150; a factory/district hundreds. Match bricks to demand.
4. **Inference, never training.** Site-to-site latency forbids distributed training; bricks run inference + batch.
5. **A brick is plug-compatible.** At ~1 kilowatt it runs on an ordinary thirteen-amp socket (home), or off the host's three-phase distribution when racked (site). No socket ceiling at scale — you simply add bricks across the available supply.

---

## 4 · The core brick and its aggregation

**The brick (the unit the engine designs):** a ~1-kilowatt single-accelerator inference node — one high-end accelerator (consumer graphics card or efficient unified-memory device, ~0.7–1.0 kilowatt compute) plus mainboard, memory, local weight storage, a liquid cold-plate, a small pump, and a **quick-connect heat-output coupling** + network port. Cheap (target a few thousand pounds of parts), identical, sealed, bench-testable. A home variant may down-spec the accelerator (~0.5 kilowatt) to match hot-water-only demand; the mechanical/hydraulic/network interface is identical so the fleet stays uniform.

**Aggregation (same brick, more of them):**

| Scale | Count | Aggregation kit | Heat host |
|---|---|---|---|
| **Home** | 1 (±) | plug + cylinder coupling + small dry-cooler | hot-water cylinder + space heat |
| **Pool / laundry / small site** | ~20–150 | **heat manifold** + rack frame + network switch + site controller | pool / wash-water loop (Deep Green template) |
| **Factory / district** | ~100s–1000s | manifold banks + rack rows + site power distribution + site controller | process pre-heat / district loop (MintGreen template) |

The **aggregation kit** (manifold, rack, switch, controller, power distribution) is the only site-specific engineering — and it is plumbing and sheet metal, not bespoke compute. The brick is constant.

---

## 5 · Bill of materials

**The brick (the mass-produced atom — the engine's primary BoM):**
1. **Compute** — one inference accelerator, mainboard, memory, local NVMe weight storage, network interface.
2. **Heat capture** — cold-plate / liquid block, small circulation pump, sealed coolant, expansion/reservoir, temperature sensors, **quick-connect heat-output coupling**.
3. **Power** — internal power supply, thirteen-amp plug/lead (home) or busbar tap (racked), in-rush limiting, surge protection, per-brick energy meter.
4. **Control** — small controller (node agent: fetch / run / return / prove), watchdog, over-the-air update.
5. **Enclosure & safety** — quiet (<40 decibel) sealed case, leak detection + auto-isolation, thermal cut-out, fire-safe materials.

**The aggregation kit (site-scale, secondary BoM):**
6. **Heat manifold** — quick-connect headers ganging N bricks into one flow/return, plate heat exchanger to the host loop, isolation valves, **boiler-booster interface**, dry-cooler bypass.
7. **Rack & power** — rack frames, three-phase site distribution, protection, power distribution units, optional uninterruptible supply, revenue-grade power + heat metering.
8. **Network & control** — switch, redundant uplinks, optional Starlink satellite backup (remote sites), site controller + building-management-system integration.

---

## 6 · Power required

- **Per brick:** ~**1 kilowatt** continuous (home variant ~0.5 kilowatt). Thirteen-amp-plug compatible.
- **Per site:** N × ~1 kilowatt on the host's supply — ~20–150 kilowatts (pool/laundry), hundreds of kilowatts to megawatts (factory/district), drawn across three-phase distribution.
- **Continuous, 24/7.** Per-brick + site metering, revenue-grade (Measuring-Instruments-Directive).

---

## 7 · Internet required

- **Per brick:** trivial — inference is compute-heavy, bandwidth-light (a prompt in, an answer out; weights cached locally); latency-tolerant.
- **Per site:** one aggregated uplink, **25/5 megabits-per-second minimum, 50/20 recommended** for a small fleet; 1 gigabit+ for large sites; redundant where possible.
- **Starlink (satellite):** per-site backup/primary for remote homes and rural sites (district schemes, glasshouses, remote distilleries) — not the urban default.
- Link loss tolerated: work re-assigned, never lost (§9).

---

## 8 · Heat recovery

- Per brick: sealed coolant loop → **quick-connect coupling** → (home) cylinder coil, or (site) **heat manifold → plate heat exchanger → host loop**.
- **Pre-heat duty (§3.2):** lift incoming water ~10 → ~55–65 °C; host boiler finishes high-temp steps. 50–80% fuel-load displacement.
- **Demand matching:** dry-cooler bypass sheds heat the host cannot take (nights/weekends/summer) so compute never throttles. Brick count is sized to the host's *minimum* reliable demand; the bypass covers the surplus.
- **Safety:** pressure systems (Pressure Systems Safety Regulations), legionella control on domestic-style hot water (60 °C pasteurisation path), coolant leak isolation.

---

## 9 · The coordination core (the platform)

**The bitcoin mining pool is the blueprint — and uniform identical bricks make it cleaner still.**

1. **Central control plane, identical distributed nodes.** Coordinator (queue, schedule, billing, payout, fleet health) over thousands of *identical* bricks. **No blockchain.**
2. **Small work units, lightweight proofs** (Stratum-protocol shape; version 2 cut bandwidth 60–70%).
3. **Pay for verified work delivered, not jobs won** — the "shares" principle that makes a churning fleet bankable.
4. **Buyer surface:** an **OpenAI-compatible inference endpoint** + a **batch application-programming-interface** for latency-insensitive bulk jobs.
5. **The scheduler is a double lever:** time-shift batch to **cheap/green power**, *and* match compute output to the host's **heat demand** (run hard when heat is wanted, coast to the bypass otherwise).
6. **Fleet resilience:** multi-region gateways, redundant endpoints, idempotent accounting, no-data-loss reconnect.

**The one upgrade mining never needed — the real moat:** an inference output is not trivially checkable like a mining proof. Bake in a **verification layer** — redundant execution on a sample of jobs, output cross-checks, reputation scoring (references: Gensyn reproducible execution, Hyperbolic verifiable inference). This is what makes the fleet a *trustable multi-tenant compute marketplace*, not just N machines heating buildings.

---

## 10 · The economics (deterministic model — renders as a dossier section)

**Requirement:** the generated dossier must include an **economics section computed with deterministic maths** — explicit formulas and a stated assumptions block, no LLM estimation. The engine reads the bill-of-materials cost and the design power/heat figures, applies the formulas below, and renders the result.

**Per-brick, annual:**
```
Inputs (assumptions block, all explicit):
  C_brick   = Σ bill-of-materials lines               [£/brick, from engine BoM]
  P         = brick power                              [kW, from design]
  u         = utilisation                              [fraction, e.g. 0.70]
  p_elec    = electricity price                        [£/kWh, e.g. 0.20]
  y         = compute yield                            [£ per kW-hour of compute sold, e.g. 0.15]
  f_cap     = heat-capture fraction                    [≈ 0.85]
  f_use     = fraction of captured heat actually used  [site-dependent, ≤ 1]
  p_fuel    = displaced fuel price (heat)              [£/kWh-thermal, e.g. 0.07 gas]
  m         = maintenance rate                         [fraction of capex/yr, e.g. 0.05]

Derived (deterministic):
  E_elec    = P × 8760 × u                             [kWh/yr drawn]
  Opex_elec = E_elec × p_elec                          [£/yr]
  Rev_comp  = P × 8760 × u × y                         [£/yr compute revenue]
  H_cap     = E_elec × f_cap                           [kWh/yr heat captured]
  V_heat    = H_cap × f_use × p_fuel                   [£/yr heat value to host]
  Opex_maint= m × C_brick                              [£/yr]
  Net       = Rev_comp + V_heat − Opex_elec − Opex_maint   [£/yr]
  Payback   = C_brick / Net                            [years]
  ROI       = Net / C_brick                            [fraction/yr]
```

**Fleet of k bricks:** capex, power, compute revenue and heat captured scale **linearly ×k**; heat *value* is capped at the site's heat demand (`V_heat` uses `min(k·H_cap, site_demand_kWh) × f_use × p_fuel`). The section presents per-brick economics, then a small table for representative counts (1 = home, 50 = pool, 500 = factory), each with capex, annual net, and payback — all from the same formulas.

**Honest framing in the dossier:** show the **break-even electricity price** (the `p_elec` at which `Net = 0`) and the **utilisation floor**, so the reader sees exactly how thin or fat the margin is and what it depends on. This is the deterministic answer to "does this make money" — auditable, not asserted.

---

## 11 · Business model

**Three parties:** artificial-intelligence **buyers** pay the platform for compute; the **platform** owns/operates the bricks; the **host** provides power + space + takes the heat.

**The deal:** the host gets **cheap/low-grade heat** (a fuel-bill cut + carbon saving) and, at home scale, **free hot water with the electricity covered** (the Heata structure). The heat is simultaneously the host's incentive *and* the platform's free cooling. **Who pays the power** is set per scale: home = platform reimburses the metered brick (Heata model); site = host pays at their industrial rate for a hosting fee / revenue share, or platform pays and sells heat below gas-equivalent — model both via §10.

**Margin** = compute revenue − electricity − amortised hardware − overhead, with the heat buying free, welcome siting. A scale-and-utilisation game (idle bricks earn nothing); the modular brick makes the *capex* side linear and low-risk.

---

## 12 · Regulatory

- **One brick in a home:** a domestic appliance — **no planning permission** (Town and Country Planning Act 1990 s.55); Building Regulations G3 (cylinder) + Part P (electrical) on install.
- **A fleet indoors at a site:** **permitted installed plant** within existing industrial use — generally no planning; a containerised *outdoor* fleet may need siting consent, so lead with indoor racks on brownfield sites.
- **Other regimes:** BS 7671 (electrical), Pressure Systems Safety Regulations, fire, legionella, Measuring-Instruments-Directive metering. Install-quality, not blockers.
- **Modularity helps:** the *same certified brick* carries its safety qualification into every deployment; only the aggregation kit is site-assessed.

---

## 13 · Novelty, moat, risks

- **Novelty:** one identical, verification-backed compute-heat brick spanning home → pool → factory by replication, sold as coordinated compute.
- **Moat (durable):** the coordination core + **inference-verification layer**, single-SKU manufacturing/supply position, compute-buyer relationships, United-Kingdom install channel.
- **Risks:** (1) Deep Green / Heata / a hyperscaler add a coordinated inference marketplace; (2) low-grade-heat temperature ceiling limits high-temp processes — target low-to-mid-temp loads; (3) thin compute margin demands cheap power + high utilisation — surfaced honestly by the §10 break-even; (4) the verification layer is the technical long pole; (5) per-brick compute-density penalty versus big racks (accepted trade for testability + linear scale).

---

## 14 · Open decisions for the founder

1. **Brick power / accelerator:** ~1 kilowatt single consumer graphics card (cheapest, highest throughput) versus an efficient unified-memory device (~0.5 kilowatt, lower heat, fits larger models, pricier). Affects bill of materials, heat-per-brick, and which models run.
2. **Beachhead count:** start at **homes** (one brick, Heata-style, simplest install, builds the core) or at **pools** (tens of bricks, Deep Green-style, better heat economics per site)?
3. **Economics assumptions to pin for §10:** electricity price, compute yield (£/kW-hour sold), utilisation, displaced-fuel price — I will use defensible defaults and show the break-even unless you set them.
4. **Compute supply:** own the accelerators (full margin, capital-heavy) versus broker idle third-party capacity into the bricks (asset-light).

---

*Next: "the brief on the brief" — the engine-ready expansion the ForgeOS chain ingests, targeting the **core brick** as a brand-new archetype (`compute_heat_module`) — plus wiring the deterministic §10 economics as a rendered dossier stage. Then the chain run.*
