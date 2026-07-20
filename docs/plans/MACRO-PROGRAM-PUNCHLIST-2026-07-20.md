# Macro program — living punchlist (single source of truth)

> **▶▶ RESUME AFTER COMPACTION (2026-07-20).** Task: execute the FULL macro engine-self-audit program (Tristan directed — Terminal executes ALL incl PCB + DB + form; Cursor advises via `CURSOR-HARNESS-INBOX.md`, HOLD on `cursor-pcb`, single chain owner). Diagnosis + plan: `MACRO-ENGINE-SELF-AUDIT-PLAN-2026-07-20.md`; council findings: `COUNCIL-BIOREACTOR-2150-ADVERSARIAL-FINDINGS-2026-07-19.md`; Cursor packs: `CURSOR-PCB-HONESTY-FIXES-…` (Fixes 1–9) + `CURSOR-DB-AND-FORM-AUDITS-…` (A1–A8, B1–B7). **Method (mandatory):** each fix = SOURCE rule change + proveCatch on the FROZEN known-bad fixture `out/organoid-bioreactor-20260719-2150/` + no `if organoid`; run `python3 scripts/build-excel-export.py --selftest` (needs `PATH=/opt/homebrew/opt/node@22/bin:$PATH`) after every scoring edit; commit `--no-verify` with a `regression-harness:` line; update THIS table (status + SHA) + the inbox ▶ banner. **Acceptance:** re-scoring frozen 2150 → `ships=false`, PCB not FAB-READY, cost refuses — already true; a FRESH bake may claim ≥8 only when the adversarial checks pass on the new artefacts. **~18 genuinely done (honest recount per Cursor). ALL Cursor afternoon-audit rework CLOSED: S7 unified (ships=axes, instrument-no-critique binds, verdict formula AND-gates axis cells), S4 missing-oem, S8 principals-check + the committed-S8 KeyError P0 I found via SIGHT rebuild, F1e small-flow (mL/µL parse + micro-tubing), copy honesty. Device-scale family F1a/b/c/d/e complete.** Every fix has a proveCatch; full 2150 rebuild completes to a correct DRAFT with ONE-TRUTH read-back passing. **NEXT = S11** (BoM↔PCB identity reconcile: MCU real MPN in PCB vs "bespoke/FR4" in BoM), then S6 (Gate 32 band), S9/S10 (stability + bespoke-fab honesty), P3/P4 (PCB USB/LED role rejects), then adversarial vision V1, F1f design-identity scale-lock. **S7 Exec-per-axis card = small follow-up** (axis card is on Quality&Audit; Exec shows the unified verdict). **Superseded banner below (was "20 done"):** The frozen 2150 now refuses/loses its fake-10s on FOUR axes: self-audit blocking_defects (S1), process-plant word leak (S1), ex-works>ceiling (S4), empty-stress-table Engineering-Analysis 10→OOS (S8). **NEXT = S7** (single multi-axis ship card: tab_floor/self_audit/oem/pcb_readiness/vision — ships only if ALL pass; never announce SHIPS from tab_scorecard alone. SIGHT how the Exec card + verdict_text currently announce, then make it read every axis). Then **S11** (BoM↔PCB identity reconcile: MCU real MPN in PCB vs "bespoke/FR4" in BoM), **S6** (Gate 32 £100–£5M band → real per-class band), then adversarial vision V1, F1f design-identity scale-lock, form B1–B7, DB A2–A8. **Method note:** SIGHT the frozen artefact before assuming a punchlist item's scope — S5 was mostly-already-done (stale "invert selftests" note); S8 was a genuine fresh Goodhart the SIGHT caught (10/10 over an empty table). S3 proveCatch DONE (4907c5ede). G34 additive proveCatch DONE, detect-only/shadow (b88d055b1). S4 DONE (c3c65e83d): oem>ceiling×1.02 → ships=false; SIGHT-verified refuses real 2150 (£429>£385). F1a proveCatch DONE (dc7d8579c). F1e DONE (a7ababd45): `connection_sizing.py` device-scale flag → 6 mm micro-tubing not DN25. F1d DONE (3be10b5d6): `sizeMainIncomer` models a watt-scale instrument as single-phase 230 V (was 3-ph 400 V), phase-aware stamp, proveCatch main-incomer-selftest.ts. F1c DONE (f2ff6a4c0): `enrich-state-with-reference-anchor.tsx` suppresses plant-scale references (bespoke bands + corpus medians > £10k) on benchtop instruments — all 5 mis-anchors verified suppressed on frozen 2150. F1b DONE (85d936976): `_instrument_proxy_dim` (build_universal_scene.py) now gives device-scale mechanical/fluidic parts + a universal envelope-relative backstop — no instrument part can inherit a plant TYPE_DEFAULT (the ⌀1.6 m culture-vessel / 1.5 m stirrer leak); proveCatch instrument_proxy_selftest.py. **Method reminder:** SIGHT the frozen 2150 artefact for the real locus (F1b's real root was proxy-coverage, NOT the punchlist's working-volume guess — always confirm before coding). Then F1e interconnect, P3/P4 PCB role guards, P9b firmware harness wire, S5/S8/S11 scoring Goodharts, adversarial vision V1, form B1–B7.



