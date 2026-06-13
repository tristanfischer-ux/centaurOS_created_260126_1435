# aquaculture_ras wiring tracker (yellowtail kingfish RAS)

Goal: chain exits 0 + writes out/ras-wire-test/chain-v2.pdf for briefs-rerun/yellowtail-kingfish-ras.md.
Template: e_fuel_synthesis + co2_mineralisation (process-plant family).

## Sizing basis (scale off 204 t/yr reference; £5M ceiling → design-to-budget ~125 t/yr)
- Reference full unit: 204 t/yr, 3,340 m³ tank vol, £8.15M equip (£40k/annual-t).
- standing_biomass = tank_vol × 60 kg/m³ ; daily_feed ≈ 1.35% biomass ; TAN ≈ 4% feed ;
  O2 ≈ 0.5 kg/kg feed ; solids ≈ 60% feed ; recirc = 4 turnovers/h × tank_vol ;
  biofilter media = TAN ÷ 0.35 kg/m³/d ; heating = makeup(0.4% recirc) 10→26.4°C + building loss (DOMINANT).
- Primary brief var: annual_production_t_yr. Default 204 t/yr. scale = t_yr / 204.

## Layers (study bioreactor + co2 + e_fuel)
1. [ ] ENVELOPE — envelope.ts: CLASS_ALIASES + scale-tier fn + DETECTOR
2. [ ] CONTRACT — engineering-contract.ts: ARCHETYPE_ALIASES + registerArchetype builder (writes all extensive qtys)
3. [ ] LOCK-GATE — engineering-lock-gate.ts: HARD_REQUIRED_SLOTS[aquaculture_ras]
4. [ ] CLASS PLAN — class-plans/aquaculture-ras.ts (NEW) — tools size off contract reads
5. [ ] EMITTER — emitters/aquaculture-ras.ts (NEW) + register-all.ts imports
6. [ ] VERIFY — exit 0 + PDF + cost ~£8.15M/204t + audit-sizing-scale.ts clean

## Iteration log
(append each run: layer surfaced + fix)
