# Session handover — 2026-07-12 (part 2) — Colorimeter to ≥9 floor

**Standing directive (Tristan):** the colorimeter dossier to a genuine ≥9 floor on EVERY tab. Everything universal (source-rule fixes keyed on signals, never per-product tables). All improvements in code.

## What landed this session (7 universal commits on `oxccu-efuel`)
1. `eef5928ef` — **Instrument/signal-chain ontology (keystone)**: `deriveInstrumentTopology` + `instrumentRole` (derive-topology.ts) — the missing 3rd axis beside process-plant + electrical-distribution. Builds source→element→sample→detector→conditioning→digitiser→compute→display + inlet/battery→regulator→loads from function nouns. parts_ledger.py mirrors it (signal parts→'instrument', power→'electrical'), gated on the authoritative `state.isInstrumentDevice` flag the chain sets when the deriver fires (enclosure_volume_m3<1 + no plant). Fixes 2 misclassifications (Firmware Storage→vessel, Display Panel→electrical).
2. `6f0e5f432` — **ledger-wiring** (removed `_drawing_only` so instrument edges reach the connection-ledger + single-line, not just drawings) + **optical capability metrics** (aggregator.ts `deriveOpticalInstrumentMetrics` emits optical_path_length_mm / wavelength_min/max as delivered quantities, gated on `hasOpticalInstrumentToolSignal`).
3. `d85981ad9` — **unit-family: length ≠ energy** (class-price-bands.ts `targetPerformanceValueAs`): added the length family + a cross-family guard. Was reading optical_path_length_mm=10 as **10 kWh** → cost-sanity applied the BESS £150-800/kWh band → **exit 32 hard-block**. This was the ship-blocker. CLAUDE.md bug #12.
4. `7c04a0758` — **HMI membrane keypad ≠ filtration membrane** (requirements_bom.py `_is_filtration_membrane` oracle): 'Interface Membrane' (hmi_ergonomics) was priced as an RO/UF element (£60 + £0 Nameplate).
5. `f1154f6dc` — **wire ALL power-conditioning parts** (derive-topology.ts): the 2nd power_conditioning sibling (Battery Charge Management Circuit) was orphaned — the only 2 remaining connectivity concerns.
6. `c9f047d3e` — **PCB readiness verdict as a LIVE formula** (build-excel-export.py): the bare "FAIL —" literal tripped `_enforce_live_check_gate` → **the whole workbook refused to save** (no dossier ever shipped). Now a nested-IF over 7 audit operands.

## PROVEN (opened the real artefacts — SIGHT)
- Connection-ledger: **28 contract edges** (was 0), full optical spine, **19/19 instruments associated**, `n_process_total: 0` (misclassifications gone). The Connection-trace TAB content is excellent — every part tagged (X-107…), ✓ OK, real inputs/outputs.
- exit-32 **gone** (unit-family fix held over a full run).
- Workbook **saves** (0 bare literals) after the PCB formula fix.

## THE MACRO SPEEDUP (use this — mempalace `drawer_forgeos_gotchas_0fcb32be088da5fb`)
Re-score/re-render STANDALONE against a frozen state.json — seconds, not 15-min chain runs:
- `python3 scripts/blender-universal/parts_ledger.py <dir> <dir>/state.json` — connectivity in 0.05s.
- `.venv/bin/python3 scripts/build-excel-export.py <dir> <dir>/out.xlsx` — full scorecard in ~27s. **MUST use .venv/bin/python3** (system python3.14 throws openpyxl MultiCellRange).
- build_universal_scene.py (Blender) re-render ~1-2 min.
- CAVEAT: **killing the chain mid-run corrupts state.json** (requirementsBom → 0 rows). Only iterate against a CLEANLY-COMPLETED run's state.
- Workflow: 1 chain run to SEED a good state → N fast standalone re-scores for Python-layer fixes → 1 final chain run to validate. TS contract/topology changes need a chain run.

## REMAINING to reach ≥9 floor (the real fails, from the consistent re-score)
- **Electrical single-line 2/10** — coverage 1/4: the 4 electrical parts (battery/USB/regulator/charge-mgmt) need to RENDER on the single-line drawing so tags match the BoM. The electrical_bus edges now exist in the ledger; the single-line generator (build_universal_scene draw_single_line / draw_panel_schedule) must draw the instrument DC power tree. (Python — fast harness.)
- **Overview 6/10** — capex-by-category chart sums only connections (£5,303) not the BoM grand total (£5,981); equipment categories (£678) missing. (Python — build-excel-export.py.)
- **Quantities 4/10** — 7/35 quantities lack a tool/formula lineage (provenance.py). My aggregator-sourced optical metrics + bootstrap-tool quantities may need lineage. (Python.)
- **BoM 7.0/10** — 21/28 ENGINEERED lines carry MPN 'TBD (detailed design)' — Stage 17.6 RAG-fill / grow the parts DB, or accept estimate-stage. (Deeper.)
- **Renders 4/10 + "big box"** — `place_sealed_enclosure` (build_universal_scene.py ~12040) renders skin parts as ~90%-of-face plates → a featureless box with a giant blank "display" panel. Needs instrument face composition (small display upper-front + cuvette port on top + button array), keyed on the instrument roles. HIGHER-RISK (shared with Powerwall 9.3) — iterate with standalone re-render. (Tristan flagged this twice.)
- **PCB 0/10 (honest FAIL)** — the board ROUTED but has 3 real DRC pad-overlap violations (U1 vs U6 dist=1.52mm). Real fix = better placement in pcb_pipeline_runner.py. (Deeper.)
- **Scorecard-representation inconsistency (task #24)** — some tabs display 0.0 (dossier-floor mirror) vs their own scores; json vs punchlist floors disagreed run-to-run. The connection-trace "0/10" is a floor-mirror, not its own score. Worth a deterministic-scorer pass.

## Next action
Final validation run `out/colorimeter-20260712-17xx` (all 7 fixes) is in flight. On completion: re-score, confirm the real floor-setters, then fast-iterate Electrical single-line → Overview chart → Quantities provenance → Renders, re-scoring standalone each time; one chain run only to validate a batch. Keep the Powerwall (9.3) unregressed — it never carries `isInstrumentDevice` (has energy-storage-plant signal) so it's byte-identical, but verify after any device-scale render change.