**Fixture:** `out/organoid-bioreactor-20260719-2150/` (frozen known-bad). Every item: SOURCE fix + proveCatch on 2150 + no `if organoid`. Update status + SHA as items land. Acceptance: re-scoring frozen 2150 → `ships=false`, PCB not FAB-READY, cost refuses, vision fails blockout; a fresh bake claims ≥8 only when the adversarial checks pass.

Legend: ✅ done · �doing · ⬜ open

## Scoring / verdict honesty (Terminal — build-excel-export.py + chain verdict)
| ID | Item | Status | SHA |
|---|---|---|---|
| S1 | Pillar 1 — bind selfAudit.blocking_defects + device-scale process_plant_vessel leak → ships=false, floor≤4 | ✅ | 6ff4ce411 |
| S2 | Cost ceiling → ex-works (oem) for device-scale bare unit-cost. **Cursor audit:** rule ✅; 2150 cost refuse still needs S4 (brief says BoM → materials path). | ✅ | 897203942 |
| S3 | Brief `checked==0` → not 10 (cap ≤4). **Cursor ⚠ CLOSED:** proveCatch added on a fresh Brief sheet (4907c5ede) — zero-check→cap 4.0 + honest issue; populated recon→no cap. | ✅ | 80474b1db + 4907c5ede |
| S4 | **oem>ceiling → ships bind directly** in compute_verdict (cost HARD alone may not floor). DONE: when brief states unit_cost_ceiling AND costStack.oem_transfer_price_gbp > ceiling×1.02 → ships=false, floor≤4. SIGHT-verified refuses real 2150 (£429>£385, 1.11×) with other binds stripped. proveCatch + 3 no-FP in --selftest. | ✅ | c3c65e83d |
| S5 | **OOS tabs**: excluded from min_tab AND the "every tab ≥8" narrative. **CORE ALREADY DONE** (2026-07-05 Option-A): canonical compute_verdict excludes `scored:False` (proveCatch ~28452); SIGHT-verified on 2150 — OOS render "n/a — verified out of scope", floor excludes them, count "0 FAIL, 0 UNSCORED" honest. Punchlist "invert selftests" note was STALE. HARDENED: the ⚠ Audit fallback (_aux_tab_score) now also excludes scored:False (was padding the count); proveCatch added. | ✅ | 47d26e560 |
| S6 | **Gate 32** unit-band vs brief ceiling. DONE: when output_family=unit AND brief unit_cost_ceiling exists AND oem>ceiling×1.02 → HIGH regardless of the wide £100–£5M/unit band (agrees with S4). Verified device £429 vs £385→HIGH; £300→no-FP. proveCatch in gate-registry. | ✅ | 87c728415 |
| S7 | **Multi-axis ship gate + card.** DONE (retraction accepted). `compute_ship_axes`+`ship_axes_all_pass`; ships=every applicable axis (tab-floor/self-audit/oem/pcb-readiness/vision); vision axis BOUND (broken→block; instrument+no-critique→UNVERIFIED, not green; plant no-hero→n/a); PCB ENGINEERING DRAFT fails (startswith FAB-READY); Quality&Audit renders the axis card; the LIVE verdict formula AND-gates the axis Met cells (SHIPS≠op=0 alone). SIGHT-verified 2150: 4/5 axes unmet, one-truth passes. Copy fixed (self-audit SCORE advisory; blocking-defects+axes bind). **Exec per-axis card = follow-up** (card is on Q&A; Exec shows the unified verdict). | ✅ | 67662bb56 + dd3ee17f9 |
| S8 | Engineering Analysis empty table → not 10 (council M6). FIX: tolerance-only → device OOS / plant cap≤4. **Cursor tweak DONE:** device with pressure/structural principals + empty stress → cap≤4 (not OOS); only OOS when NO such principal. Also fixed the committed-`dfd17129f` KeyError (returns were missing n_pass/n_total → broke every full build; found via SIGHT rebuild). | ✅ | dfd17129f + 67662bb56 + 06f74c4b3 |
| S9 | Council H9 — stability HARD metric requires derived figure, not setpoint echo. DONE: `temperature_stability_k`(0.5 K) lived in `constraints.derived_requirements` (verification loop only did target_performance.metrics → silently dropped). `_assemble_verification_rows` now iterates derived_requirements, emits a HARD stability row (`_STABILITY_REQ_RX`) resolving against a DERIVED ±K quantity → UNVERIFIED absent one. SIGHT-verified 2150: row now UNVERIFIED HARD (was dropped). proveCatch both. | ✅ | 19ae39abb |
| S10 | Council H10 — catalogue-electronic with no MPN → UNRESOLVED (row FAILs), not false-satisfied "bespoke fabrication". DONE: `_ELECTRONIC_NOUN_RX` + FR4/electronic material signal; mechanical parts keep honest bespoke. SIGHT-verified 2150: 10 electronics→UNRESOLVED, mechanical stays bespoke. proveCatch both. | ✅ | babbbb74b |
| S11 | Council M5 — BoM↔PCB identity reconcile. DONE: `_build_mpn_by_word` harvests `state.pcb.pipeline.generator.components` (keyed nameHuman/characterId/space-form) → `_bom_row_mpn` backfills; a real board MPN overrides a TBD/empty partVerification, never a resolved one. SIGHT-verified 2150: MCU/temp-sensor/polyfuse/reverse-polarity now show real MPNs (was 'bespoke fabrication'). proveCatch both directions. | ✅ | dd75fdada |
| S12 | **Vision-critic-before-Excel** timing race — Excel waits on render-vision-critique.json OR Renders capped ≤6 until present | ⬜ | |

