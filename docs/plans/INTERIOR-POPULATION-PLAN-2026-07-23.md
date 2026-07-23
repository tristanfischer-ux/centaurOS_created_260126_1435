# Plan — coherent, populated sealed-instrument interior (the see-inside render) · 2026-07-23

## Problem
The translucent see-inside render (`08-product-ghost-shell.png`) shows a near-EMPTY interior (tower on
top + a gantry rail + 1 LED + 1 sensor), while the GA drawing (`ga-A1.pdf`) shows a FULLY-POPULATED
interior (PCB, UI deck, OPTICAL, + ~15 component boxes). They contradict. Root: the render
clutter-suppresses the 34 parts-manifest PROXY parts (the exact set the GA plots) because they are clay
placeholders, and builds only ~7 tiny `u_se_le_*` story meshes → empty. Drawer `forgeos_gotchas_3893cfc92e0fe812`.

## Goal
The see-inside render shows a **populated, recognizable interior** that is COHERENT with (a) the GA drawing,
(b) the real PCB board(s), (c) the wiring/routes — **universally** (any sealed instrument, keyed on part
function, never a per-product table), built **deterministically**, iterated with **render-only** loops
(NO full chain/excel run per iteration).

## Decisive insight — the manifest is the single source
`parts-manifest.json` already carries 34 real parts, each with `equipment_tag`, `name`, `shape`, `dims_mm`,
`pos_mm`. The GA drawing (`draw_ga`) plots THIS. So: build a recognizable SOLID interior mesh for EACH
manifest interior part, at its `pos_mm`, sized to `dims_mm`, keyed on its function-noun → the render is
coherent with the drawing BY CONSTRUCTION (same source), not by a second gate.

## Approach (deterministic, universal)

### A. Universal function→mesh library (the crux)
A pure `interior_component_mesh(part) -> mesh` keyed on the part's FUNCTION vocabulary (noun in `name` +
`shape`), NOT the product class. One recognizable primitive-assembly per function family; each sized to
the part's real `dims_mm` and coloured by a material role. Initial families (extend as new parts appear):
- vessel / vial / culture / reactor → capped cylinder (glass tint if "vial/culture", steel if "reactor")
- pump (peristaltic / dosing / diaphragm) → body box + circular rotor head + ports
- motor / stirrer / drive → cylinder body + shaft (+ magnetic stir plate if "stirrer")
- fan / blower → square shroud + hub + blades
- pcb / board → thin green board + a few dark SMD blocks + connector headers (see §C)
- heater / peltier / tec / thermal → flat plate + fin stack
- sensor / probe / thermocouple / optical detector → slim rod / small housing
- tubing / hose / line / manifold → swept tube (or short cylinder cluster)
- valve → body + stem/handle
- connector / port / usb / bnc → panel-mount jack block
- standoff / bracket / mount → small post (low visual weight)
- filter / vent → grille box
- led / indicator → small emissive dot
Fallback: a bevelled box (better than a raw proxy) for an unmatched function — and LOG it so the library
grows (the growing-coverage principle). Every family is keyed on a noun/shape signal, universal.

### B. Placement + de-clutter
- Place each interior mesh at the manifest `pos_mm` (the same deterministic layout the GA + routes use) →
  automatic drawing-coherence and wiring-alignment.
- STOP clutter-suppressing the interior parts on the see-inside/ghost path (they are now real components,
  not clay). Keep suppression only for genuinely-decorative/aggregator proxies if any. The exterior CLOSED
  product views (04-07) stay opaque + internals hidden (unchanged); only the ghost/cutaway see-inside path
  reveals them.
- The above-lid exterior signature (tower) is unchanged (G22 provenance set).

### C. Coherence with the PCB (real board, not a placeholder)
- The manifest has a PCB part (+ `u_se_le_pcb`); the PCB pipeline produces the REAL board(s)
  (`pcb-boards/*/pcb`, with real outline dims + placed components). The interior PCB mesh must reflect the
  DESIGNED board: use the PCB pipeline's board outline dims + component placement (or at least the board
  outline + a representative SMD cluster) at the manifest PCB position/orientation. So the see-inside PCB
  == the board in the PCB tab. RECONCILE dims: manifest PCB dims vs PCB-pipeline board dims must agree
  (flag if they diverge — same class as the render↔drawing coherence).

