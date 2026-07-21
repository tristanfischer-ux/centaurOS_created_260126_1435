# Organoid bioreactor → 9/10 on EVERY tab — master plan (2026-07-21)

## THE GOAL (hold every turn)
ONE genuine 9/10 organoid benchtop-bioreactor dossier: **every scored tab ≥8 (target 9)**, coherent Blender renders (clean product views + cutaway hero), complete engineering drawings, a fab-ready (or honest-ceiling) PCB, honest cost, ALL ⚠Checks pass, `ship_ok=True`. A chartered engineer would rely on it. Fixture: `out/organoid-bioreactor-20260721-rebake2`.

## STORY ARC — where we were → where we are → where we're going
- **Were:** frozen 2150 = a Goodharted fake-9 (real floor 4). Cost 2.08× over ceiling. Render = Lego-in-a-box. PCB = token-level.
- **Now:** the engine scores itself HONESTLY (no fake-9). Cost blocker CRACKED (2.08×→1.11×, materials £484→£191). Drawings at 9. But 12 tabs still <8 — the honest remaining gap.
- **Going:** fix each of the 12 sub-8 tabs at SOURCE (the punchlist routes each), parallel where file-disjoint, then ONE final re-bake + adversarial SIGHT. Ship only when every tab honestly ≥8.

## CORRECTIONS (Cursor audit, accepted 2026-07-21)
- **Materials = £259** (`costStack.raw_materials_bom_gbp`), NOT £191 (that was the partVerifications sum). Use £259 for the ceiling decision. `factory_cogs_gbp`=£343, ex-works=£429.
- **Do NOT say "cost cracked"** — still 1.11× on ex-works until the COGS-vs-ex-works ceiling basis (R6) is decided. No more ceiling-cutting.
- **R3 = propagation/live-check, not a new registry** — `class-standards.ts` already declares the lab-instrument standards (CONFIRMED: source present + guard added, 483afc256). The real Excel-save blocker is the **bare-literal `'FAIL'` at Quality & Audit!D11** (no-cheating LIVE-CHECK) + self-audit defects + ceiling.
- **R4 must KILL ferrite@95mm** (a real mis-placed part — also the R1c plant-voltage edge), not just grow the box to pass phenotype.
- **NEW ROOT R9 — self-audit false "All 6 PASS"**: brief_compliance banner asserts all-pass over high-severity engineering + a physics_fidelity optical-path mismatch (self-audit blocking_defects). Must fix — it binds ships.
- **Sequencing: Wave 1 = R3(+R1) then R4; PARK R8 (decomp) until the Excel has SAVED once** (the bare-literal live-check is the immediate gate to even producing a workbook to SIGHT).

## DONE (this program — do NOT redo)
- Scoring honesty S1–S12, F1a–f, gates 31–38, honest-scoring precondition — engine self-scores truthfully.
- COST: filler phantom (−£87, c070bef3f), F2 thermal (8b83fa435), 17 real lab parts ingested (116f72dfa+live), scale-aware device-commodity ceilings (221ab9633) → materials £191, ex-works £429/1.11×.
- RENDER: B3 composer containment (551aa1bf8), B1 device-scale, B4 lab_electronics family split (e94d272d1), V1b vision floor (64084e907), phenotype real-enclosure proxy (2cf2ec64b).
- DRAWINGS: Drawings 9, Interconnect 9, drawing-gates all_pass ✅ (essentially done).
- PCB honesty P1–P9 (readiness never fakes FAB-READY).

## THE GAP — 12 tabs <8 (rebake2 scorecard) → 8 ROOT CAUSES
| Tab | Score | Root |
|---|---|---|
| Executive Summary | 0.0 | AUTO (min-of-all — clears when others pass) |
| Quality & Audit | 0.0 | AUTO (min-of-all) |
| ⚠ Checks | 2 | R1 (3 failing invariants) + R3 (missing standards) |
| Overview | 6 | R1 (3 failing invariants shown on Overview) |
| Connection trace | 6 | R1 (interconnect within_spec==false) |
| Bill of Materials (Ledger) | 6.9 | R2 (11/35 rows: catalogue electronic parts, no MPN) |
| Risk & Regulatory | 7.5 | R3 (capex-per-unit flag) + R6 (cost) |
| Renders | 3 | R4 (scene 221mm vs ~102mm enclosure = 2.2× sprawl) |
| Assembly | 3 | R4 (same phenotype + micro-component dims) |
| Verification | 4.0 | R7 (5 HARD claims open — clear w/ R1+R5) |
| Brief | 4.0 | R6 (zero content checks — no brief↔contract reconciliation) |
| PCB | 0.0 | R5 (no DRC-clean routed board w/ Gerbers) |