## PCB honesty (Terminal — Cursor Fixes 1–9)
| ID | Item | Status | SHA |
|---|---|---|---|
| P1 | Fix 1 — package_family weight 0.9→0.5 + `_PCB_FAB_VERIFIED_TIERS` (FAB needs catalogue MPN on every on-board part) | ✅ | 5acaf3416 |
| P2 | Fix 4 — empty required-channel board (od_optics) = architecture gap → DRAFT | ✅ | 5acaf3416 |
| P3 | Fix 2 — TE `4-2489541-7` LED reject (pinout reject on DB-MPN path; atopile-generator + pinouts) | ⬜ | |
| P4 | Fix 3 — `usb_power_entry` must not accept `PinHeader_*` → USB receptacle or unresolved | ⬜ | |
| P5 | Fix 5 — multi-board `requiresKiCadDeliverable`>1 built as ONE KiCad project → PARTIAL/not FAB-READY (serial-design-chain + readiness) | ⬜ | |
| P6 | Fix 6 — Gate 38 widen beyond pipeline.ok (fitness + role guards + firmware-absent) | ⬜ | |
| P7 | Fix 7 — interface-critical roles must be mpn-tier (subset of P1) | ⬜ | |
| P8 | Fix 8 — PnP `Val=?` (cosmetic; Excel already fills; do NOT block FAB on it) | ⬜ optional | |
| P9a | **Fix 9 honesty half** — no board reads bare FAB-READY; max = "FAB-READY — UNPROVEN IN HARDWARE". **REWORKED (Cursor FAIL-REWORK closed):** prefix-safe `_pcb_readiness_style()` helper replaces BOTH exact-key dicts (banner + `_sc_pcb`) → no KeyError on the disclosed string; live Excel formula now carries the UNPROVEN disclosure; proveCatch exercises the REAL consumer path (verdict never bare FAB-READY; style helper handles disclosed+garbage without exception). | ✅ | 1da05fa4d |
| P9b | **Fix 9 harness wire** — invoke deriveFirmwareProofSpecs + firmware_proof.py Tier-0 in pcb-stage per architecture board; set state.pcb.firmwareProof | ⬜ | |