### D. Coherence with the wiring/routes
- `route-manifest.json` / `connection-ledger.json` / `wired-lengths.json` define part-to-part connections
  + drawn routes. Because components sit at manifest positions (the routes' own endpoints), ports align.
- OPTIONAL (raise interior richness + wiring coherence): render the DRAWN routes as thin dark conduits
  between component ports in the see-inside (only routes with `drawn=true`, matching P9/wired-lengths), so
  the customer sees the harness. Must not add stray 3-D pipes for logical-only routes (P9 rule).

### E. The deterministic iteration loop (NO chain/excel per iter)
Reuse the existing `out/organoid-for-simon/state.json` (no design re-run). Inner loop:
1. Edit the interior-geometry builder (function→mesh library + placement).
2. Render ONLY the geometry: fast — a clay/inspect pass or a dedicated geometry-dump (mesh bboxes +
   an EEVEE ghost preview) to check population + placement, ~1-2 min; the slow Cycles ghost only for a
   final SIGHT. `render-blender-scene.py --state <state> --out-dir <tmp> --force`.
3. SIGHT the see-inside AGAINST `ga-A1.pdf` (the reference — never in isolation): same component set?
   PCB where the drawing shows it? routes align? recognizable, not clay?
4. Refine → repeat until it "makes sense". Only THEN a single full render + excel + final SIGHT.

### F. The coherence GATE (systemic — folds into the render ship-gate)
Add an INTERIOR-coherence reject to the render ship-gate (the 5th class): the see-inside render's interior
component set must ≈ the GA drawing's interior component set (count + families), else REJECT (cannot ship
an empty see-inside against a full drawing). proveCatch on THIS session's empty ghost render (must FIRE)
vs a populated one (must PASS).

## Why NOT a workflow package (and where the council DOES help)
- The BUILD is ONE coherent deterministic geometry module + a function→mesh library — best built directly;
  fanning it across parallel agents would just create merge conflicts on the same file.
- The ITERATION is a tight render→SIGHT-vs-drawing loop — agents SIGHT poorly (proven this session); I drive it.
- The DESIGN (the universal function→mesh taxonomy; the PCB-reconcile + wiring-coherence architecture;
  the de-clutter safety) is a wide design space with real trade-offs → this is where the COUNCIL earns its
  keep (3 lineages catch blind spots). So: COUNCIL on the design → deterministic build → render-only loops
  → coherence gate → one final full render.

## Open design questions for the council
1. Function→mesh library: keyed on `name` noun vs `shape` field vs both? How to keep it universal + growing
   without a per-product table? Right granularity (how many families before diminishing returns)?
2. PCB reconcile: use the PCB-pipeline board outline+placement directly in the interior, or a faithful
   proxy? How to handle manifest-PCB-dims vs pipeline-board-dims divergence?
3. De-clutter safety: is stopping the 34-part suppression on the ghost path safe, or will it re-introduce
   sprawl/overlap? Do we need a containment/pack check on the populated interior first?
4. Wiring: render drawn routes as conduits in the see-inside, or leave to the drawing? Risk of clutter?
5. Iteration: fastest reliable geometry-only preview (clay vs EEVEE ghost vs bbox-dump) to avoid the 6.5-min
   Cycles pass every loop?
6. The coherence gate: best deterministic signal for "interior populated + matches drawing" (component
   count parity? family-set overlap? projected-area fill?) without false-firing on legitimately sparse
   instruments.

## COUNCIL VERDICT (6 seats: Gemini-3.1-pro, Grok-4.3, Kimi-k2.6, GLM-5.1, MiMo-2.5-pro, DeepSeek-v4-pro, 2026-07-23)
UNANIMOUS: manifest-sourced interior geometry is the correct universal approach (coherence by construction;
any second scene-graph re-introduces the split). But 4 BLOCKERS the naive plan missed:

- **GATE #0 (do FIRST, before any mesh code) — validate `pos_mm` are REAL 3D placements, not 2D GA-layout
  coords.** The #1 risk flagged independently by Gemini+Kimi+MiMo+DeepSeek: if positions were authored for
  the orthographic drawing (Z=0 stacks / symbolic offsets), rendering them in 3D floats parts outside the
  shell / overlaps / stacks on the floor while the set-equality gate still passes → physically-nonsense
  render. Cheapest guard: per-part AABB (`pos_mm`±`dims_mm`) must fit inside the enclosure interior volume
  (shell dims − wall). If >~30% fail → it's a manifest-authoring problem, fix that BEFORE the render work.
