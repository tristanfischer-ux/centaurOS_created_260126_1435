# Plan (d) — Design-to-Envelope: fit a design into a fixed building envelope

**Ask (Tristan 2026-06-12):** "create a way of putting a design into a specific building
envelope size, e.g. 40 ft hi-cube shipping containers. This should really find bugs and
would be massively useful." His view: "the Blender model needs to be able to go through
multiple iterations."

## 1. The shape of the problem
A physical **envelope** (a 40 ft hi-cube container: internal ≈ **12.03 × 2.35 × 2.70 m**;
a 20 ft ≈ 5.90 × 2.35 × 2.39 m; or an arbitrary building bay) is a hard SPATIAL
constraint. Today the engine sizes equipment then lays it out in the CAD with no fixed
outer box. Design-to-envelope inverts that: the design must **pack inside** the envelope —
and if it can't, the engine must **change the design** (modularise, restack, split into
parallel units) until it does. Same constraint-satisfaction iteration loop as (b)/(c).

## 2. Why this "finds bugs" (Tristan's instinct — high confidence)
This is the **most powerful sizing-bug detector available**, because it forces the
engine's equipment DIMENSIONS to confront a hard physical reality:
- The frozen-sizing bugs just fixed (absorber 900 mm, fractionation column 800 mm, the
  co2 9 m columns frozen at 1 t/day) would each have shown up instantly: "you claim this
  2× plant fits a 40 ft container, but the stripper is 8 m tall — it doesn't fit a 2.7 m
  box." A fixed envelope turns silent sizing errors into a **visible geometric
  contradiction**.
