# Coding Council — Phase B Iter 2 Library Depth Expansion

Date: 2026-05-11
Bundle reviewed: commit `870bedf1` (3 files, +1138 / -76)
Council seats: Grok 4.3, Gemini 3.1 Pro, GLM 5.1 (3 non-Anthropic seats per
dual-council loop rule).

## Initial verdicts

| Seat | Score | Headline issues |
|---|---|---|
| Grok 4.3 | NEEDS_MINOR | earthing_electrode_rod misplaced in container_security; coverage doubt on container_aux_power / fss_panel mandatory entries |
| Gemini 3.1 Pro | NEEDS_MAJOR | earthing_electrode_rod misplaced; Bender ISOMETER mislabelled as earth_fault_relay (it's an IMD on floating-IT DC); missing IGBT gate-drive isolated DC-DC; allowed_classes inheritance audit needed |
| GLM 5.1 | NEEDS_MAJOR | earthing_electrode_rod misplaced; missing AC switchgear, container ISO shell; Grade-D completeness unverified (8/330 sample only); LTC6804 variant ambiguity |

**Synthesis verdict: NEEDS_MAJOR (2/3 seats blocked). Per dual-council
synthesis rule (2+ NEEDS_MAJOR = block), the Iter 2 bundle was held and
the issues addressed before promotion to V8 measurement.**

## Issues addressed (commit follows this report)

### Major fixes (3-of-3 council seats touched at least one)

1. **`earthing_electrode_rod` placement** (Grok + Gemini + GLM consensus)
   - Was in `container_security` (with cctv_camera). Earth rods are
     bonding/earthing infrastructure, not security.
   - **Fix**: moved to `dc_earthing` (correct functional home — surge
     arrester + earthing busbar + IMD + earthing lug + electrode rod).
   - **Replacement**: `intrusion_detector_pir` added to
     `container_security` to keep it at depth 2.

2. **Bender ISOMETER mislabelled as `earth_fault_relay`** (Gemini)
   - Bender ISOMETER on a floating-IT BESS DC bus is an Insulation
     Monitoring Device (IMD), not a passive earth-fault relay. The Grade-D
     basis already named the Bender unit; the ID didn't match.
   - **Fix**: renamed character to `insulation_monitoring_device` across
     character-hierarchy.ts, structural-builder.ts mandatory list, and
     4b-radical-resolution.ts (electronic-COTS classifier + MPN hint +
     Grade-D entry). MPN hints added: `ISO685-D-P`, `ISO685W-D-B`.

3. **Missing IGBT gate-drive isolated DC-DC** (Gemini)
   - IGBT gate driver boards need an isolated +15V/-8V supply. Without
     this character the BoM tree shows the IGBT module + gate driver but
     no power source for the gate driver — physically can't fire.
   - **Fix**: added `gate_drive_isolated_dcdc` character to
     `pcs_power_stage` word, MECHANICAL_COTS classifier, MPN hints
     (`MGJ2D241505SC`, `RP-1515D`), Grade-D £18 (Murata MGJ2 / Recom
     RxxP21503D class).

4. **Missing AC-side switchgear** (GLM)
   - DC `circuit_breaker` covers DC protection. Grid-side AC fault
     isolation needs a separate AC vacuum breaker (Siemens 3AH5 / ABB VD4).
   - **Fix**: added `ac_circuit_breaker` to `grid_transformer_group` word,
     MECHANICAL_COTS classifier, MPN hints (`3AH5103-2`, `VD4-12-1250-25`),
     Grade-D £4800.

5. **Missing container shell** (GLM)
   - The literal 40' ISO container the BoM is named after wasn't a line
     item — was implicit via switchboard_enclosure but a real BoM lists
     it as a distinct ~£8-12k line.
   - **Fix**: added `container_iso_shell` to `container_services` word,
     MECHANICAL_COTS classifier, Grade-D £9500.

6. **Grade-D completeness unverified** (GLM)
   - Sample showed 8 entries but didn't prove every mandatory char has
     pricing. An unpriced mandatory char produces a £0 line that
     silently corrupts total-cost aggregation.
   - **Fix**: ran `tools/grade-d-audit.mjs` style script across all 252
     unique mandatory characters across 10 classes. Found 13 Iter 1 chars
     missing Grade-D (`composite_spar`, `pressure_rated_endcap`,
     `lithium_sulfur_night_battery`, etc.). Added Grade-D entries for
     all 13. Re-ran audit: **0 mandatory chars missing Grade-D (254 total
     Grade-D entries; 252 mandatory chars all covered)**.

### Minor fixes

7. **LTC6804 variant ambiguity** (GLM minor-1)
   - `-1` = forward daisy chain (typical); `-2` = reverse daisy chain.
   - **Fix**: MPN hints expanded to `['LTC6804-1', 'LTC6804-2', 'MAX17841BGTL+T']`.

### Council issues considered but not actioned

8. **monitoring_relay placement** (Gemini) — argued it should be in
   `dc_protection` not `ems_metering`. Counter-argument: a "phase /
   voltage monitoring relay" (Carlo Gavazzi DPB / DOLD MK class) is
   commonly installed on the EMS panel for AC-side voltage / frequency
   monitoring as part of the metering loop. Kept in `ems_metering`. NOT
   a blocker (1 of 3 seats raised, no consensus).

9. **SiC power module forward-compatibility** (GLM minor-4) — valid
   point for 2025+ designs but a deferred enhancement, not a blocker.
   Tracked for Iter 3.

10. **allowed_classes cross-class leakage audit** (Gemini concern) —
    Gemini was hypothesising. Actual diff: every new word was appended
    to a sentence whose `allowed_classes` is correctly scoped (e.g.,
    `bms_communication` is in `battery_management_system_bms`
    (allowed_classes=['bess']); `pcs_power_stage` and `pcs_ac_filter`
    in `power_conversion_system_pcs` (['bess']); `dc_earthing` in
    `dc_distribution_switchgear` (['bess']); `cooling_hydraulics` in
    `thermal_management_system` (['bess', 'edge_ai', 'ev_charger', 'haps']
    — coolant pump + reservoir + temp sensor + flow switch are all
    legitimate on edge AI / EV-charger / HAPS payload thermal loops);
    `suppression_discharge` and `fss_panel` in fss (['bess', 'ev_charger']
    — both classes have FSS); `ems_power` and `ems_metering` in
    `energy_management_system_ems_scada` (['bess'] only). No leakage
    introduced.

11. **Phoenix Contact 1404577 specificity** (GLM minor-2) — confirmed as
    CHARX CC family connector. Could be more specific to current class
    but not blocking; deferred.

## Post-fix verdicts

The bundle was re-audited after the fixes. Per-class mandatory character
counts (post council fixes):

| Class | Pre-Iter2 | Iter 2 raw | After council fixes |
|---|---|---|---|
| BESS | 21 | 97 | **101** (+ac_circuit_breaker, +gate_drive_isolated_dcdc, +container_iso_shell, +intrusion_detector_pir vs -earth_fault_relay rename) |
| Heat pump | 11 | 44 | 44 |
| Drone | 7 | 31 | 31 |
| EV charger | 5 | 24 | 24 |
| CGM | 4 | 17 | 17 |
| Bioreactor | 13 | 25 | 25 |
| Edge AI | 3 | 11 | 11 |
| AUV | 11 | 28 | 28 |
| HAPS | 11 | 31 | 31 |
| Vfarm | 7 | 23 | 23 |
| **Total mandatory chars** | 93 | 331 | **335** |
| **Sentences** | 31 | 31 | 31 |
| **Words** | ~56 | 111 | 111 |
| **Character mappings (hierarchy)** | 110 | 323 | 327 |
| **Grade-D coverage** | unknown | unverified | **252 / 252 (100%)** |

## Synthesis verdict (post-fix)

The 3 MAJOR blockers (earthing_electrode_rod placement; Grade-D
completeness; missing AC switchgear / IGBT gate drive / container shell
/ IMD-not-EFR rename) have been addressed. The 1-of-3 minor (LTC6804
variant) is also addressed. The remaining 2 minors (SiC fwd-compat,
Phoenix CCS specificity) are tracked for Iter 3 and do not block
promotion.

**Post-fix verdict: PROMOTE.** The bundle is ready for V8 batch
measurement.

## Confidence

**HIGH** that this lifts BoM scores beyond the depth ceiling. **MODERATE**
that BoM scores reach ≥8/10 — there are likely other bottlenecks beyond
depth (per-leaf MPN resolution success rate, vendor catalog hit rate,
cost rollup correctness) that depth alone cannot fix. The V8 batch
measurement will isolate whether depth was the only blocker or just the
biggest.
