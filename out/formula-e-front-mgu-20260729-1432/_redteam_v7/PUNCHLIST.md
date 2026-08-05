# FE Front polish — adversarial punchlist v7

_Generated 2026-08-05T11:53:58.464005+00:00Z · seats: ['grok43', 'opus5', 'grok45', 'glm52', 'sol']_

## Verdicts

- **grok43**: `REJECT` confidence=95
- **opus5**: `None` confidence=None
- **grok45**: `REJECT` confidence=97
- **glm52**: `REJECT` confidence=92
- **sol**: `REJECT` confidence=99

## Counts: {'FATAL': 15, 'HIGH': 23, 'MED': 13} · triage {'FIX_PHYSICS_HONESTY': 18, 'FIX_BLENDER': 6, 'GAP': 14, 'REVIEW': 2, 'FIX_EXCEL': 7, 'FIX_INVERTER': 4}

## Findings (triaged)

### [FATAL] F3 — FIX_BLENDER (grok45)
- **Area:** PROCESS_COHERENCE
- **Claim:** One geometry spine — same millimetres across EM / gears / cooling / CAD / Blender
- **Evidence:** Catalogue stator stack_length 98.33 mm and airgap Ø122.91 mm vs S-EM-TRUTH stack_mm=130.0; R-BAY-FIT value 'Housing Ø—×L— mm; rotor ID — / OD — mm' (blank); gear nest ID 105.9 mm fight with EM annulus; quantities_seed gear_ratio=8 vs writeback_invalidated=True / OPT-C_EXTERNAL_PLANETARY hypothesis.
- **Fix:** Single quantities master with SHA; every artefact must cite identical stack, bore, ratio, rpm or fail CI.

### [FATAL] F4 — FIX_EXCEL (glm52)
- **Area:** GEAR_OIL
- **Claim:** Gear oil jet pressure ΔP_jet=1677.835 kPa (16.8 bar) is physically implausible for an integrated gear-lubrication system
- **Evidence:** R-GEAR-OIL: 'jet=16.8575 L/min; ΔP_jet=1677.835 kPa'. 16.8 bar to push 16.9 L/min through a jet implies either a sub-millimetre orifice (unmanufacturable) or a units error (Pa vs kPa vs bar). No pump in a Formula E cassette can sustain 17 bar at 17 L/min within the 32 kg mass budget.
- **Fix:** Audit the orifice equation and units. If ΔP is in Pa, restate as 1.678 kPa (plausible). If truly 1678 kPa, the jet geometry is infeasible and the cooling/lubrication architecture must change.

### [FATAL] F5 — FIX_EXCEL (glm52)
- **Area:** GEAR_OIL
- **Claim:** cornering_ok=False is buried in R-GEAR-OIL without being escalated as an architecture blocker
- **Evidence:** R-GEAR-OIL value: 'cornering_ok=False'. Yet architecture_blockers_open=[] (empty). A cornering oil-starvation failure in a Formula E front MGU is a race-ending fault. It is not a footnote.
- **Fix:** Add cornering_ok=False to architecture_blockers_open. Require a dry-sump/scavenge solution or validated oil-level simulation under lateral acceleration before any screen can pass.

### [FATAL] F6 — FIX_INVERTER (glm52)
- **Area:** THERMAL_PROCESS
- **Claim:** Winding temperature 67.077°C and module temperature 71.03°C at 250 kW continuous are fantasy — no motor loss split is presented
- **Evidence:** R-COOL-NET: 'T_winding=67.077°C; T_module=71.03°C; coupled_ok=True' with coolant at 60°C. ΔT_winding=7°C for a 250 kW machine is physically absurd without stating copper loss, iron loss, and magnet loss. inverter_dissipated_kw=4.318 is the only loss stated. Motor I²R and core losses are absent from the digest. The cooling network cannot be validated without the loss split.
- **Fix:** Publish the full loss budget: copper, iron, magnet, friction, windage, inverter. Re-run the thermal network with those losses. If T_winding is still 67°C, show the Rth network and justify it. Otherwise mark T_winding as UNVERIFIED.

### [FATAL] F1 — FIX_PHYSICS_HONESTY (grok43)
- **Area:** None
- **Claim:** EM torque mismatch vs first-principles shaft torque at 250 kW / 19500 rpm
- **Evidence:** claimed 207 Nm vs required 125 Nm / ideal 122 Nm; mean rotor torque only 118.75 Nm
- **Fix:** recalculate and publish consistent torque/speed/power numbers or reduce power claim

### [FATAL] F1 — FIX_PHYSICS_HONESTY (grok45)
- **Area:** EM_ARITHMETIC
- **Claim:** Required / loaded / mean torques are identity-locked to 250 kW via T=P/ω at a single frozen rpm
- **Evidence:** independent_arithmetic: 250 kW @ 24000 rpm → T_shaft_ideal=99.472 Nm (η=0.95→94.5 Nm). Twin concurrently cites required_shaft_torque_nm=125.214912, architecture_duty=104.098914, Path-B mean=122.099939, twin-bound mean=81.558 / loaded=78.431, email peak≈207 Nm @ 19500 rpm. duty_torque_screen_ok=false; torque_reliable=false.
- **Fix:** Freeze one (P, rpm, η_chain) tuple; recompute T_req=P/ω once; delete every competing 'required' and marketing peak; re-run FEMM duty screen against that single number.