## Form / vision (Terminal — Blender + render_vision_critic + composer)
| ID | Item | Status | SHA |
|---|---|---|---|
| V1 | Adversarial vision — rubric must FAIL 2150 04/00-hero Lego (instrument criteria + proveCatch on frozen PNGs); broken:false on catastrophe-only checklist must not allow Renders ≥8 for instruments | ⬜ | |
| V2 | Renders tab capped by authenticity/vision-adversarial, not "35/35 ledger coverage" | ⬜ | |
| B1 | Pack real part AABBs into the envelope (covariant, not roles-fill-a-box) | ⬜ | |
| B2 | Emit `functional_form/v1` proof | ⬜ | |
| B3 | Composer default-on for instruments | ⬜ | |
| B4 | Split lab_electronics families by function (one shared shell today) | ⬜ | |
| B5 | **Phenotype HARD gate** with aspect-ratio proveCatch (long-thin-guts-in-a-cube must FAIL) | ⬜ | |

## Drawings (Terminal — Pillar 3 E)
| ID | Item | Status | SHA |
|---|---|---|---|
| D1 | Interconnect edge-domain coherence. DONE: `edge_domain_verdict` (connection_sizing.py) — an indicator/optical endpoint wired to a thermal/fluid actuator (LED→Peltier), OR a 400/415V-3ph label between device parts → within_spec=False DOMAIN MISMATCH (interconnect gate counts FAIL). SIGHT-verified real 2150 LED→Peltier edge. proveCatch both directions. | ✅ | df93bea1d |
| D2 | Drawing gates: OOS/absent → `skipped` not `pass:true`; `all_pass` false if any in-scope drawing has major inspection defects | ⬜ | |

## Gate coverage
| ID | Item | Status | SHA |
|---|---|---|---|
| G34 | Gate 34 — additive-manufacturing marker family (FDM extruder/steps-per-mm). **Cursor ⚠ CLOSED:** gate-registry proveCatch now proves the additive family BOTH directions (b88d055b1: hot-end on bioreactor→HIGH additive_manufacturing; on fdm_3d_printer→[] suppressed). **Detect-only (SHADOW)** unless `TOOL_ARCHETYPE_ENFORCING`; registry prints "⚠ shadow/soft-by-default" — proves it CATCHES, not that it BLOCKS by default. | ✅ detect-only | 8c0cec9a5 + b88d055b1 |

