# e_fuel_synthesis — ForgeOS class design spec (OXCCU Power-to-Liquid SAF plant)

Built in worktree `oxccu-efuel`; council-gated; merged to main when the parallel CO₂ terminal is idle.

## 0. Approach
New engine class `e_fuel_synthesis` (PtL Fischer-Tropsch SAF plant), registered on the proven `co2_mineralisation` multi-unit chemical-plant pattern across the blocking layers (classifier · envelope · contract archetype · tool-plan · emitter) + gate-32 cost band + 5 new process tools. Mirror co2 gotchas: empty `macro_assembly_prices` (gate-10 B-3), `pressure-vessel:design` `mode:'internal'`, honest `class_anchor` provenance, deterministic emission of brief-mandated equipment, NO marine/irrigation tools (gate-34).

## 1. Brief anchor
OXCCU first-commercial PtL: single-step CO₂+H₂ → jet-range paraffins over an iron FT catalyst (iron does in-situ water-gas-shift → CO₂ hydrogenated directly, no separate reverse-WGS reactor). 1,000 t/yr SAF (~125 kg/h; ~3,425 L/day) + naphtha. H₂ ~90 kg/h; CO₂ ~450 kg/h. Reactor 200–350 °C, 20–30 bar. ≥85% carbon-to-liquids over recycle. ASTM D7566 A1 (FT-SPK). FOAK capex ≤ £28M.

## 2. Flowsheet → module decomposition (emitter; ≥1 part_number word per sub_module)
- M1 Feedstock receipt & conditioning — CO₂ receipt/dry/guard beds (S+O₂ removal), H₂ receipt/buffer, feed compression
- M2 Synthesis — feed preheat, FT reactor (Fe catalyst), exotherm steam recovery
- M3 Separation & recycle — hot/cold 3-phase separators, tail-gas compression + recycle, purge
- M4 Upgrading & fractionation — hydrocracker/isomerisation, fractionation column (SAF/naphtha/residue)
- M5 Utilities & offsites — steam, cooling water, N₂ inerting, instrument air, electrical/MV, flare/thermal oxidiser
- M6 Product storage & loading — SAF + naphtha tanks, additisation, tanker loading (EI 1530)
- M7 Control & safety — DCS + SIS, H₂/CO/HC gas detection, fire & gas, SIL ESD

## 3. Contract quantities (brief→contract→tools)
saf_output_tonnes_yr=1000; saf_output_kg_h=125; saf_output_lpd≈3425; h2_feed_kg_h=90; co2_feed_kg_h=450; h2_co2_molar_ratio≈3.0 (CO₂+3H₂→[-CH₂-]+2H₂O); reactor_temp_c=300; reactor_pressure_bar=25; per_pass_conversion≈0.40; carbon_to_liquids_frac=0.85; operating_hours_yr=8000; plant_capex_gbp_foak≤28e6; design_life_yr=20. Provenance: tool-derived where computed, else class_anchor:'engineering_estimate'.

## 4. Five new process tools (domain:'process', applicable_to e_fuel_synthesis)
**T1 gas:compressor-sizing** — multistage polytropic. in: mass_flow_kg_h, mol_weight, p_in_bar, p_out_bar, t_in_k, k_cp_cv, poly_eff=0.75, mech_eff=0.95. out: n_stages (per-stage ratio ≤3.5), shaft_power_kw, driver_power_kw, discharge_t_k, intercooler_duty_kw. W_stage=(Z·R·T_in/MW)(n/(n-1))[(P₂/P₁)^((n-1)/n)−1]·ṁ/η_poly, intercool to T_in. GPSA §13.

**T2 process:flash-separation** — 3-phase separator + vessel. in: vapour/liquid_hc/aqueous flows, rho_v/l/aq, p_bar, t_k, liq_residence_min=5. out: vessel_diameter_m, vessel_length_m, vapour_velocity_ms. Souders-Brown v_max=K√((ρL−ρV)/ρV), K=0.107 m/s w/ mesh; D from vapour Q; L from liquid+aqueous holdup; horizontal L/D 3–5. GPSA §7.

**T3 process:fired-heater** — preheat duty. in: mass_flow_kg_h, cp_kj_kgk, t_in_k, t_out_k, vaporise_frac=0, latent_kj_kg=0, mode='electric'|'fired', efficiency(elec 0.98/fired 0.88). out: process_duty_kw, input_duty_kw, radiant_area_m2. Q=ṁ(Cp·ΔT+vap·λ); input=Q/η; A=Q_rad/30 kW/m². API 560.