## ROOT CAUSES → SEQUENCED AUTONOMOUS PLAN
**R1 — 3 failing deterministic invariants** (fixes ⚠Checks, Overview, Connection trace, part of Verification). SOURCE: (a) Part-type coherence — an active machine pinned to a consumable (pump↔tubing); (b) Part-status honesty — IDENTIFIED line over an `unverified` SKU; (c) interconnect within_spec==false (edge domain mismatch). Fix the emitter/synthesis + interconnect that PRODUCE these, not the check. Files: deterministic_checks_lib routes; source in the emitter / connection_sizing.
**R2 — BoM catalogue-electronic parts with no MPN** (Pcb Mounting Standoff, Front Panel Connector Ports, Stir Tachometer Sense, …). Fixes BoM 6.9→9. Ingest real MPNs for the residual slots + mark genuinely-bespoke as OEM-proprietary-with-evidence (not "bespoke fabrication"). Files: ingest + requirements_bom emitter.
**R3 — Regulatory standards emitter for lab-instrument class** (LVD 2014/35/EU, EMC 2014/30/EU, RoHS, IEC 61010-1, IEC 61326-1). Fixes ⚠Checks LIVE-gate (UNBLOCKS the Excel save!) + Risk&Regulatory. SOURCE: standards emission for benchtop_bioreactor/lab_instrument, jurisdiction-aware. HIGHEST leverage (unblocks dossier build).
**R4 — Render phenotype sprawl** (parts 221mm vs 102mm enclosure). Fixes Renders 3 + Assembly 3. Either grow the enclosure envelope to contain the proud vial+OD honestly, OR pack parts into 102mm (F1b device-scale AABB). Decide by what a real pioreactor looks like (vial proud is legit — so the ENCLOSURE proxy vs the vial silhouette must reconcile). Files: build_universal_scene.py.
**R5 — PCB fab-ready** (or honest ceiling). Run the atopile→KiCad→route→Gerbers pipeline to DRC-clean. CONSTRAINT: KiCad may be absent (per memory) → honest ceiling may be FAB-READY—UNPROVEN (not a 9). Assess + do the best honest state. Files: pcb pipeline; coordinate w/ Cursor (PCB lane).
**R6 — Brief↔contract reconciliation + cost/ceiling** (fixes Brief 4.0, Risk&Reg capex). Emit a brief-compliance reconciliation; resolve the missing brief fields (mass, env); DECIDE the £385 ceiling basis (materials £191 is lean — likely a volume/COGS target; state the volume assumption so single-unit ex-works £429 isn't a false-fail).
**R7 — Verification HARD claims** — mostly auto-clears when R1 (invariants) + R5 (PCB) close; residual = Temperature Control Stability derived figure.
**R8 — Decomposition depth** (8 vs ≥16 sub-modules) — enriches Overview/Exec. SOURCE: module-decomposition / class-graph coverage for benchtop_bioreactor.

## EXECUTION ORDER (autonomous, one→next)
1. **WAVE 1 (parallel worktree agents, file-disjoint):** R3 (standards), R1 (invariants), R4 (render sprawl), R8 (decomp). Integrate + harness green.
2. **WAVE 2:** R2 (MPN ingest+emitter), R6 (brief reconciliation+ceiling), R5 (PCB assess+best-honest).
3. **R7** verify residuals.
4. **FINAL RE-BAKE + FULL ADVERSARIAL SIGHT** — rebuild dossier.xlsx, open every tab, confirm ≥8 on all + ⚠Checks 0 FAIL + ship_ok=True; SIGHT 04/07 product + 00-hero + drawings. Loop any residual sub-8 tab.

## METHOD (standing)
SOURCE fix + proveCatch on the fixture + no `if organoid` + `--no-verify` commit w/ `regression-harness:` line + harness green. SIGHT the DELIVERED artefact (Excel cells, PNGs), never stdout. Parallel agents: worktree isolation, partition by FILE, verify base is oxccu-efuel tip, re-run harness yourself after integrating (see drawer forgeos_gotchas_13800ee64ac99efb).
