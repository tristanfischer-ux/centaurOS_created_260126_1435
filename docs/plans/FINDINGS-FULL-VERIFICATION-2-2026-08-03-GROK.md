# FE Front full verification-2 — complete

| | |
|---|---|
| **Workflow** | `fe-front-full-verification-2` · `wf_019fc8ad20b37d819e1d6d5d23150a51` |
| **Elapsed** | ~46 min · 7 agents · budget 7/48 |
| **Window** | 2026-08-03 17:30–18:16 UTC |
| **Twin** | `out/formula-e-front-mgu-20260729-1432` |
| **Workbook at verify** | **V1.280** (pre DEC-009 rebuild) |
| **overall_ok** | **`false`** |
| **ship_ok still false** | **`true`** (held) |
| **guards_ok / typecheck** | true / true |
| **no_hold_closed** | true |
| **adversarial detectors fire** | true |

## Executive verdict

Re-ran 2026-08-03 on twin out/formula-e-front-mgu-20260729-1432: bash scripts/verify-engine-guards.sh →0; node scripts/check-typecheck-baseline.mjs →0 (143 sigs); check_falsifiability_audit.py --twin →0 (169/0 unfalsifiable) + --selftest proveCatch OK; check_bar_b_register_freshness.py --twin →0 (stale_count=0, stamped/live ship_ok=false, 10 OPEN rows) + --selftest proveCatch OK; physics_plausibility.py --twin →0 ok=False HIGH shaft_power_vs_class 244.49 vs 350 class, --enforce →45; npx tsx gate-registry.ts --selftest →0 (28/28 catch; 7 enforced-by-default: 22,25,41–45); drawing_gates.py twin →23/23 ALL-PASS; state.drawingGates synced_at=2026-08-03T18:12:58Z all_pass=true matches drawing-gates.json; dec_em1_option_screen --twin baseline T/Treq=0.651 magnet_vignette=83.8, 24k/130 T/Treq=1.069 magnet_vignette=99.4; independent T=250e3/(0.9777*ω_19500)=125.219269 N·m; FE mean |T|=81.558081;


**Area agents:** GUARDS/PHYSICS/DRAWINGS `ok=true` · EXCEL/PCB/RENDERS `ok=false` · SYNTH `overall_ok=false`.

## Ordered findings (synthesis)

### S1 — 00-hero is a shippable closed-product flagship render of the unitised front MGU

- **severity / class:** `critical` / `WRONG`
- **observed:** Hero is open/disassembled: end region open with copper windings exposed, thin bar floating above, long rails and bolt-like solids on the ground plane disconnected from the pack. drawing_gates render_* PASS; vision critique ok=true on 04 only with structured_defects_error ModuleNotFoundError: vision_route_fix. evaluate path does not fail open-hero/debris.
- **where:** out/formula-e-front-mgu-20260729-1432/00-hero.png (and 04/08/13 sharing floor debris)
- **reader_would_conclude:** The product flagship shot shows a finished sealed FPK ready for customer review
- **area:** RENDERS

### S2 — Executive Summary Key specifications show engineering achievements (Target met → Achieved + PASS)

- **severity / class:** `high` / `WRONG`
- **observed:** Headers Brief metric|Target|Achieved|STATUS. All 9 rows have Target==Achieved and STATUS=PASS with notes 'brief key: … → contract: …'. Includes Front hardware power class 350/350 PASS, Fpk mass cap 32/32 PASS, Magnet temp limit 150/150 PASS — pure brief/contract echo, not measured performance.
- **where:** 20260803-1357-V1.280-DRAFT-…workbook.xlsx Executive Summary!A37:I46
- **reader_would_conclude:** The design has met every brief metric including power class, mass, and magnet temperature because the sheet shows green PASS
- **area:** EXCEL

### S3 — Magnet temperature compliance is PASS at the 150 °C limit

