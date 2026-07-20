# Macro program — living punchlist (single source of truth)

**Fixture:** `out/organoid-bioreactor-20260719-2150/` (frozen known-bad). Every item: SOURCE fix + proveCatch on 2150 + no `if organoid`. Update status + SHA as items land. Acceptance: re-scoring frozen 2150 → `ships=false`, PCB not FAB-READY, cost refuses, vision fails blockout; a fresh bake claims ≥8 only when the adversarial checks pass.

Legend: ✅ done · �doing · ⬜ open

## Scoring / verdict honesty (Terminal — build-excel-export.py + chain verdict)
| ID | Item | Status | SHA |
|---|---|---|---|
| S1 | Pillar 1 — bind selfAudit.blocking_defects + device-scale process_plant_vessel leak → ships=false, floor≤4 | ✅ | 6ff4ce411 |
| S2 | Cost ceiling → ex-works (oem) for device-scale bare unit-cost | ✅ | 897203942 |
| S3 | Brief `checked==0` → not 10 (cap ≤4) | ✅ | 80474b1db |
| S4 | **oem>ceiling → ships bind directly** in compute_verdict (cost HARD alone may not floor) | ⬜ | |
| S5 | **OOS tabs**: score=None, excluded from min_tab AND the "every tab ≥8" narrative; invert selftests ~28266/~31472 | ⬜ | |
| S6 | **Gate 32** £100–£5M/unit band → real per-class band; HIGH when output_family=unit & oem>ceiling | ⬜ | |
| S7 | **Single multi-axis ship card** (tab_floor/self_audit/oem/pcb_readiness/vision) — ships only if ALL pass; never announce from tab_scorecard alone | ⬜ | |
| S8 | Engineering Analysis empty table → not 10 (council M6) | ⬜ | |
| S9 | Council H9 — stability HARD metric requires derived `temp_stability_c`, not setpoint echo | ⬜ | |
| S10 | Council H10 — "bespoke fabrication to drawing" on catalogue/electronic families → UNRESOLVED, not satisfied | ⬜ | |
| S11 | Council M5 — BoM↔PCB identity reconcile (MCU real MPN in PCB vs "bespoke/FR4" in BoM) | ⬜ | |
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
| P9a | **Fix 9 honesty half** — no board reads bare FAB-READY; max = "FAB-READY — UNPROVEN IN HARDWARE" (reads state.pcb.firmwareProof.ok; discloses when no proof run) | ✅ | d94dce40c |
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
| D1 | Interconnect edge-label domain must match endpoint roles (`J-LED:VLED`→Peltier = FAIL; optical edge only optical↔optical) | ⬜ | |
| D2 | Drawing gates: OOS/absent → `skipped` not `pass:true`; `all_pass` false if any in-scope drawing has major inspection defects | ⬜ | |

## Gate coverage
| ID | Item | Status | SHA |
|---|---|---|---|
| G34 | Gate 34 — additive-manufacturing marker family (FDM extruder/steps-per-mm) | ✅ | 8c0cec9a5 |

## Source meta-root (Terminal — Pillar 4 F)
| ID | Item | Status | SHA |
|---|---|---|---|
| F1 | `isProcessPlantScale(state)=isProcessPlantClass && !isDeviceScaleDesign` consulted by word-expansion / geometry / electrical / cost / interconnect (kills plant-vessel leak, metre geometry, 3ph/25kVA, DN25 pipe, plant cost curve) | ⬜ | |
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