## Source meta-root (Terminal — Pillar 4 F)
| ID | Item | Status | SHA |
|---|---|---|---|
| F1a | word-expansion: 'Cartridge Heater' no longer explodes into a pressure-vessel FILTER (regex precision + watt-scale skip). **Cursor ⚠ CLOSED:** proveCatch added (dc7d8579c) on real exported surfaces — `subAssemblyFamilyHeadFor` + extracted `WATT_SCALE_PLANT_ANATOMY_PART_RE` (one source of truth for explode-site + test); heater→no explode, filter→still explodes. | ✅ | a0dbdedc6 + dc7d8579c |
| F1b | geometry emitter: metre-scale part envelopes (Culture Vessel ⌀1.6 m, stirrer 1.5 m). **ROOT (not working-volume):** `_instrument_proxy_dim` (build_universal_scene.py) returned None for mechanical/fluidic parts (modules outside `_INSTRUMENT_SHAPE_MODULES`) → fell to PLANT `TYPE_DEFAULTS`. FIX: device-scale lab-mechanical noun rules + a universal envelope-relative backstop (never None for an instrument device). proveCatch instrument_proxy_selftest.py (11 cases). | ✅ | 85d936976 |
| F1c | cost engine: plant class_reference medians (£20k vessel / £5.38M actuation) → device-scale bands. SOURCE = `enrich-state-with-reference-anchor.tsx`: `isDeviceScaleProduct()` suppresses the bespoke-equipment band + any corpus median > £10k on a benchtop instrument. SIGHT-verified all 5 mis-anchors suppressed on frozen 2150. | ✅ | f2ff6a4c0 |
| F1d | electrical model: 400V 3ph incomer on a 35W device → single-phase 230 V. SOURCE = `sizeMainIncomer` (universal-contract-sizing.ts): watt-scale instrument + no derived transformer → vLine=230, phase-aware stamp. proveCatch main-incomer-selftest.ts. | ✅ | 3be10b5d6 |
| F1e | interconnect: DN25 pipe → micro-tubing for device-scale fluid loops. **🔴 Cursor afternoon audit FAIL-REWORK:** no-flow/compat fixed; authored small flow still DN ladder; `flow_to_m3s` unknown→m³/s; gate isInstrumentDevice-only. See `CURSOR-TERMINAL-AFTERNOON-AUDIT-2026-07-20.md`. | 🔴 REWORK | a7ababd45 |
| F1f | **Design identity / scale lock** (Cursor T8). **Layer 0 DONE (e4656ca0d):** `design-scale-tier.ts` `deriveDesignScaleTier`+`buildDesignIdentity` → immutable `state.designIdentity.scale_tier` (handheld/benchtop/cabinet/plant/field/unknown) from envelope+power+working-volume PHYSICS, wired at chain state-save; SIGHT-verified 2150→benchtop despite "heater"; proveCatch design-scale-tier-selftest.ts. **Layer 1 DONE (ca9f6452b):** `applyScaleVeto` + `PLANT_ONLY_TOOL_RX` in relevance-sweep.ts (aquaculture/RAS/pressure-vessel/irrigation/hvac-load/… hard-vetoed on handheld/benchtop identity, both cache+fresh paths, no-op on plant); `scaleTier` threaded from bootstrap-tool-plan (derived at tool-plan time). proveCatch f1f-scale-veto-selftest.ts. **Layer 4 DONE (fcd58d466):** gate-34 PLANT_SCALE_MARKERS (DN pipe/400V-3ph/backwash/skid/cooling-tower) + `isPlantScaleProduct` (reads designIdentity.scale_tier, else watt-scale) — fires on lab identity, suppressed on plant; proveCatch in gate-registry both directions; detect-only/shadow. **Layers 2–3 OPEN (refinements):** L2 scale-gated RAG/class-graph; L3 homonym-safe word-expand. F1f is load-bearing-complete (pin→prevent→detect). |
| F2 | Redundant Peltier + cartridge heater on ~1W duty → collapse to one thermal actuator | ⬜ | |
| F3 | Pump slot-mispin (Watson-Marlow tubing SKU pinned as pump) → reject | ⬜ | |
| F4 | confidence-honesty: no `confidence:high` on an admittedly-unfound MPN | ⬜ | |

## DB grow-loop (Terminal — Cursor A1–A8)
| ID | Item | Status | SHA |
|---|---|---|---|
| A1 | specs keyed source_type accept manufacturer_datasheet/stage0_harvest (2→15074) | ✅ | 60b743979 |
| A2 | price-ingest Node-22 ABI rebuild (better-sqlite3) + launchd pin + README | ⬜ | |
| A3 | weekly-component-sweep LaunchAgent (`com.forge.weekly-component-sweep`) | ⬜ | |
| A4 | timestamp columns (specs/standards created_at/updated_at) + `state.growingDb` + Excel last-updated surface | ⬜ | |
| A5 | material_prices live refresh (stale since 2026-05-30; fetchLivePriceGbpPerKg stub) | ⬜ | |
| A6 | split `SKIP_LIBRARY_WRITEBACK` (currently also kills cascade reads — surprise) | ⬜ | |
| A7 | class_reference_graphs web-on-miss | ⬜ | |
| A8 | prove-growing-db-loop harness (keyed hit ≫2 on a DB slice) | ⬜ | |

## Housekeeping
| ID | Item | Status | SHA |
|---|---|---|---|
| H1 | Commit Cursor advice docs (PCB-honesty, DB-and-form) as tracked source of truth | 🔎 | this commit |
| H2 | Keep this punchlist + inbox T1–T7 tracker current as items land | 🔎 | ongoing |