### [FATAL] F2 — FIX_PHYSICS_HONESTY (grok45)
- **Area:** ARCHITECTURE_BLOCKERS
- **Claim:** Concentric planetary-in-rotor architecture is a viable kit
- **Evidence:** architectureBlockers OPEN count=2: PLANETARY_STRENGTH_VS_ROTOR_BORE (minimum_strength_factor=0.1727 / best nest FoS≈1.005<1.2, cannot_greenwash=true) and EM_TORQUE_VS_ROTOR_BORE (torque_vs_required_ratio=0.626, duty_torque_screen_ok=false). ship_ok forced false.
- **Fix:** Human architecture decision: enlarge bore + re-balance EM, change tooth counts, or externalise planetary. Do not resubmit concentric nest as PASS.

### [FATAL] F2 — FIX_PHYSICS_HONESTY (glm52)
- **Area:** PROCESS_COHERENCE
- **Claim:** Two copies of R-EM-DUTY exist with different content — the motor_multiphysics_slice copy OMITS torque_reliable=False and the mean torque, presenting only the favourable peak
- **Evidence:** motor_multiphysics_slice.results_under_assumptions[1].value = 'Loaded FE torque 207.1240684259415 N·m vs required 125.214912 N·m; duty_torque_screen_ok=True' (no mean, no torque_reliable). assumption_based_design.results_under_assumptions[1].value = same + 'position-sweep mean 118.748057 N·m; torque_reliable=False'. The suppressed copy is the one a reviewer would see first.
- **Fix:** Single source of truth for every result row. Eliminate duplicate result objects. If a result has an unfavourable flag, it must appear in ALL copies.

### [FATAL] F3 — FIX_PHYSICS_HONESTY (glm52)
- **Area:** EM_ARITHMETIC
- **Claim:** Required torque 125.214912 N·m does not reconcile with T=P/ω at the stated 250 kW / 19500 rpm
- **Evidence:** independent_arithmetic: omega=2042.0352 rad/s → T_ideal=122.427 N·m. But R-EM-DUTY claims 'required 125.214912 N·m'. 250000/125.215=1996.6 rad/s=19066 rpm ≠ 19500. The 'required' torque was computed at a different speed than the frozen A-SPEED assumption. Identity lock broken.
- **Fix:** Recompute required torque at exactly 19500 rpm (2042.04 rad/s) → 122.43 N·m. Propagate consistently. If 125.21 is correct, the speed assumption must change and all downstream gear/structural screens must re-run.

### [FATAL] F2 — FIX_PHYSICS_HONESTY (sol)
- **Area:** Architecture closure: EM versus planetary geometry
- **Claim:** The selected concentric motor/planetary architecture has failed both its torque and planetary-strength closures. There is no viable release geometry.
- **Evidence:** architectureBlockers contains two OPEN architecture holds with ship_ok=false and cannot_greenwash=true. PLANETARY_STRENGTH_VS_ROTOR_BORE reports best in-bore planetary FoS approximately 1.005, below 1.2, with minimum_strength_factor=0.1727. EM_TORQUE_VS_ROTOR_BORE reports duty_torque_screen_ok=false, torque_reliable=false, mean torque=81.558 N·m, loaded torque=78.431 N·m and required torque=125.215 N·m. The pack simultaneously says the planetary must grow the bore and that the enlarged bore destroys magnet volume and torque.
- **Fix:** Make an architecture decision before issuing another integrated pack: external planetary, changed tooth counts/module/ratio split, or a larger motor annulus and package. Write the selected geometry back to one CAD/solver source, then rerun FEMM torque map, demagnetisation, rotor stress, ISO 6336, oil system, cooling, bearings and packaging. No conditional wording substitutes for a closed architecture.

### [FATAL] F4 — GAP (grok45)
- **Area:** GREENWASH_MULTIPHYSICS_OK
- **Claim:** max_outcome multiphysics_ok=true / Bar B list filled implies technical readiness
- **Evidence:** polish_round.max_outcome_status.multiphysics_ok=true while architecture_blockers_open_count=2, all required_checks PARTIAL, duty_torque_screen_ok=false, bar_b verdict=BAR_B_LIST_FILLED_UNDER_ASSUMPTIONS_NOT_HOMOLOGATED, rows_blocking_ship_ok=10, fia_race_ready=false.
- **Fix:** multiphysics_ok must NAND open architecture blockers and failed duty screens. Rename flag to screens_executed_not_cleared.

### [FATAL] F1 — GAP (glm52)
- **Area:** EM_ARITHMETIC
- **Claim:** duty_torque_screen_ok=True despite mean torque 118.75 N·m being BELOW required 125.21 N·m
- **Evidence:** R-EM-DUTY (assumption_based_design copy): 'Required at n_max≈T=P/ω 125.214912 N·m; FEMM peak 207.1240684259415 N·m; position-sweep mean 118.748057 N·m; torque_reliable=False; duty_torque_screen_ok=True'. Mean < required → screen should be FAIL. independent_arithmetic confirms t_shaft_ideal=122.427 N·m, t_shaft_eta0.95=116.306 N·m — both below the 125.21 'required' and below the 207 peak. Passing on PEAK while mean fails is greenwash.
- **Fix:** Set duty_torque_screen_ok=False. Re-run with mean torque ≥ required or de-rate power claim. Report torque_reliable=False as a blocker, not a footnote.