- **severity / class:** `high` / `WRONG`
- **observed:** Exec: Target=150 Achieved=150 STATUS=PASS (limit echoed). Checks r63: Brief target met: magnet_temp_limit_c design=159.35 limit=150 delta=9.35 STATUS=FAIL. Post-DEC-008 vignette magnets 83.8 °C clear 150; continuous-path design value 159.35 still fails the ceiling check. Dual story on the same quantity name.
- **where:** Executive Summary!A46 vs ⚠ Checks!A63 vs DEC-008 restamp / thermal screens
- **reader_would_conclude:** From Exec Summary alone, magnets are compliant at 150 °C; the dossier is thermally closed
- **area:** EXCEL

### S4 — Machine is a consistent 350 kW class unit at the shaft (label matches delivered performance)

- **severity / class:** `high` / `WRONG`
- **observed:** Detector HIGH: mgu_shaft_power_kw=244.49 vs class 350.0 (70% < 85% floor); ok=False. Default exit 0; --enforce exit 45. Exec Summary still PASSes 350/350 as brief echo. engine-guards only runs physics_plausibility --selftest.
- **where:** scripts/lib/physics_plausibility.py shaft_power_vs_class; contract front_hardware_power_class_kw=350; workbook Exec r38
- **reader_would_conclude:** This unit delivers ~350 kW class performance at the shaft and CI would block a mis-labelled class
- **area:** PHYSICS

### S5 — PCB boards are fabrication-ready (FAB-READY headline)

- **severity / class:** `high` / `WRONG`
- **observed:** PCB banner: 'FAB-READY — UNPROVEN IN HARDWARE — DRC-clean…'. Root pcb-stage/state: NOT_FABRICATION_READY=true, forgeDraftOnly=true, ship_ok=false, supplierGerbers=false, hilPresent=false. QA readiness: ENGINEERING DRAFT. Two routed DRC-clean boards are real, but release language conflicts.
- **where:** workbook PCB!A6; Quality & Audit; root pcb-stage.json; state.json pcb
- **reader_would_conclude:** Boards can be sent to a fab house as a release package
- **area:** PCB

### S6 — mgu_iron_loss_w is a single consistent engineering value across the dossier

- **severity / class:** `high` / `WRONG`
- **observed:** Design uses 6035.1 W (Steinmetz screening on FE tooth/yoke flux). Tool motor:loss-point still 135.56 W. Checks discloses supersession FAIL (delta −5899.54) but both values remain under the same quantity name. Dissipation blocks also disagree continuous totals (~6.6 vs ~12.5 kW paths).
- **where:** ⚠ Checks!A109; Calculations iron_loss rows; _motor_stack/stator_iron_loss_from_lamination.json
- **reader_would_conclude:** Iron loss is either ~136 W or ~6 kW depending on which row they trust; thermal/loss closure is ambiguous
- **area:** EXCEL

### S7 — Gate registry blocks defects by default across the canonical set

- **severity / class:** `high` / `UNSUPPORTED`
- **observed:** 28/28 gates proven CATCH; only 7 enforced-by-default (22, 25, 41, 42, 43, 44, 45). 21 shadow/flag-gated including drawing-gates(35), physics-critic(33), design-closure(40). Live is 7/28 not ~full set.
- **where:** scripts/lib/gate-registry.ts enforcedByDefault(); npx tsx scripts/lib/gate-registry.ts --selftest
- **reader_would_conclude:** A failing registry gate will stop a bad ship without setting env flags
- **area:** GUARDS

### S8 — Automated image/vision/drawing gates catch open-hero, floaters, and floor debris

- **severity / class:** `high` / `UNSUPPORTED`
- **observed:** drawing_gates ALL-PASS including render_presence/framing/washed_out and plan_render_coherence. Vision critique ok=true defects=[] on 04-product-exterior only; structured_defects_error ModuleNotFoundError. Human visual open of 00-hero fails ship criteria.
- **where:** drawing-gates.json renders; render-vision-critique.json; render_image_quality
- **reader_would_conclude:** Green drawing/render gates mean the product visuals are customer-ready
- **area:** RENDERS

### S9 — pcb-stage.json is a single authoritative store (no COTS/no-board false story)

