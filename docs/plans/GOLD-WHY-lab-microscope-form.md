# Gold WHY → universal lab microscope / flexure-stage form

**Training artefact:** OpenFlexure-class microscope (`out/_gold-openflexure-repo` @ v6.1.5, showcase `out/_gold-openflexure-showcase/`).  
**Not a cheat sheet:** no gold MPNs in emitters. Rules key on `lab_microscope` form signals — never `if product == openflexure`.

## Why the gold kit is structured this way

| Gold choice | Engineering WHY | Universal rule |
|---|---|---|
| Cream / white additive-manufactured body | Low-cost structure without machining; polymer is the product face | Form family is **OPEN printable**, not sealed charcoal handheld |
| Sample stage on top of body | Biological slide / vessel access; optics look up (inverted path) | **Stage platform + slide** above body |
| Three geared stepper actuators (X/Y/focus) | Independent axes; flexure kinematics from printed hinges | **≥3 actuator towers** with stepper + leadscrew stems |
| Optics tube / camera under stage | Inverted optical path; RMS / webcam interchange | **Optics tube** mesh under stage |
| Illumination arm + condenser above | Transmitted brightfield; heat away from sample | **Illum arm + condenser + LED** |
| Side SBC / motor controller board | Stage + camera + API on one compute stack | **SBC FR4 cue** on body side |
| Benchtop envelope ~200×180×240 mm | Printed-stage research class, not plant cabinet | `lab_microscope_envelope_mm()` |

## Coded surfaces

1. `instrument_form_grammar.py` — `is_lab_microscope_form`, envelope, checklist, cams, `FORM_FAMILIES`
2. `build_universal_scene.py` — `_place_lab_microscope_layout` (no sealed crate)
3. `form_render_glance.py` — cream body + dark mech; charcoal handheld FAIL
4. `product-classifier.ts` / engineering-contract — `lab_microscope` + HARD slots
5. `gold_cost_band.py` — materials ±15% of ~£198 kit midpoint
6. Encode backlog — `docs/plans/UNIVERSAL-ENCODE-CHECKLIST-2026-07-16.md`

## proveCatch map

| GOLD-WHY row | Guard | Where |
|---|---|---|
| Class / alias → form | `is_lab_microscope_form` | grammar `_selftest` |
| Cream body ≠ charcoal | glance `NO_CREAM_BODY` / `SEALED_CHARCOAL_HANDHELD` | `form_render_glance._selftest` |
| 3 actuators + optics + illum | `lab_microscope_checklist_ok` | grammar `_selftest` |
| Materials ±15% | `MATERIALS_OVER_BAND` | `gold_cost_band._selftest` |
| No BLENDER_UNIVERSAL_FALLBACK | `form-meshes.json` present | render-quality audit |

## Fast loop

```text
frozen state.json (class=lab_microscope)
  → Blender build_universal_scene
  → form-meshes checklist + form_render_glance --form lab_microscope
  → adjust LM_* constants OR fix SOURCE
  → regen drawings from Blender
```

Full chain relaunch only after checklist + glance pass.