### [FATAL] F1 — GAP (sol)
- **Area:** EM arithmetic and duty identity
- **Claim:** The electrical-power, speed, required-torque, architecture-duty and FEMM acceptance quantities are not identity-locked. The pack uses mutually incompatible torque requirements while claiming one 250 kW / 24,000 rpm duty.
- **Evidence:** independent_arithmetic gives 250 kW at 24,000 rpm: omega=2513.2741 rad/s, ideal shaft torque=99.472 N·m and 95%-efficient shaft torque=94.498 N·m. In contrast, motor_multiphysics_slice uses required_shaft_torque_nm=125.214912 N·m, R-EM-DUTY calls 104.098914 N·m 'Required at n_max', S-EM-TRUTH calls 125.214912 N·m the binding duty at 24,000 rpm, and the email says 250 kW at 19,500 rpm requires approximately 122–125 N·m. At 24,000 rpm, 104.10 N·m is 261.6 kW and 125.21 N·m is 314.7 kW; neither is 250 kW. The digest itself explicitly instructs that mismatch against T=P/omega is FATAL.
- **Fix:** Create one revision-controlled duty-point table with electrical input power, shaft output power, inverter efficiency, motor efficiency, speed, torque, direction, duty duration and exact geometry revision. Derive every torque in FEMM, thermal, gear, mount, dyno request, Excel and partner material from that table by live formulas. Retire every contradictory EM artefact and rerun FEMM, ISO 6336, thermal and structure against the corrected binding point.

### [FATAL] F3 — GAP (sol)
- **Area:** Thermal duty, loss accounting and temperature closure
- **Claim:** The thermal chain does not demonstrate a consistent continuous 250 kW case. It mixes incompatible loss and temperature results while a stated continuous magnet condition exceeds its limit.
- **Evidence:** R-COOL-NET claims total_loss=12,533.59 W, motor_loss=8,215.59 W, Cu=2,180.49 W and inverter=4,318 W with winding=82.892 °C and module=77.61 °C. S-IRON-LOSS separately states lamination_mid=6,035.1 W, a 3.9–8.5 kW band and DEC009 stamp=11,732.5 W, without a reconciled motor-loss ledger. S-DUTY-LAP states magnet_temp_continuous_screen_c=159.35 while the permanent-magnet requirement limit is 150 °C. required_checks.water_jacket reports 99.4 °C winding and 20.1613 kPa, while R-COOL-NET reports 82.892 °C and 45.0826 kPa; inverter cold-plate reports 117.411 °C and 24.9212 kPa while the network reports module 77.61 °C. The digest provides no common load case, loss split, flow topology or reconciliation.
- **Fix:** Publish a single loss ledger by operating point: copper AC/DC, iron by region, magnet eddy, mechanical/windage, gear churning, inverter conduction and switching. Tie it to a measured or explicitly bounded duty cycle and to one coolant topology. Reconcile OpenFOAM component Δp with the network 45.0826 kPa at 12 L/min, then demonstrate winding, magnet, module junction/case and oil temperatures below actual component limits. Continuous operation is failed until the 159.35 °C magnet result is removed by redesign or duty restriction.

### [FATAL] F5 — REVIEW (grok45)
- **Area:** GEAR_OIL_CORNERING
- **Claim:** Gear oil system cornering-safe
- **Evidence:** R-GEAR-OIL results_under_assumptions: cornering_ok=False; jet ΔP=271–284 kPa. required_checks.gear_oil.cornering_pickup_ok=true and twin_bound cornering_pickup_ok=true — direct contradiction on the same twin.
- **Fix:** Single gear_oil truth object; cornering_ok=False blocks any CLEARED/OK narrative until pickup geometry redesigned and re-screened.

### [HIGH] H6 — FIX_BLENDER (grok45)
- **Area:** BLENDER_MORPHOLOGY
- **Claim:** Cycle-3 Blender is physics-linked race-kit morphology suitable for design review of inverter/DC-link
- **Evidence:** visual_exam_notes: SiC/DC-link region schematic coloured prisms/blocks — NOT film-cap bank or module packages; exterior glossy closed black pod; exploded R/Y/B bars without DC-link morphology; status=provisional_visualisation_uplift; explicitly_not_claimed SiC MPN and ICD XYZ.
- **Fix:** Either model real module+film bank envelopes from supplier STEP or banner every still 'CLAY / SCHEMATIC — NOT BOM AUTHENTIC'.

### [HIGH] H3 — FIX_EXCEL (grok45)
- **Area:** EXCEL_TRACEABILITY
- **Claim:** Dossier power/thermal are LIVE formula-traced
- **Evidence:** prior_council_formula_coverage Calculations=21.5%, Brief=8.9%, Engineering Analysis=11.4%; tab_scorecard fail_tabs includes Calculations, Brief, Verification, Executive Summary (min_score=0); known_excel_risk: power/torque as literals.
- **Fix:** Every P, T=P/ω, loss, Δp cell must be formula-linked to quantities_seed; bare literals = automatic FAIL.

### [HIGH] H1 — FIX_EXCEL (glm52)
- **Area:** GEARS
- **Claim:** Bevel differential FoS=1.2172 is screening theatre — below any credible race safety factor
- **Evidence:** R-BEVEL-DIFF: 'min_strength_FoS=1.2172; contact_FoS=1.2172; duty_strength_screen_ok=True'. A 1.22 FoS on a bevel diff in a Formula E front regen path (shock loading, curb strikes, torque reversal) is marginal even for screening. Passing it as 'ok=True' without a target FoS statement is misleading.
- **Fix:** State the target FoS for each gear set (e.g., ≥1.5 for screening, ≥2.0 for race). If 1.22 is below target, mark screen as FAIL or MARGINAL. Do not use 'ok=True' without a threshold.