- **severity / class:** `high` / `WRONG`
- **observed:** Root 50 744 B: disposition=bespoke, 2 boardPipelines, NOT_FABRICATION_READY, electronic pipeline complete. Nested pcb/pcb-stage.json 2 680 B older: disposition=cots-modules, electronicPartCount=4, no pipeline, no NOT_FAB field. pcb-stage-result.json absent. PCB_SIDECAR expects both names.
- **where:** out/…/pcb-stage.json vs out/…/pcb/pcb-stage.json (pcb-stage-result.json absent)
- **reader_would_conclude:** Reading pcb/pcb-stage.json alone yields a false COTS/four-part story with no routed boards
- **area:** PCB

### S10 — physics_plausibility HIGH findings block the default guard/CI path

- **severity / class:** `medium` / `UNSUPPORTED`
- **observed:** HIGH shaft_power_vs_class with ok=False but process exit 0 unless --enforce. engine-guards only runs --selftest, not twin --enforce.
- **where:** scripts/lib/physics_plausibility.py main(); scripts/verify-engine-guards.sh
- **reader_would_conclude:** Implausible power-class labelling would fail CI/guards without an extra flag
- **area:** GUARDS

### S11 — ESCALATE stubs for formula_e_front_mgu drawing:cad_geometry_coverage, drawing_set_coherence, plan_render_coherence still assert recurring loss

- **severity / class:** `medium` / `STALE`
- **observed:** Stubs still open ('failed 2×/4× — recurring loss'). Live drawing-gates.json and re-run: all three gates ✓, all_pass=true n_failing=0. No retract mechanism. drawing-gates-final.log also stale (old FAILs).
- **where:** tasks/harness-stubs/ESCALATE__formula_e_front_mgu__drawing_{cad_geometry_coverage,drawing_set_coherence,plan_render_coherence}.md
- **reader_would_conclude:** Those three drawing gates are still failing and need council escalation
- **area:** GUARDS

### S12 — Duty required shaft torque is ~119.7 N·m (workbook/gear_oil path) and that is the EM duty bar

- **severity / class:** `medium` / `PARTIAL_TRAP_RESIDUAL`
- **observed:** 119.73 N·m = 244.49 kW shaft / ω (post-η motoring shaft). Duty required independent 125.2193 N·m (η≈0.9777) / FE analytical 125.214912. ABD/EM/ISO/bevel/mount use ~125.2. gear_oil required_shaft_torque_nm=119.7286. Workbook surfaces 119.7 as mgu_shaft_torque PASS, not 125.2 duty requirement.
- **where:** state/excel mgu_shaft_torque_nm; _motor_stack/gear_oil_fia_front_kit_case.json; ABD/EM REBALANCED required_shaft_torque_nm
- **reader_would_conclude:** Using workbook/gear_oil alone understates the torque gap (0.681 vs 0.651 vs required)
- **area:** PHYSICS

### S13 — Closed exterior / ghost / exploded product renders are free of detached ground debris and toy-like solids

- **severity / class:** `medium` / `WRONG`
- **observed:** 04/08 share ground-plane rails/bolts; 13 axial explode readable but RGB phase bars toy-like and floaters; 14 catalogue neat but many featureless boxes. Structural BoM coverage BLE/GA/SLD 100% and FPK 48/48 still hold — mesh presence ≠ visual ship quality.
- **where:** 04-product-exterior.png; 08-product-ghost-shell.png; 13-product-exploded.png; 14-product-parts-catalogue.png
- **reader_would_conclude:** Product visualisation pack is engineering-grade and debris-free
- **area:** RENDERS

### S14 — Suppliers OPEN BY DESIGN unresolved helper agrees on every OBD MPN cell

- **severity / class:** `medium` / `WARN`
- **observed:** Most OBD rows MPN='TBD (detailed design)' → unresolved True. Stator Windings r58 mpn='(none)' → is_unresolved_part_number False (disagreement). No fabricated catalogue MPNs on OBD block.
- **where:** Suppliers!A17:D63; scripts.lib.homologation_honesty.is_unresolved_part_number
- **reader_would_conclude:** All open parts are uniformly flagged unresolved by the honesty helper
- **area:** EXCEL