- It cross-checks the CAD bbox vs the engineering contract vs the mass — three sources
  that should agree. Disagreement (the `total_system_mass_kg` vs `total_plant_mass_kg`
  split, #86) becomes a fit/over-mass failure.
- It exercises the spatial layout (`build_universal_scene.py`'s `equipment_bbox_mm` +
  packing) under a real constraint, surfacing overlap/clearance bugs.

So (d) is a sizing/layout regression net dressed as a feature.

## 3. What already exists to build on
- **BESS containerisation** is already in the engine: `in_container_mass_kg`,
  `container_payload_rating_kg` (gate 30 Payload Rating Audit), `recommended_container_count`,
  the mass-aggregator's containerised vs field-erected branch. e-fuel already declares
  "modular skids + field-erected columns" + a road-transport limit. So the engine has the
  *concept* of fitting equipment into a transportable box — for ONE class. Generalise it.
- **The CAD bbox**: `build_universal_scene.py` computes `equipment_bbox_mm` + the scene
  bbox (`compute_scene_bbox`). That IS the design's footprint/height — the thing to test
  against the envelope.
- **The visual loop (b)** + `INSPECT_FRAME_SCALE`: the iteration scaffold + a render that
  can show the equipment INSIDE the drawn envelope (a container shell) per round.

## 4. The envelope spec (new input)
A small registry of standard envelopes + an arbitrary option:
```
ENVELOPES = {
  '20ft':            { L: 5.90,  W: 2.35, H: 2.39 },   // internal, m
  '40ft':            { L: 12.03, W: 2.35, H: 2.39 },
  '40ft-hi-cube':    { L: 12.03, W: 2.35, H: 2.70 },
  '45ft-hi-cube':    { L: 13.56, W: 2.35, H: 2.70 },
  custom:            { L, W, H, mass_cap_kg? },         // any building bay
}
```
Plus optional `payload_mass_cap_kg` (the container's gross-mass rating) and a
`door_clearance` for accessibility. The user picks an envelope (and how many they'll allow).

## 5. The fit-check (deterministic, the gate)
`envelope-fit-audit`:
1. From the CAD: equipment bounding box (L×W×H) + per-item footprints + total mass.
2. **Dimensional fit**: does the packed footprint fit `floor(L/envL) × …`? Does the
   tallest in-container item ≤ envH? (field-erected items — tall columns — are EXEMPT
   and listed separately, as e-fuel already does.)
3. **Mass fit**: in-container mass ≤ payload cap (reuse gate 30).
4. **Packing**: a 2-D (then 2.5-D with stacking) bin-pack of the containerisable
   equipment into N envelopes; returns `containers_needed` + a per-container manifest +
   any item that fits NO envelope (→ must be field-erected or the design must change).
Output: `{fits, containers_needed, tallest_item, over_items[], over_mass_kg}`.

## 6. The iteration loop (the "multiple iterations" Tristan wants)
```
design → CAD bbox + mass → envelope-fit-audit
   → fits in ≤ allowed containers?  ── yes → ship; CAD render shows the kit IN the box
        │ no
        ▼
   pick a packing/design operator (§7) → re-derive → re-CAD → re-fit  (cap N passes)
   → still no after N → "cannot fit envelope E" report (with the offending items)
```
Each round RE-RENDERS (the visual loop) so the dossier shows the equipment progressively
packed into the container — directly the "Blender model goes through multiple iterations".

## 7. The packing/design operators, ranked (least-destructive first)
| Operator | Move | When |
|---|---|---|
| **Repack / reorient** | denser 2-D layout, rotate skids, use the hi-cube height (stack) | first try — pure layout, no design change |
| **Field-erect the giants** | exempt items > envelope (tall columns, big reactor) → site-erected, only the SKIDS containerise | the e-fuel pattern; honest for process plants |
| **Modularise into N units** | split into parallel trains, each ≤ 1 envelope (e.g. 2×20ft) | the BIG move; "very different design" — more, smaller units |
| **Down-scale per-unit** | smaller per-container capacity → more containers | when even one train won't fit |
| **Re-spec for compactness** | plate-fin vs shell-tube HX, vertical vs horizontal vessel | targeted, gated by the process tools |

Modularise + field-erect are the workhorses for process plants; modularise + down-scale
for product/fleet classes (BESS already thinks in racks-per-container).

## 8. CAD + reporting
- `build_universal_scene.py` gains an `ENVELOPE` input: draw the container shell(s) around
  the packed equipment, colour any over-item red. The INSPECT render then literally shows
  "the design in the box" — the most legible possible proof it fits.
- Dossier: a "Containerisation / envelope fit" page — N × 40 ft hi-cube, per-container
  manifest, field-erected exceptions, utilisation %, and the packed CAD render.
- `envelope-convergence-report.json` {envelope, rounds, containers_needed, fits, operators[]}
  — reported alongside the engineering + visual convergence (W3.2 family).

## 9. Implementation phases
1. **P1 — envelope registry + fit-audit** (pure TS/Python on the existing CAD bbox + mass).
   Immediately a BUG-FINDER even before the loop: run it on every existing dossier, list
   what doesn't fit its claimed transport story.
2. **P2 — the 2-D/2.5-D bin-packer** (containerisable items → N envelopes + manifest).
3. **P3 — the design/packing operators** (§7) as contract transforms; reuse the (c)
   auto-adjust skeleton.
4. **P4 — the loop** + re-render per round (reuse visual_converge's render harness).
5. **P5 — CAD envelope shell** + the dossier page + the render-in-the-box.
6. **P6 — verify**: fit e-fuel 2× and a BESS into 40 ft hi-cubes; confirm the packing is
   physical (no overlap, ≤ payload), the field-erected exceptions are honest, and the
   render shows it. Cross-check: deliberately break a dimension and confirm the audit
   catches it (the regression-net value).

## 10. Risks / guards
- **Packing is NP-hard** — use a good heuristic (shelf/guillotine 2-D pack + height
  layers), not optimal; report utilisation, never silently drop an item that doesn't fit.
- **Don't fake the fit** by shrinking equipment below its engineering size — the envelope
  drives MODULARISATION (more boxes) or FIELD-ERECTION, never a physically-impossible
  shrink. The sizing gates (now incl. the un-frozen specs) keep dimensions honest.
- **Field-erected honesty**: process plants genuinely can't containerise a 12 m column —
  the report must say "3 × 40 ft skids + 4 field-erected columns", not "fits in 1 box".
- **Tie to (c)**: budget + envelope together = the real founder questions ("£20M, fits 2
  containers") — the two loops compose (run budget, then envelope, re-cost).