### [HIGH] H4 — FIX_EXCEL (glm52)
- **Area:** EXCEL_TRACEABILITY
- **Claim:** Excel formula coverage is 21.5% for Calculations — the majority of power/thermal cells are pasted literals, not LIVE formulas
- **Evidence:** excel_notes.prior_council_formula_coverage_pct_sample.Calculations=21.5. require_check: 'FPK power/thermal LIVE trace must exist; bare literals FAIL'. The jack_fill_in_xlsx is 14066 bytes with 4 sheets but no evidence of live formula chains from T=P/ω through to thermal network.
- **Fix:** Rebuild the Calculations sheet with LIVE formulas: P, rpm, omega, T_required, T_peak, T_mean, loss_split, Rth_network, T_winding, T_module. Every cell must trace to a named assumption or a physics equation. No pasted literals for power or thermal.

### [HIGH] H6 — FIX_EXCEL (sol)
- **Area:** Excel traceability
- **Claim:** There is no evidence that the Excel dossier contains live, traceable power and thermal calculations. Historical formula coverage is unacceptable for an engineering decision pack.
- **Evidence:** The digest expressly requires 'FPK power/thermal LIVE trace must exist; bare literals FAIL'. The only disclosed formula coverage sample is Calculations=21.5%, Brief=8.9% and Engineering Analysis=11.4%. polish_round.tab_scorecard_summary reports all_pass=false, nine fail tabs including Calculations, Brief, Verification and Checks, with Executive Summary score 0. The current workbook is merely reported present with expected sheet names; no formula audit, precedents, data links or recalculation evidence is supplied.
- **Fix:** Fail the workbook until an automated current-file audit proves every governing power, torque, loss, temperature, pressure-drop, mass and release status cell is formula-linked to revision-controlled inputs or imported solver data. Include formula maps, named ranges, source hashes, recalculation timestamp and error-cell gates. Remove pasted engineering literals from decision tabs.

### [HIGH] H7 — FIX_INVERTER (grok45)
- **Area:** MASS_BUDGET
- **Claim:** Dry mass aspiration 32 kg is design-consistent
- **Evidence:** fia_duty.mass_cap_kg=32; A-BAY ~32 kg dry; inverter_packaging mass_inverter_kg=8.2 alone; no CAD roll-up, no BOM mass sum, R-CAD release_authority_coverage=0.0.
- **Fix:** Parametric mass roll-up from CAD/BOM vs 32 kg cap; gap list or drop the aspiration claim.

### [HIGH] H3 — FIX_INVERTER (glm52)
- **Area:** MASS
- **Claim:** 32 kg dry mass is an aspiration with no CAD roll-up or BOM mass sum
- **Evidence:** A-BAY: '343×259×267 mm; ~32 kg dry' as FROZEN_ASSUMPTION. R-BAY-FIT reports housing dimensions but no mass. R-CAD: 'parametric_family_count=11; release_authority_coverage=0.0'. No mass roll-up artefact exists in motor_stack_json_artefacts.
- **Fix:** Produce a mass roll-up from the parametric CAD: housing, stator iron, copper, rotor, magnets, gears, bearings, inverter modules, coolant. Compare to 32 kg. If it exceeds 32 kg, update the assumption.

### [HIGH] H1 — FIX_PHYSICS_HONESTY (grok43)
- **Area:** None
- **Claim:** Bar B list filled under assumptions, not homologated
- **Evidence:** explicit bar_b_verdict and ship_ok=false
- **Fix:** complete homologation or clearly label as non-release

### [HIGH] H1 — FIX_PHYSICS_HONESTY (grok45)
- **Area:** THERMAL_PROCESS
- **Claim:** Coupled cooling network proves continuous 250 kW thermal feasibility (T_winding≈83–99°C, T_module≈78°C)
- **Evidence:** R-COOL-NET: motor_loss=8215 W + inv=4318 W; S-IRON-LOSS lamination_mid_w=6035 vs dec009_stamp_w=11732.5 (nearly 2×); continuous magnet screen 159.35°C vs intermittent 99.4°C; OpenFOAM jacket/cold-plate only Δp (20–25 kPa) not CHT; network Δp seed 45 kPa. Fantasy-smooth temps on unresolved iron loss.
- **Fix:** Lock one iron-loss basis; run loss→network→OF with unit-checked chain; stop quoting intermittent vignette temps as continuous capability.

### [HIGH] H2 — FIX_PHYSICS_HONESTY (grok45)
- **Area:** STRUCTURE_DYNAMICS
- **Claim:** CalculiX FoS≈2.635 / pocket FoS and Ross sweep are rotor retention proof
- **Evidence:** BARB-ROTOR-RETENTION assumed_value admits screens are not instrumented overspeed; S-ROTOR-FOS release_fos_closed=False; screening at 19500 rpm vs contract 24000 rpm; Ross baseline_first_critical_rpm=22922 < 24000 (margin 0.955, clear_subcritical_1p2=false until k_factor≥2); multiphysics_r4 honest_limits: quarter-ring, not laminate/pocket, not release FoS.
- **Fix:** Label all FEA as screening only; require BARB overspeed CSV; do not cite FoS as DEC-006 closed.