### S15 — Continuous-path thermal screens agree within 0.1 K on magnet temperature

- **severity / class:** `low` / `BORDERLINE_NUMERIC`
- **observed:** Adopted/vignette magnets match 83.8 / 99.4 exactly across screens. continuous_reference: 159.35 vs 159.235 (Δ=0.115 K) — slightly looser than the 0.1 K slogan. Network thermal_network.magnet_temperature_c still 159.235.
- **where:** analytical_fia_cooling_thermal_screen.json vs analytical_fia_cooling_network_screen.json
- **reader_would_conclude:** Cross-screen continuous magnets agree to ≤0.1 K everywhere
- **area:** PHYSICS

### S16 — ship_ok can be true or Bar B holds closed for this deliverable

- **severity / class:** `info` / `CONFIRMED_NEGATIVE`
- **observed:** ship_ok false on state, barb, pcb-stage, Quality B109. can_mint_ship_ok false. All 10 BARB-* homologation_status=OPEN. release_readiness score=4 floor=4 allPass=false. Freshness ok with live_ship_ok false.
- **where:** state.json ship_ok; JLR-FE-FRONT-FPK-BAR-B-READINESS.json; quality-scorecard release_readiness
- **reader_would_conclude:** N/A — honesty surface intact (no silent minting)
- **area:** GUARDS

### S17 — Drawing gates 23/23 ALL-PASS; GA projection and SLD head-noun rules hold; artefacts non-zero

