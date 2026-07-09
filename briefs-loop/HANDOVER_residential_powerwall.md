# Handover — Residential Powerwall Clone Experiment

**For:** Fable / Claude Code (or any cold agent)  
**From:** Cursor session 2026-07-09  
**Owner:** Tristan  
**Status:** Brief written. **Do not run the chain unless Tristan asks.** Plan + brief only.

---

## What Tristan wants

An **experiment**: use the existing ForgeOS design chain (the same path that already ships container BESS) to produce a **Tesla Powerwall–class residential wall battery dossier** — not Tesla IP, not a utility container.

**This session's deliverables (done):**

1. Brief: [`briefs-loop/residential_powerwall_clone.md`](./residential_powerwall_clone.md)
2. Market anchors (public Powerwall 3 specs + install clearances + self-check): [`briefs-loop/residential_powerwall_market_anchors.md`](./residential_powerwall_market_anchors.md)
3. This handover / plan

**Not done (and not requested yet):** cold chain run, scorecard loop, Excel ship.

---

## Why this should be easier than Codema

| Codema (hard) | Powerwall (easier) |
|---|---|
| Unseen / thin archetype (`water_treatment` / greenhouse) | Mature **`bess`** class with HARD slots, emitters, gates, cost bands |
| Hydraulic + fertigation + UV + RO naming traps | Electrical + thermal + enclosure — chain's home turf |
| Exec Summary UNVERIFIED on `ro_makeup_flow_m3_per_hr` alias gaps | Brief already uses **exact** metric keys the BESS path expects |
| Plant-scale GA / P&ID / irrigation phantoms | Single wall cabinet — simpler GA, fewer fluid ghosts |

Reuse BESS machinery. Do **not** invent a new product class unless the classifier refuses `bess`.

---

## Success criteria (when Tristan says "run it")

Honest chain-native scorecard only:

```text
out/<run>/tab-scorecard.json
```

Ship when **every** tab ≥ **9** and `verdict.ships === true` is **honest** (floor = min of all tabs, not a misleading aggregate).

Primary tabs to watch on first run:

| Tab | Likely risk |
|-----|-------------|
| Executive Summary | Brief metric key mismatch → UNVERIFIED (Codema lesson) |
| Sense-check | Container-scale DC bus / MWh language leaking into residential |
| Electrical | Single-phase 11 kW vs three-phase utility habits |
| Drawings / Renders | Wall cabinet vs 20 ft ISO container geometry |
| Cost / BoM | £/kWh band for residential vs utility BESS floors |

---

## Recommended execution plan (when authorised)

### Phase 0 — Preflight (no chain)

1. Read the brief **and** [`residential_powerwall_market_anchors.md`](./residential_powerwall_market_anchors.md) end-to-end. Skim the linked Tesla UK datasheet + install-manual clearance figure so the self-check table is loaded.
2. Confirm classifier / contract path for residential scale:
   - Expect `product_class ≈ bess` (or documented alias).
   - HARD slots from `engineering-lock-gate.ts`:  
     `nameplate_capacity_kwh`, `continuous_power_kw`, `cell_count`, `dc_bus_voltage_v`.
3. Grep for **container-only** assumptions that would poison a wall unit:
   - `20ft` / `ISO` / `MV` / `1500 V` / `rack_count` as primary topology
   - Utility cost bands that assume £/kWh for MWh systems
4. Dry-check brief metric keys against compliance / Exec Summary consumers (exact string match — Codema `ro_makeup_flow_m3_per_hr` lesson).
5. Run relevant **selftests** only (no cold chain):
   - BESS lock-gate / contract builder tests if present
   - Any residential / single-phase guards if you add them

### Phase 1 — First cold chain (only if Tristan says go)

Suggested command shape (adjust to current repo convention; do **not** use orphaned `nohup`):

```bash
cd /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel
# Use the same supervised chain launcher Tristan uses for BESS —
# typically serial-design-chain-v2 with brief path:
#   briefs-loop/residential_powerwall_clone.md
# Output dir example:
#   out/powerwall-clone-YYYYMMDD-HHMM/
```

Prefer **foreground + tee** so the process cannot die orphaned (Codema 1854 lesson).

### Phase 2 — Attack the artefact (OPERATING-FRAME)

Do **not** trust stdout. Open:

1. `tab-scorecard.json` — honest floor
2. `dossier.xlsx` — Exec Summary + Brief Compliance rows for every brief metric
3. Drawings — wall cabinet, not container; clearances ≈ 100 mm sides / 50 mm above / 300 mm front
4. BoM — residential PCS / LFP pack / hybrid inverter language, not MV switchgear
5. **Market-anchor diff** — walk the self-check table in `residential_powerwall_market_anchors.md` (13.5 kWh, 11.04 kW, 5 kW charge, 3× MPPT / 20 kW PV, 1105×609×193 mm, 130 kg, IP55/IP67, G99-at-full-power honesty)