### [HIGH] H4 — FIX_PHYSICS_HONESTY (grok45)
- **Area:** EM_EMAIL_OVERCLAIM
- **Claim:** Loaded FEMM peak ≈207 Nm supports duty
- **Evidence:** jack_email_excerpt: peak≈207 Nm; current twin-bound loaded=78.43 Nm, Path-B peak≈118.87, mean sweep max ratio 0.78. 207 Nm is orphaned from independent_arithmetic and current FEMM artefacts.
- **Fix:** Scrub 207 Nm from all partner surfaces; quote only hash-locked EM JSON.

### [HIGH] H2 — FIX_PHYSICS_HONESTY (glm52)
- **Area:** STRUCTURE_DYNAMICS
- **Claim:** CalculiX centrifugal screens are presented as retention evidence but are not instrumented overspeed proof
- **Evidence:** BARB-ROTOR-RETENTION: 'CalculiX centrifugal + magnet-pocket screens as retention seed (not instrumented overspeed)'. R-STRUCT-ROTOR FoS=3.442 and R-STRUCT-POCKET FoS=2.414 are screening-only. The email says 'FEA' which implies validated structural proof. The Ross critical-speed artefact (ross_fia_front_kit_case.json) is listed but its results are NOT reported anywhere in the digest.
- **Fix:** Explicitly label all CalculiX results as 'SCREENING — NOT RETENTION PROOF'. Report the Ross critical-speed result. If Ross shows critical speed below overspeed, flag as blocker.

### [HIGH] H5 — FIX_PHYSICS_HONESTY (glm52)
- **Area:** THERMAL_PROCESS
- **Claim:** OpenFOAM Δp=42.6976 kPa is reported but the OpenFOAM case results are not cross-checked against the analytical cooling network
- **Evidence:** R-COOL-NET cites 'analytical_fia_cooling_network_screen.json' for Δp=42.6976 kPa. BARB-FLOW-BENCH evidence lists 'openfoam_fia_water_jacket_case.json' and 'openfoam_fia_cold_plate_case.json' but no OpenFOAM Δp value is reported in any result row. The 42.7 kPa may be analytical-only, not CFD-validated.
- **Fix:** Report the OpenFOAM Δp for water jacket and cold plate separately. Compare to the analytical 42.7 kPa. If they disagree by >15%, flag the analytical network as unvalidated.

### [HIGH] H6 — FIX_PHYSICS_HONESTY (glm52)
- **Area:** ROSS_DYNAMICS
- **Claim:** ross_fia_front_kit_case.json exists in the artefact list but no Ross result is reported in any result row or Bar B row
- **Evidence:** motor_stack_json_artefacts includes 'ross_fia_front_kit_case.json'. No result_under_assumptions row references Ross. No Bar B row references Ross. The critical-speed / rotordynamics screen was run but its output is suppressed.
- **Fix:** Add a R-ROSS result row reporting critical speed, mode shapes, and separation margin from 19500 rpm. If critical speed < 1.2× overspeed, flag as architecture blocker.

### [HIGH] H1 — FIX_PHYSICS_HONESTY (sol)
- **Area:** Gear strength and lubrication
- **Claim:** ISO 6336 and oil closure are being selectively presented. A marginal bevel screen and contradictory oil pickup status do not establish a transmission.
- **Evidence:** R-GEAR-PLANET says duty_strength_screen_ok=false. The architecture blocker gives planetary FoS about 1.005. R-BEVEL-DIFF reports only 1.2172 contact FoS, effectively the arbitrary 1.2 floor with no manufacturing, load-spectrum, lubrication, temperature or tolerance margin. R-GEAR-OIL says cornering_ok=false and churning=1,202.17 W, whereas required_checks.gear_oil says cornering_pickup_ok=true. These are contradictory conclusions for the same claimed kit.
- **Fix:** Freeze torque and ratio, define the gear layout, load spectrum, material, heat treatment, quality grade, duty and oil temperature. Reconcile pickup/cornering analysis with a physical sump geometry and acceleration vector set. Rerun ISO 6336 including manufacturing and duty factors; demonstrate pump capacity after 271–284 kPa jet demand, churning heat and hot-oil viscosity are included.

### [HIGH] H2 — FIX_PHYSICS_HONESTY (sol)
- **Area:** Rotor structure and rotor dynamics
- **Claim:** Screening FEA and a bearing-stiffness sensitivity are being used adjacent to retention language despite not proving retention or dynamics.
- **Evidence:** BARB-ROTOR-RETENTION admits the CalculiX evidence is not instrumented overspeed and inconsistently refers to screen speed=19,500 rpm despite the contract maximum being 24,000 rpm. R-STRUCT-ROTOR presents FoS=2.635, but multiphysics_r4_dense at 24,000 rpm reports 240.657 MPa against assumed 355 MPa yield, equivalent to only about 1.48 yield ratio, and explicitly says it is a quarter-ring continuum, maps stator FEMM temperatures onto the rotor as a proxy, is not coupled thermal-displacement and is not release FoS. Ross baseline first critical is 22,922 rpm, below 24,000 rpm, and only a 2x assumed bearing stiffness clears the required 1.2 subcritical factor.
- **Fix:** Stop calling either result retention evidence. Produce a release model with actual rotor laminations, magnet pockets, bridges, sleeve/retention system, thermal field, shrink/interference, material allowables and overspeed requirement. Freeze bearing part numbers, fits, preload, housing stiffness and support conditions; then perform Campbell/unbalance/stability analysis and instrumented overspeed testing above approved overspeed.

