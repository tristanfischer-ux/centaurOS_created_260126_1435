# Blender FPK — every sub-component from physics (FFF)

**Date:** 2026-07-29  
**Bar:** All drawing / cutaway components show ontology sub-parts sized from first-principles physics — not assembly blobs.

## SOURCE stack

```
fpk_first_principles.all_fpk_parts (48)
  + fpk_physics_tree leaves (function / equation)
  + fpk_concentric_geometry mm
  → build_universal_scene._place_traction_drive_pack_layout (+ _fpk_place_*)
  → form-meshes.json (meshes + ontology map)
  → fpk_blender_coverage.evaluate (proveCatch if missing)
  → traction_spine_manifest seats → GA / drawings
```

## Guard

`scripts/lib/fpk_blender_coverage.py` — every ontology part_id must match ≥1 `u_se_td_*` mesh (or explicit `deferred` with reason). proveCatch fires on incomplete coverage.

## Status (2026-07-29 re-render)

| Metric | Value |
|---|---|
| Ontology coverage | **48/48 (1.0)** |
| Meshes | **165** `u_se_td_*` |
| Mesh authenticity | **1.0** (residual cuboid 0) |
| New FFF parts | ring gear + teeth, magnet×N, motor shaft, covers, flanges, seals, oil, diff internals, split gate-drive/control PCBs |
| Twin stamp | `JLR-FE-FRONT-FPK-BLENDER-COVERAGE.json` + state.fpkBlenderCoverage |

## Non-goals

- Lucid STEP paste  
- Claiming FEA-true tooth microgeometry (seeds + readable tooth cues only)  
- Exterior 04 showing guts (cutaway/ghost only — keep-list unchanged)