For every tab &lt; 9: **route to source rule** (CORE FIX PRINCIPLE). Universal fixes only — no `if (powerwall)` special cases. Prefer noun/unit/provenance signals (e.g. "wall-mounted", "single-phase", "usable_energy_kwh").

### Phase 3 — Loop until ship

Same Codema loop discipline:

1. Fix rule + `--selftest` / proveCatch  
2. Cold re-run  
3. Re-read scorecard  
4. Stop when every tab ≥ 9 honestly  

---

## Brief anchors (do not silently change)

| Metric | Target |
|--------|--------:|
| Usable energy | **13.5 kWh** |
| Nameplate | **~14 kWh** |
| Continuous AC | **11.04 kW** @ 230 V 1φ |
| Mass | **~130 kg** |
| Envelope | **~1105 × 609 × 193 mm** |
| PV DC input | **up to 20 kW STC**, 3× MPPT |
| Cost ceiling | **£8,500** ex-works |
| Market | **UK** G98/G99 |

Baseline BoM = **one master unit**. Expansion pack is narrative only unless Tristan expands scope.

---

## Known pitfalls (pre-load these)

1. **Scale smear** — Container BESS emitters may emit racks, PCS skids, MV transformers. Residential must stay wall-cabinet + hybrid inverter + pack.
2. **Voltage smear** — Utility 1500 V DC bus is wrong; use residential HV DC (~350–450 V class) consistent with LFP pack architecture.
3. **Phase smear** — Brief is **single-phase 230 V**. Three-phase utility switchgear is a defect.
4. **Energy key smear** — Cover/Exec must not claim usable = nameplate. Keys are separate: `usable_energy_kwh` vs `nameplate_capacity_kwh`.
5. **Brand / IP** — No Tesla trademarks, no Tesla MPNs. Market-anchor language only.
6. **Cost band** — Gate 32 / industry bands may be tuned for utility £/kWh. If residential trips HIGH, fix the **family/band rule** universally (residential ESS band), not a one-off price patch.
7. **Drawing gates** — Panel schedule / GA may assume plant rooms. Wall unit needs cabinet GA + single-line, not ISO container GA.
8. **Codema distraction** — Separate track. Powerwall experiment must not wait on `ro_makeup_flow_m3_per_hr` unless Tristan re-opens Codema.

---

## Suggested first fixes (only if first run fails)

Order of attack if scorecard is soft:

1. **Exec / compliance UNVERIFIED** — exact brief metric key aliases (universal helper; same class as Codema RO makeup).
2. **Sense-check RADICAL** — strip container topology from residential brief signals.
3. **Electrical** — 1φ 11 kW Design I vs panel schedule consistency.
4. **Drawings** — enclosure envelope vs 20 ft container templates.
5. **Cost** — residential ESS £/kWh band vs utility BESS band.

Every fix: source rule + guard. No per-run BoM surgery.

---

## Out of scope (unless Tristan expands)

- Running the chain in this planning session  
- Tesla API / Powerwall cloud clone  
- Vehicle V2H as primary product  
- Multi-unit whole-home virtual power plant BoM  
- Continuing Codema ship loop in the same breath  

---

## File map

| Artefact | Path |
|----------|------|
| Brief | `briefs-loop/residential_powerwall_clone.md` |
| Market anchors (Powerwall 3 public specs/drawings) | `briefs-loop/residential_powerwall_market_anchors.md` |
| This plan | `briefs-loop/HANDOVER_residential_powerwall.md` |
| Reference (harder) BESS | `briefs-loop/bess_20ft_grid_storage.md`, `briefs-loop/bess_grid_storage.md` |
| Engine BESS brief | `src/lib/pdf-engine-v2/briefs/bess.md` |
| Lock gate HARD slots | `src/lib/pdf-engine-v2/lib/engineering-lock-gate.ts` |
| Chain entry | `scripts/serial-design-chain-v2.tsx` |
| Codema handover (separate) | `AGENT_HANDOVER.md` (repo root) |

---

## One-line brief for Fable

> Using `briefs-loop/residential_powerwall_clone.md` and the public Powerwall 3 anchors in `briefs-loop/residential_powerwall_market_anchors.md`, produce a shippable residential Powerwall-class BESS dossier via the existing `bess` chain path; do not run until Tristan authorises; when running, diff the dossier against the market-anchor self-check table and loop on honest `tab-scorecard.json` until every tab ≥ 9 with universal source-rule fixes only.