### [HIGH] H5 — GAP (grok45)
- **Area:** GEAR_STRENGTH_THEATRE
- **Claim:** ISO 6336 / bevel FoS≈1.2 is strength clearance
- **Evidence:** Planetary duty_strength_screen_ok=False; nest FoS≈1.005; bevel min_strength_FoS=1.2172 duty_strength_screen_ok=True at knife-edge; R-POST-DIFF blocker=CLEARED FoS≥1.2005 — screening theatre at 1.2 floor while main reduction is architecture_hold.
- **Fix:** Raise acceptance to program FoS policy; planetary must clear before any post-diff CLEARED language.

### [HIGH] H3 — GAP (sol)
- **Area:** Process coherence and geometry identity
- **Claim:** The asserted 'one geometry spine' is not demonstrated; the evidence instead contains geometry and state contradictions.
- **Evidence:** The partner email claims EM, gears, cooling and Blender share 'the same millimetres', but R-BAY-FIT contains blank values for housing and rotor dimensions: 'Housing Ø—×L— mm; rotor ID — / OD — mm'. The electromagnetic artefacts span baseline, DEC009, PATH_B, REBALANCED and replay variants. The gearbox assumption says writeback_invalidated=True and working topology hypothesis=OPT-C_EXTERNAL_PLANETARY, while the visual concept remains a concentric in-rotor planetary story. Cooling Δp and temperature values conflict across required_checks and R-COOL-NET. No common geometry_revision, result_ref and input_hash chain is provided for every domain.
- **Fix:** Require a machine-verifiable release manifest: geometry revision/hash, duty-table hash, materials/BOM revision and solver input hash for each FEMM, ISO, CalculiX, Ross, OpenFOAM, CAD, Blender and Excel result. Reject any artefact lacking this tuple. Remove Blender and email claims of shared millimetres until the manifest proves them.

### [HIGH] H4 — GAP (sol)
- **Area:** Bar B readiness and greenwash controls
- **Claim:** The pack correctly retains ship_ok=false, but uses misleading completion language that can be mistaken for technical readiness.
- **Evidence:** Bar B verdict is 'BAR_B_LIST_FILLED_UNDER_ASSUMPTIONS_NOT_HOMOLOGATED' while all 10 rows block ship_ok, five require hardware and two require partner inputs. polish_round.max_outcome_status nevertheless says multiphysics_ok=true and blender_cycle3_ok=true. R-POST-DIFF says blocker=CLEARED, and inverter packaging says packaging_screen_ok=true, although global architecture blockers, supplier identities, HIL, dyno, interface coordinates and hardware correlation remain open. This is checklist completion, not Bar B completion.
- **Fix:** Remove 'filled', 'ok', 'cleared', 'works in kit context' and similar status labels from executive-facing outputs unless they identify scope and release gate. Replace them with a hard gate dashboard: architecture failed, arithmetic failed, thermal continuous duty failed, hardware evidence absent, interfaces absent and release prohibited.

### [HIGH] H5 — GAP (sol)
- **Area:** PCB, Gerber and firmware/HIL controls
- **Claim:** The PCB process remains prototype-only and cannot support inverter functional or safety claims.
- **Evidence:** pcb states supplierGerbers=false, hilPresent=false and forgeDraftOnly=true. The grade card labels the work B+ only for draft-review readiness, calls the fabrication axis PROTOTYPE_PACKAGE, retains NOT_FABRICATION_READY=true and requires the banner 'NOT SUPPLIER-RELEASED — NOT HIL-PROVEN — UNPROVEN IN HARDWARE'. Exact automotive MCU/CAN/gate-driver MPNs remain open. BARB-HIL says firmware is FAB-READY_UNPROVEN_IN_HARDWARE and explicitly has no HIL log.
- **Fix:** Do not issue prototype Gerbers as a vehicle inverter design. Freeze SiC module, gate-driver, isolation, current-sensor, connector, capacitor and MCU identities; complete independent DFM, creepage/clearance, insulation coordination, EMC and thermal review. Then fabricate revision-locked boards, run double-pulse, populated HIL and fault-trip verification with raw traces.

### [HIGH] H7 — GAP (sol)
- **Area:** Interfaces and mass
- **Claim:** The package has neither chassis interfaces nor a credible mass closure.
- **Evidence:** interfaceIcd is null. BARB-ICD-XYZ states TYPES_ONLY_XYZ_OPEN and explicitly says no millimetres are held for HV, coolant, LV/CAN, halfshafts or four mounts. A-IFACE admits provisional bay-local XYZ are not a chassis ICD. A-BAY defines '~32 kg dry' as an aspiration to be replaced by a weighed BOM, while no CAD mass roll-up, material allocation, CG, inertia or weighed BOM is provided. Yet Blender exterior geometry and packaging statements present a physically located cassette.
- **Fix:** Obtain a revision-controlled chassis ICD with datums, tolerances and mating parts before making interface or packaging claims. Produce a CAD mass-properties report, BOM mass roll-up, fluid/oil mass, fasteners, harnesses and tolerances against the 32 kg cap; publish CG and inertias. Any provisional visual port must carry an unavoidable non-interface watermark.

