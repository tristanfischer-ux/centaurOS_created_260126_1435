# Radical Week 2 — BESS Decomposition Report

**Date:** 2026-05-10
**BOM source:** BESS Container 3.5 MWh / 1 MW PCS, 40-ft ISO (briefs/baseline-10/09-bess-container.md)
**Pipeline runs used:** bess-archfix-out.txt (23 lines) + bess-sot-out2.txt (25 lines — used as ground truth)

---

## Summary

| Metric | Value |
|---|---|
| BOM line count | **25** |
| Lines successfully decomposed | **25 (100%)** |
| New radicals needed | **12** (seed was 5, total would be 17) |
| New characters needed | **20** (seed was 10, total would be 30) |
| New modifiers needed | **22** (seed was 5, total would be 27) |
| New archetypes needed | **25** (seed was 10, total would be 35) |
| Radical reuse rate | **56%** (14 of 25 lines mapped to existing radicals only) |
| Word (character) reuse rate | **4%** (1 of 25 lines mapped to an existing character) |
| Directionality ratio | **14:1** (radical reuse vs word reuse) |

---

## Kill Criteria Results

### 1. Radical growth — PASS
- Cap: 15 new radicals
- Actual: **12 new radicals**
- The 5 seed radicals covered structural and basic electrical needs. BESS added: chemistry (LFP, suppressant, mineral fibre), semiconductor logic, magnetics, electromechanical switching, thermal transfer, fluid flow, and sensing (chemical, optical).

### 2. Character growth — PASS
- Cap: 50 new characters
- Actual: **20 new characters**
- Well within bounds. All 20 are genuine function classes (power_converter, circuit_breaker, transformer, dc_contactor, protection_relay, gas_sensor, etc.) — no degenerate one-offs.

### 3. Archetype growth — PASS
- Cap: 100 new archetypes
- Actual: **25 new archetypes**
- One archetype per BOM line (expected: no two BESS lines were identical products). Far below the danger threshold.

### 4. Directionality test — PASS
- Required: radical reuse >= 3x word reuse
- Actual: **14:1** (56% radical reuse vs 4% character reuse)
- Radicals reuse heavily because BESS draws on the same physical primitives. Characters do not reuse because BESS introduces genuinely new function classes absent from the marine-fastener seed. The hierarchy is pulling reuse to the right level.

### 5. Coverage — PASS
- Required: >=60%
- Actual: **100%**
- Every BOM line decomposed. No concept was unrepresentable in the schema.

---

## Verdict

**ALL 5 KILL CRITERIA PASS. Radical SCALES for BESS.**

Week 3 dispatch authorised: decompose vertical farm + heat pump.

---

## Top 5 Most-Reused Entries

No seed archetypes were directly matched (BESS introduces no marine bolts or polymer gaskets). Reuse operated at radical level:

| Rank | Seed entry | Lines | Why |
|---|---|---|---|
| 1 | solid_state_of_matter (radical) | 25/25 | Universal — all BESS BOM items are solids |
| 2 | electrical_conducting_function (radical) | ~18/25 | Every electrical component |
| 3 | steel (radical) | 4/25 | Structural / enclosure items |
| 4 | copper_busbar (character) | 1/25 — exact match | DC busbar 800V/2000A only needs a new modifier |
| 5 | silicon_semiconductor_function (new, but once added) | 8/25 | BMS, EMS, protection relay, sensors, UPS |

---

## Top 5 Most Novel Characters

| Rank | Character | Reuse potential |
|---|---|---|
| 1 | power_converter | Inverters, rectifiers, DC-DC, UPS — very high archetype cardinality |
| 2 | circuit_breaker | Every voltage/current rating = new archetype; universal in electrical BOMs |
| 3 | pcb_controller | BMS, EMS, motor controllers, IoT — the most reused character class in electronics |
| 4 | liquid_cooling_system | EV drivetrains, data centres, bioreactors, heat pumps (Week 3 will reuse this) |
| 5 | dc_contactor | Voltage and current variations cleanly modelled as modifier combinations |

---

## Recommendation for Week 3

Proceed. Heat pump will reuse liquid_cooling_system, power_converter, circuit_breaker, and the thermal_transfer_function + fluid_flow_state radicals added in Week 2. Vertical farm will need ~3 new radicals (photon_emission_function, chemical_dosing_function, polymer_structural_tube as character). Both together predicted to add <=10 radicals and <=30 characters — well within remaining headroom.

Caveat: Week 2 used a single decomposer. Week 3 should run both BOMs through two decomposers independently for Cohen's kappa on level-boundary objectivity before merging.

---

## Surprising Finding

solid_state_of_matter is not a filler radical. It appeared in all 25 lines. The council added it as a counterpart to gas/liquid states but it turned out to be the universal structural glue. May warrant splitting into rigid_solid vs compliant_solid in a future revision — gaskets, seals, and mineral wool insulation are mechanically distinct from castings and extrusions, and Week 3 bioreactor / heat pump lines may expose boundary ambiguity.

---

*Decomposition performed manually against seed library. Zero LLM API costs. No production pipeline code touched. Fully sandboxed in radical/week-2/.*
