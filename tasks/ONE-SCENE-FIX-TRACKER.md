# ONE-SCENE FIX — overnight tracker (started 2026-07-26 ~21:30)

**Tristan's requirement (verbatim):** "The blender image should be the image that is the
canonical image, and the bill of materials and everything associated with it should be
linked to the blender image. The drawings should follow it, so there should never be any
difference between the two. There should not be two Blender images."

Plus the loop: "The bill of materials should inform what goes in the Blender, but the
Blender will tell the bill of materials how long all the wires are. That goes back into
the Blender, and then the Blender is redone again based on all the new information."

**Mandate:** full complete fix, working overnight, autonomously.

---

## ROOT CAUSE (established, evidence in drawer forgeos_decisions_a80597668dda95ed)

`build_universal_scene.py`: `_SEALED_HERO_PRODUCT = not _INSPECT_MODE` gated a 1344-line
block building ALL exterior geometry. parts-manifest.json is exported in the INSPECT pass
→ it never saw the vial / OD heads / fascia. Probed: INSPECT=1 had 7 `u_se_le_*` meshes and
NO vial; INSPECT=0 had `u_se_le_vial` at z408..503.

Consequence: every exterior feature needed a hand-written reconstruction formula, and each
un-written one was a silent render↔drawing divergence. One bug PER feature, forever.

---

## PLAN

- [x] **A. One scene.** Extract the 148-line vial_bioreactor signature branch into
      `_build_vial_bioreactor_signature(fl,W,D,H,base_z,_skin_mod,MO,tt,_fy)`; call from BOTH
      passes; INSPECT builds with `hide_render=True`.
      VERIFIED: INSPECT pass 7 → 23 `u_se_le_*` meshes incl. vial 408..503, od 441..470,
      face_display, face_panel. **UNCOMMITTED.** Backup: `/tmp/bus_before_split.py`.
- [~] **B. Manifest carries signature meshes as ROWS.** DONE for families with a BoM
      counterpart (alias table in build_parts_manifest sets bbox + placed_xyz_mm +
      dim from the DRAWN mesh; families do not double-consume). REMAINING: families
      with NO BoM part (face_display, face_key_* buttons, ui deck) still never become
      rows — that is what the last gate is failing on.
      OLD: Currently rows are created only for
      BoM parts, so the geometry exists but never reaches the drawing. Gates report
      "rendered-but-not-drawn: hmi-fascia, optical-tower, sample-port".
- [x] **C. Stamp those rows** DONE — `exterior_signature_mesh`; containment PASSES.
- [x] ~~C-old~~ `geometry_source` so G19 exempts genuine above-lid features
      (currently: parts 162 mm vs shell 108 mm).
- [x] **D. Reconstruction formulas DISABLED** (vessel + OD seats). Alias alone now gives
      vessel 408..503, OD 441..470, collar 408..421, fascia 313..356 — all matching the
      render. Delete the dead functions once G is green.
- [x] ~~D-old~~ `_exterior_signature_vessel_bbox_mm` and
      `_exterior_signature_od_bbox_mm` + their seating calls. If B works they are dead code,
      and deleting them is what makes the divergence structurally impossible.
- [ ] **E. Re-point `ga_glance_coherence`** at real geometry instead of the form-rule
      OPTICAL / UI DECK / D-pad markers (I suppressed the markers; the gate still wants them).
- [ ] **F. Verify organoid:** 18/18 gates, drawing matches render by EYE (open the PNG).
- [ ] **G. Re-bake all archetypes** through the new path; confirm no regression
      (colorimeter is the key case — no above-lid geometry, must keep the form rule).
- [ ] **H. Rebuild the Excel** and re-score.

## RULES FOR THIS RUN (learned the hard way today)
1. A green gate is NOT evidence — OPEN the rendered PNG before claiming anything.
2. Gates score the MANIFEST, not the drawing. They cannot see a sheet that misrepresents it.
3. Verify by probing the live scene, not by reasoning from stored state.
4. Do not claim a score. Report what was measured.

## STATE LOG (newest last)
- 21:30 A done+verified, uncommitted. 3 gates failing (expected — B/C/E outstanding).
- last green commit: 82fcfb984
- 22:5x  B(partial)+C+D done. Gates 3 failing -> 1 failing.
  * containment PASSES (shell 180x242x108 contains 137x251x84)
  * render_drawing_feature_coherence PASSES (real OPTICAL/SAMPLE PORT/VESSEL labels
    now on the sheet, drawn from real above-lid parts)
  * LAST GATE = ga_glance_coherence, 3 sub-findings, all HMI:
      ui_deck<1 AND display_fill<1 ; small_none_rects<4 (D-pad) ;
      needs BOTH data-glance front-display AND front-ui-deck/label
    Root: u_se_le_face_display / u_se_le_face_key_* are REAL meshes in the scene but have
    no BoM part, so they never become manifest rows -> the drawing cannot draw them.
    NEXT: finish B — add manifest ROWS for signature families with no BoM counterpart.