### [HIGH] H8 — GAP (sol)
- **Area:** Assumption-to-ask governance
- **Claim:** The assumption register has asks but lacks demonstrated change-control protection and reuses decision identifiers for unrelated matters.
- **Evidence:** The fill-in workbook is present, but no evidence shows protected cells, validation, import review, signatures, authority, change-request workflow, automatic invalidation or rerun enforcement after Jack modifies inputs. BARB-HIL explicitly notes DEC-008 is also used for A-DUTY intermittent freeze. BARB-GERBERS explicitly notes DEC-009 is also used for the 24 krpm/130 mm EM freeze. This identifier collision permits ambiguous closure and audit failure.
- **Fix:** Replace the workbook with a controlled input package: unique immutable IDs, input owner, authority, units, range validation, revision/signature, change-impact matrix and mandatory solver rerun gates. Split all duplicated DEC IDs. A partner response must create a proposed change, not overwrite an assumption or close a release gate.

### [HIGH] H9 — GAP (sol)
- **Area:** Blender morphology and visual truthfulness
- **Claim:** The visual pack is morphology, not a mechanically credible representation of the selected hardware, and cannot be presented as solver-linked product geometry.
- **Evidence:** The render proof establishes mesh presence and morphology prefixes, not dimensional or CAD identity. The cycle-3 morphology explicitly does not claim partner connector XYZ, partner STEP, released gear teeth, SiC MPN or supplier Gerbers. The independent visual examination found the SiC/DC-link region to be schematic coloured prisms/blocks, not identifiable film capacitors or module packages; the exterior is a glossy black pod with weak FE authenticity; the exploded view has no distinct DC-link capacitor morphology. Yet the email claims Blender geometry shares the same millimetres as the solvers.
- **Fix:** Mark every render 'illustrative concept morphology, not release CAD'. Replace coloured blocks with dimensioned envelope models tied to actual selected parts only after MPN/STEP receipt. Include a visual-to-CAD/source manifest and preserve failed planetary and incomplete capacitor states in cutaways rather than implying a resolved system.

### [MED] M2 — FIX_BLENDER (grok45)
- **Area:** INTERFACES_XYZ
- **Claim:** Interface ICD complete
- **Evidence:** interfaceIcd=null; BARB-ICD-XYZ TYPES_ONLY_XYZ_OPEN; A-IFACE provisional bay-local XYZ — millimetres deliberately not invented (correct) but GA/Blender ports still placed → implied fake coordinates in mesh.
- **Fix:** Strip numeric port XYZ from Blender or tag provisional_non_ICD; only types until BARB-ICD-XYZ.

### [MED] M3 — FIX_BLENDER (grok45)
- **Area:** INVERTER_DC_LINK_PARTIAL
- **Claim:** Inverter packaging_screen_ok / DC-link envelope = hardware OK
- **Evidence:** inverter_packaging status=PARTIAL, module_mpn OPEN, double_pulse ESL OPEN, dc_link status=PARTIAL_ANALYTICAL_SCREEN c_min 70–884 µF; works_in_kit_context.packaging_screen_ok=true is geometric seed only.
- **Fix:** Rename packaging_screen_ok → geometric_seed_ok; bind film bank volume to bay before any OK.

### [MED] M2 — FIX_BLENDER (glm52)
- **Area:** BLENDER
- **Claim:** Blender renders include 'ghost-shell' and 'cutaway' views but no evidence that the cutaway shows the actual FEMM/CalculiX mesh or gear geometry rather than artistic shells
- **Evidence:** blender_renders_present lists '08-product-ghost-shell.png' through '12-product-ghost-shell-front.png'. The email claims 'geometry driven by the solvers below, not artist CAD' but no evidence links Blender geometry to FEMM mesh nodes or CalculiX geometry. Lucid role is correctly FFF_TRAINING_CHECK_ONLY.
- **Fix:** Provide a Blender→solver geometry cross-reference: stator OD, rotor ID/OD, gear pitch diameters, housing OD must match the JSON quantities exactly. Add a screenshot overlay showing dimensions on the cutaway.

### [MED] M1 — FIX_BLENDER (sol)
- **Area:** Inverter and DC-link packaging
- **Claim:** The inverter packaging result is an analytical volume screen, not a package feasibility demonstration.
- **Evidence:** inverter_packaging status=PARTIAL and module_mpn_and_step=OPEN. It treats three SiC modules, 6.39 nH ESL and capacitor class as seeds. dc_link_cap spans 70.7–884.2 µF and 19.9–248.7 cm3 nominal volume under assumed switching frequency, ripple and energy density, explicitly with no committed CAD box, MPN, lifetime, ripple qualification or measured ESL.
- **Fix:** Freeze actual module, capacitor and laminated-bus geometry; prove clearance, creepage, loop inductance, thermal paths, capacitor ripple/current/life and serviceability on release CAD and hardware.

### [MED] M2 — FIX_EXCEL (sol)
- **Area:** Homologation status
- **Claim:** The global ship/homologation flags are correctly negative, but 45 of 55 catalogue parts being OPEN BY DESIGN demonstrates that this is not a controlled product definition.
- **Evidence:** ship.ship_ok=false and homologationHonesty.verdict=NOT_HOMOLOGATED, but open_by_design_count=45 of 55 includes inverter, power module, connectors, motor, bearings, gear stage, cooling hardware, safety functions and harnesses.
- **Fix:** Maintain NOT_HOMOLOGATED and ship_ok=false in every artefact, email, workbook and render. Establish a procurement and release plan that closes part identities, qualification, manufacturing and traceability before any homologation discussion.