- **severity / class:** `info` / `CONFIRMED`
- **observed:** 23 gates · 0 failing · ALL-PASS=True. state.drawingGates now synced (all_pass=true, source=drawing-gates.json). PDF/SVG non-zero. SLD mechanical head-noun filter holds per prior scan. Latent G23 except→green-tick code risk did not fire on this twin.
- **where:** drawing-gates.json; drawings/*.{pdf,svg,png}
- **reader_would_conclude:** Deterministic drawing gates are green for this traction twin (trust json over drawing-gates-final.log)
- **area:** DRAWINGS

### S18 — Two routed boards, 0 DRC violations with real kicad-cli provenance; design-fitness 7.6 workbook

- **severity / class:** `info` / `CONFIRMED`
- **observed:** 2 board-routed.kicad_pcb, pipeline complete, both drc violations=[]. Workbook fitness 7.6 PASS. This structural claim holds; does not override NOT_FABRICATION_READY or FAB-READY banner conflict.
- **where:** pcb-boards/{traction_control,traction_gate_drive}; drc-report.json; workbook PCB fitness
- **reader_would_conclude:** Electronics pipeline produced two clean routed boards (still engineering draft for release)
- **area:** PCB

## Physics table (independent re-derive)

| claim | claimed | rederived | gap | ok |
| --- | --- | --- | --- | --- |
| A) Torque required from T=P_elec/(η·ω) at 250 kW / 19500 rpm | 125.2193 N·m with η≈0.9777 | T=250e3/(0.9777*19500*2π/60)=125.219269 N·m; FE analytical combined_regen_effici | −3e-5 N·m vs 0.9777 path; −0.0044 N·m vs FE analytical | True |
| B) Delivered baseline ~81.558 N·m; DEC-009 24k rpm/130 mm → ~1.069× required | baseline≈81.558 N·m; 24k/130 torque_ratio≈1.069 | FE rotor_position_sweep mean \|T\|=81.558081 N·m (ratio 0.651 vs 125.214912); dec_ | 0 vs claimed means; ratio is vs speed-adjusted required, not 81.558×1.069 | True |
| C) Iron loss 6035 W screening_estimate with ~3.9–8.5 kW two-sided band | 6035 W; basis=screening_estimate; range 3.9–8.5 kW; not upper bound | stator_iron_loss_from_lamination.json iron_loss_w=6035.1 tooth=2249.4+yoke=3785. | 0 W on mid-point; label correctly not upper bound | True |
| D) Magnet temp DEC-008 intermittent ~83.8 °C; DEC-009 ~99.4 °C vs 150 limit | 83.8 / 99.4 / limit 150; continuous 009 ~224 °C | dec_008_duty_restamp magnet_c=83.8 margin_k=66.2; option screen baseline vignett | 0.0 K on stored vignette points | True |
| E) Two thermal screens agree within 0.1 K on magnets | ≤0.1 K cross-screen agreement | Adopted max magnets both 83.8/99.4 (Δ=0). continuous_reference_maximum_magnet_te | +0.015 K over the 0.1 K slogan on continuous_reference path | False |
| F) Falsifiability 0/169 unfalsifiable | 0 unfalsifiable of 169 | check_falsifiability_audit.py --twin: checks_audited=169 unfalsifiable_count=0 f | 0 | True |
| G) TORQUE DENOMINATOR TRAP: 119.7 is shaft at 244.49 kW not duty required 125.2 | mgu_shaft_torque_nm=119.7 must not flatter as required; duty bar ~125.2 | 244.49e3/ω_19500=119.7286 N·m. Duty req 125.2193 / FE 125.214912. gear_oil requi | gear_oil + workbook residual understates duty gap by ~5.5 N·m | False |
| H) DEC-008 and DEC-009 reversible; DEC-009 depends on DEC-008 | Both FROZEN_UNDER_ASSUMPTION, reversible; 009 depends on 008 | 10-decision-register.json: both status=FROZEN_UNDER_ASSUMPTION, owner marks reve | none material | True |

## What was not checked

- Full regression-harness run (verify-engine-guards --with-harness)
- Whether CHAIN_GATE_ENFORCE / DRAWING_GATES_ENFORCING / PHYSICS enforce flags are set in deploy CI
- Full FEMM re-solve of em_fia_front_kit_case_REBALANCED (used stamped FE means + arithmetic)
- OpenFOAM / CalculiX re-solves
- Byte-identity of twin DRAFT xlsx vs design-pack-embedded xlsx
- Full Excel formula dependency graph / live Excel recompute beyond openpyxl cached data_only
- BoM ledger line-by-line of all parts vs Suppliers pinned/OBD
- Whether pinned catalogue MPNs are real orderable parts
- Gerber CAM/manufacturer DFM (annular ring, impedance, HV creepage)
- Full netlist electrical correctness beyond DRC/unconnected
- HIL/firmware proof contents beyond hilPresent=false
- DRAWING_VISION_ENFORCING=1 hard-fail path
- Visual QA of all secondary product angles (05–07, 09–12) and module-*.png
- Interactive GLB/USDZ viewer check
- Non-FE-front ESCALATE stubs (other product classes) vs their twins
- Historical design-pack drawing folders under versioned V1.* trees
- Pixel diff vs pre-isatags / pre-internals rerender backups

## Post-workflow remediation (parent, after 18:16Z)

Verify-2 froze a **V1.280** snapshot. Same day, parent then:

| Fix | Status now |
|---|---|
| DEC-009 restamp (24k/130, magnet 99.4, ratio 1.069) | **done** on twin |
| Excel+pack rebuild | **V1.284** · pack SHA = workbook |
| Coherence enforce | **PASS** 0 findings |
| Decision Register DEC-008/009 on Excel | **done** (file→state sync) |
| R3 Quality R12 greenwash (dyno/HIL axis PASS) | **fixed** — FAIL OPEN(6) hardwareCorrelation |
| Drawing gates live 23/23 + state sync | **confirmed** by verify-2 |
| ship_ok | **still false** |

**Current customer send:**
`20260803-1922-V1.284-DRAFT-formula-e-front-mgu-engineering-workbook.xlsx`
`20260803-1922-V1.284-formula-e-front-mgu-design-pack.zip`

Raw agent JSON: `docs/plans/VERIFY2-{GUARDS,PHYSICS,EXCEL,DRAWINGS,PCB,RENDERS,SYNTH}-2026-08-03.json`

*overall_ok=false for the V1.280-era twin is correct. Re-run verify before claiming clean on V1.284.*