**T4 storage-tank:liquid-fuel** — API 650 atmospheric. in: daily_production_m3, days_storage=7, fill_fraction=0.9, product_density, max_tank_m3. out: tank_count, tank_diameter_m, tank_height_m, shell_mass_kg. V=daily·days/fill; 1-foot method t=4.9·D·(H−0.3)·G/(S·E)+CA, S=160 MPa, E=0.85, CA=3mm.

**T5 flare:thermal-oxidiser** — enclosed combustor for purge. in: purge_flow_kg_h, lhv_mj_kg, comb_temp_c=950, residence_s=0.75, excess_air_frac=0.2. out: heat_release_kw, chamber_volume_m3, combustion_air_kg_h, stack_diameter_m. Q=ṁ·LHV; air stoich+excess; chamber V from flue volumetric flow×residence at T; dia ≤0.2 Mach. API 521/537.

Fractionation: v1 = shortcut Fenske-Underwood-Gilliland (derived quantity) + pressure-vessel:design for column shell + ht for reboiler/condenser. Dedicated distillation tool = candidate follow-up.

## 5. Class-plan tool graph (e_fuel_synthesis:plant)
Reuse: reaction:stoichiometry-balance, reaction:feasibility-gibbs, reactor:cstr-pfr-sizing (mode internal), ht:ntu-heat-exchanger (×preheat/steam/cool), process:pump-sizing, pressure-vessel:design (mode:'internal', ×separators/column), lifecycle-co2:assessment, mass-aggregator:envelope-check, yield-economics:npv + universals (regulatory-cert-cost, supply-chain-risk, reliability-fmea, cybersecurity, transport-logistics). New: gas:compressor-sizing (×CO₂/H₂/recycle), process:flash-separation, process:fired-heater, storage-tank:liquid-fuel, flare:thermal-oxidiser. coupled_pairs:[reactor↔recycle], max_iterations 2, tol 5%. NO marine tools.

## 6. Cost
gate-32 CLASS_OUTPUT_BANDS: `e_fuel_synthesis {family:'throughput', low:8000, high:25000, per_unit_label:'£/(t·yr SAF)', aliases:[power_to_liquid,fischer_tropsch,ptl,saf,e_kerosene]}`. COST_STACK = ARCH_BESPOKE_ENGINEERED_PLANT (copy co2). price-bands/floors/hazards/standards/component bucket: add (fail-open but recommended).

## 7. Regression invariants (E_FUEL.*)
emitter ≥1 module + ≥1 part_number word/sub_module (gate-23); saf_output_tonnes_yr>0; h2_co2_molar_ratio∈[2,4]; plan contains NO marine/irrigation tool_ids; lock-gate HARD slots derivable.

## 8. Design-council verdict (Gemini 3.1 Pro · Grok 4.3 · MiMo-v2.5-pro) — "needs-fixes", revisions applied
- **HIGH (3/3): FT is exothermic** → dominant thermal duty is HEAT REMOVAL, not a fired heater. ADDED 6th tool `process:steam-generator` (reactor exotherm → MP steam + cooling area); fired-heater demoted to feed-preheat + catalyst-activation startup only.
- **HIGH (3/3): compressor real-gas Z** (H₂ Z≈1.05–1.10, CO₂ Z≈0.85–0.95; fixed-Z over-predicts ~12–18%) → `gas:compressor-sizing` uses Peng-Robinson mixture Z per stage.
- **HIGH (3/3): 3-phase separator** — K derated to ~0.07 at 20–30 bar, liquid residence 20 min (FT HC/water emulsion), size on liquid settling (Stokes) not vapour, NO mesh (wax fouling).
- **HIGH (mass balance):** carbon-to-liquids 85% → **65%**; feeds made consistent for 1,000 t/yr SAF: CO₂ ~1,000 kg/h, H₂ ~140 kg/h; H₂:CO₂ inlet 3.0 (iron WGS shifts internal effective ratio). Brief updated.
- **MED:** emitter adds FT product-water/oxygenate treatment, dedicated HP H₂ to hydrocracker (via compressor tool), iron-catalyst reduction/activation (electric startup heater). Cost band widened for FOAK micro-scale → **£12,000–60,000/(t·yr SAF)** (Gemini £18k, Grok £38k, MiMo £40–80k). Storage 7→14 days.
- **ACCEPTED:** fractionation FUG shortcut OK for v1 (document ±30%; rigorous pseudo-component distillation tool = follow-up). Flare/oxidiser 950→1000 °C, residence 1.0 s for CO destruction.
- **Net: 6 new tools** (added steam-generator). Approach SOUND; mirror co2_mineralisation.