### [MED] M4 — FIX_INVERTER (grok45)
- **Area:** HOMOLOGATION_CATALOGUE
- **Claim:** 45 OPEN BY DESIGN catalogue parts still allow a 'kit' narrative
- **Evidence:** homologationHonesty open_by_design_count=45/55 including traction motor, inverter, gears, bearings, connectors — correct NOT_HOMOLOGATED but dossier volume implies completeness.
- **Fix:** Front-page stamp: CONCEPT SHELL — 45 parts TBD; no kit supply claim.

### [MED] M5 — FIX_PHYSICS_HONESTY (grok45)
- **Area:** ASSUMPTION_LOOP
- **Claim:** Partner can overwrite freezes via Jack xlsx and close the loop
- **Evidence:** asks_from_partner + jack_fill_in_xlsx present; proveCatch has_asks=true. Architecture blockers human_decision_required=true and writeback_invalidated on gears — xlsx cannot clear PLANETARY/EM bore fight without geometry rewrite. Process semi-open for seeds, closed for blockers without new multiphysics.
- **Fix:** Separate SEED_OVERWRITE sheet from ARCHITECTURE_DECISION gate; blockers not fillable yellow cells.

### [MED] M3 — FIX_PHYSICS_HONESTY (glm52)
- **Area:** ASSUMPTION_LOOP
- **Claim:** The xlsx fill-in sheets exist but there is no evidence that Jack's inputs feed back into the frozen assumptions via a live data chain
- **Evidence:** jack_fill_in_xlsx has sheets 'Assumptions (fill)' and 'Asks (fill)'. asks_from_partner lists 7 asks. But no evidence shows that filling the xlsx triggers a re-run of EM/thermal/gear screens. The assumption→ask loop appears to be a manual email round-trip, not an automated overwrite.
- **Fix:** Document the overwrite path: xlsx yellow cells → assumption JSON → re-run multiphysics → updated results. If it is manual, state that explicitly. If automated, show the pipeline.

### [MED] M5 — FIX_PHYSICS_HONESTY (glm52)
- **Area:** R-STRUCT-MOUNT
- **Claim:** Mount screen uses motor_reaction=125.2193 N·m which does not match either the independent_arithmetic (122.427) or the R-EM-DUTY required (125.214912)
- **Evidence:** R-STRUCT-MOUNT: 'motor_reaction=125.2193 N·m'. independent_arithmetic: t_shaft_ideal=122.427. R-EM-DUTY: required=125.214912. Three different torque values for the same quantity across three screens. Identity lock is broken.
- **Fix:** Single torque value propagated to all screens. If 125.22 is the design torque, update independent_arithmetic. If 122.43 is correct, update R-STRUCT-MOUNT and R-EM-DUTY.

### [MED] M1 — GAP (grok45)
- **Area:** PCB_HIL
- **Claim:** PCB path is review-ready without false fabrication PASS
- **Evidence:** forgeDraftOnly=true, supplierGerbers=false, hilPresent=false, NOT_FABRICATION_READY=true — respected. Risk: grade B+ / PROTOTYPE_PACKAGE / fitness≈7.93 and pipeline_ok=true can be slide-decked as fab-ready; banner required but partner email tone is celebratory.
- **Fix:** Lead every PCB artefact with NOT_FABRICATION_READY; never pair B+ with ship language.

### [MED] M1 — GAP (glm52)
- **Area:** PCB
- **Claim:** PCB pipeline_ok=True is misleading when supplierGerbers=False and forgeDraftOnly=True
- **Evidence:** pcb.pipeline_ok=True, pcb.supplierGerbers=False, pcb.forgeDraftOnly=True. 'pipeline_ok' implies the PCB flow is complete, but it is draft-only with no supplier release.
- **Fix:** Rename pipeline_ok to pipeline_draft_ok or set to False until supplier Gerbers are received and DRC-clean.

### [MED] M3 — GAP (sol)
- **Area:** Partner communication
- **Claim:** The Jack email is subordinate to the technical failures but contains overclaiming language that must be corrected.
- **Evidence:** The email says 'same millimetres', calls torque arithmetic 'hard', and cites a 207 N·m peak while current disclosed EM results contain 78.4, 81.6, 104.1, 122.1 and 125.2 N·m incompatible values. It correctly says ship_ok remains false, but this disclaimer does not cure false identity or arithmetic claims.
- **Fix:** Withdraw the email until the duty point and geometry ledger are corrected. Replace promotional solver inventory with a one-page failed-architecture status, validated assumptions, requested ICD inputs and explicit rerun commitments.

### [MED] M4 — REVIEW (glm52)
- **Area:** POST_DIFF
- **Claim:** R-POST-DIFF reports 'blocker=CLEARED; FoS≥1.2005' — a FoS of 1.2005 is not a clearance, it is a marginal pass
- **Evidence:** R-POST-DIFF: 'blocker=CLEARED; FoS≥1.2005; bay_fit=True; interfaces_ok=True'. Using 'CLEARED' for a 1.20 FoS implies the design is safe. In a race powertrain, 1.20 is the absolute floor, not a comfortable margin.
- **Fix:** Report the actual FoS value, not '≥1.2005'. Use 'MARGINAL' instead of 'CLEARED' when FoS < 1.5. State the target FoS.