- **Parametric, not raw-scaled, meshes.** Applying a raw scale vector to a library mesh stretches it (fan→
  oval, motor→pancake). Generate each family parametrically FROM dims (cyl radius/length, board thickness),
  and normalise every library mesh ORIGIN to a known datum (bottom-centre) — manifest `pos_mm` may be
  centre-of-mass while a mesh origin is bottom-left → parts half-out of the case.
- **Controlled function taxonomy, NOT free-text `name`.** Key on universal regex rules on name
  (`/pump/i`, `/peltier|tec/i`, `/stirrer|motor/i`, `/vessel|culture|reactor/i`, …) → a `function_family`
  token; use `shape` only as a fallback/sanity primitive. Cap ~12–15 families; unmatched → bevelled box +
  COVERAGE_GAP log (the growth mechanism). Add invariant: visible-render-instance-count == manifest
  visible-part-count (so no "decorative override" list can ever re-fork the source).
- **De-clutter needs guards FIRST.** Do NOT just stop suppressing 34 parts. Required before enabling solid
  interior: (a) enclosure-bounds check (Gate #0), (b) pairwise AABB overlap/clash check (excl. mating
  standoffs/PCB) → flag/wireframe the clashing pair, don't hide silently, (c) visibility FILTER hiding
  fasteners (standoff/screw/washer/clip/bracket) so the view is legible, (d) unified stylized material so
  coarse parts read as deliberate not broken.
- PCB: pipeline board outline+placement is the AUTHORITY; OVERRIDE manifest dims; FAIL a `PCB_DIM_MISMATCH`
  gate if manifest vs pipeline diverge >~1–2mm (never silently stretch/clip). Directional parts
  (pump/fan/connector) need ORIENTATION — flag if absent.
- Wiring: DEFER (leave to the GA drawing). Media Tubing is already a manifest part so structural tubing
  appears anyway; individual wires = clutter, low gain. Nice-to-have Phase 2.
- Fast preview (unanimous): Blender EEVEE_NEXT / WORKBENCH viewport, ~half-res, no GI/denoise, +a
  bbox/object-index overlay to catch position/orientation errors → ~3–10s/iter vs 6.5-min Cycles. Cycles
  only for the final SIGHT.

## CHOSEN SEQUENCE (council + Cursor advice, both taken where they agree)
0. Commit the render-ship-gate hardening (already built, uncommitted) SEPARATELY first — clean tree,
   don't mix with interior work. Verify its proveCatch fires on the real bad images before committing.
1. GATE #0 first: write the enclosure-bounds + pairwise-clash check on out/organoid-for-simon manifest.
   SIGHT the result. If positions aren't 3D-valid, that's the real first fix (manifest authoring), full stop.
2. Smallest slice (Cursor): 4–5 families (pcb, vessel, pump/motor, peltier/heater, sensor) parametric +
   origin-normalised + visibility filter. Render-only loop (EEVEE half-res), SIGHT vs ga-A1.pdf each iter.
3. PCB from the real pipeline board + PCB_DIM_MISMATCH gate.
4. Only once ONE populated ghost SIGHTs coherent with the GA → add the interior-coherence ship-gate reject
   (defer per Cursor — a gate on the empty ghost just thrashes).
5. Wiring deferred. No chain/excel rebake during iteration; one final full render+excel at the end.

## GATE #0 RESULT (run 2026-07-23 on out/organoid-for-simon/parts-manifest.json) — CLEARED
33 interior parts: only 1 out-of-enclosure (the Heatsink Fan, 114mm tall poking ~1cm through the 126mm
lid — a minor containment case, handled by the existing clamp / signature-exemption class, NOT a 2D
authoring bug). z-centre spread min 626 / max 676 / stdev 8.9 → positions are GENUINELY 3D-varied, NOT
flat drawing coords. => the council's #1 risk (pos_mm are 2D GA-layout coords) does NOT apply here; the
manifest is a valid 3D placement source. The interior-population plan is viable as-is — proceed to the
smallest function→mesh slice (step 2). No manifest-authoring pre-fix required.
