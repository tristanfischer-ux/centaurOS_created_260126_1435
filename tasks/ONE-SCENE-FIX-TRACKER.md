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
- [x] **E. `ga_glance_coherence` re-pointed** — satisfied by drawing the REAL HMI parts in
      the audit's own conventions (display fill / button outlines / UI DECK).
- [x] ~~E-old~~ at real geometry instead of the form-rule
      OPTICAL / UI DECK / D-pad markers (I suppressed the markers; the gate still wants them).
- [x] **F. organoid VERIFIED** — 19/19 gates incl. G23; PNG opened; SVG measured
      (envelope top y=279.5 == vessel base y=279.5).
- [x] ~~F-old~~ 18/18 gates, drawing matches render by EYE (open the PNG).
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

## SOL AUDIT (2026-07-27) — items and status
SOL's verdict: "Directionally correct, but not proven." Full text:
  scratchpad/sol-audit-result.md ; implementation plan: sol-implementation-plan.md
- [x] **item 4 — manifest->SVG projection gate (G23)** DONE, commit 66e00f80d.
      The writer emits an audit rect from the SAME bounds it draws with + a per-view
      datum; the gate recomputes from the MANIFEST and compares. proveCatch fires on
      moved / resized / invented boxes; ABSTAINS (never silently passes) with no contract.
      Measured: organoid 36/36 pairs, colorimeter 31/31.
- [x] **item 2 — scope the containment exemption** DONE, commit a3b2d60ee.
      Blanket string exempted 10 rows, SEVEN of them interior parts below the lid.
      Now needs 5 proofs; exempt rows 10 -> 3 (vessel, vessel_collar, od_sensor).
      G19 REFUSES a manifest still carrying the retired string.
- [~] **item 3 — entity_type** partially: set on rows (bom_component /
      geometry_feature). SOL wants EVERY downstream consumer audited for filtering
      (cost, quantity, mass, wiring, labels, reconciliation). COST verified clean
      (BoM total unchanged GBP 291.00); the others are NOT yet audited.
- [ ] **item 1 — component_id replacing the noun regex.** SOL: "The regex alias should
      be removed, not broadened." HELD DELIBERATELY: his design makes missing/ambiguous
      identity FATAL, and landing that across 16 untested archetypes overnight could
      break the morning ship. Do it after the conformance matrix exists.
- [x] **item 6 — archetype sweep** DONE 2026-07-27, 13/13 clean (no duplicates, one build).
      NO PROJECTION FAILURES anywhere — G23 passes or abstains on every archetype, so the
      one-scene work broke no archetype's drawing<->manifest contract.
      Remaining failures by gate, none attributable to tonight:
        14 render_view_quality   — 17 washed-out/low-contrast + 13 missing product PNGs
                                   (the sweep re-bakes scene+drawings, NOT shaded renders)
         7 render_drawing_feature_coherence — the pre-existing optical-tower signature-family
                                   gap (see KNOWN PRE-EXISTING below)
         4 qty_coverage · 3 connection_sanity · 2 site_utilisation · 2 part_coverage
         2 load_reconcile · 1 material_diversity  — plant-drawing gates, untouched paths
         2 drawing_set_coherence — coverage floors; vertical_farm is a 5-part plant bake
                                   (5 parts in the earlier sweep too), not an instrument
      HONEST LIMIT: this proves no PROJECTION regression and that the failure CLASSES are
      pre-existing. It is NOT a clean before/after gate diff per archetype — the earlier
      sweep recorded shell/parts only, not gate results.

## KNOWN PRE-EXISTING (not caused by tonight's work)
- colorimeter `render_drawing_feature_coherence` "drawn-but-not-rendered: optical-tower".
  Its optical meshes are `u_se_instrument_story_*`, which `_exterior_signature_family`
  does not classify (it requires the `u_se_le_` prefix), so exterior_signature_features
  is null and the gate fires by construction on EVERY optical_handheld product.
- g12_legacy_hero_only_fires fails in drawing_gates --selftest, and failed at HEAD before
  today's work.

## G23 COVERAGE — what is and is NOT measured (2026-07-27)
MEASURED: instrument sheets on the faithful-projection path. The writer emits an audit
rect from the same bounds it draws with + a view datum (origin, ppm, model extents,
z_shift); G23 recomputes from the manifest and compares. organoid 36/36, colorimeter
31/31, lab_microscope 23/23.
NOT MEASURED: plant sheets. They route through _fit_product_parts_to_envelope which
applies a SCALE as well as a rebase, so the rigid-transform contract does not describe
them. G23 now ABSTAINS there ("no projection contract on this sheet") rather than
false-firing — it was reporting 33 bogus disagreements on powerwall. Extending the datum
to carry the fit scale would close this; until then plant drawings are unmeasured, which
is no worse than before today but must not be mistaken for a pass.
NOT MEASURED EITHER: the TOP and SIDE views — only FRONT emits audit rects so far.

## TWO GATE-DESIGN RULES EARNED TONIGHT
1. An exemption must require a CONJUNCTION of independently checkable facts, never one
   broad token, and must ship with a proveCatch where a NEARBY-BUT-WRONG member of the
   same family is REFUSED. (The blanket string exempted 7 interior parts.)
2. A gate that false-fires is as harmful as one that never fires — it trains you to
   ignore it, which is how the containment gate came to be trusted while blind. Where a
   contract does not hold, ABSTAIN VISIBLY rather than loosen the comparison.

## SOL ITEM A (component_id) — NOT APPLIED, precondition measured false (2026-07-27)

SOL's own instruction: "Do NOT apply A as written if either of these assumptions is
false: (1) a BoM `tag` uniquely identifies one logical component line within an
archetype; (2) every registered-signature prefix has exactly one known BoM tag. If
signatures can legitimately span multiple BoM lines, component_id = BoM tag is the wrong
identity model."

MEASURED, both false:
  (1) 224 of 412 archetypes with a BoM violate it. The duplicate is the PLACEHOLDER tag
      '—' (em-dash), repeated up to 146 times in a single BoM (bess-20ft). So
      `component_id = bom:<tag>` would mint one id for 146 different components.
  (2) the `vessel` noun pattern matches TWO rows on the organoid — X-103 "Culture Vessel"
      AND X-105 "Vial Holder Fixture" (because "vial" appears in the holder's name).
      Today the ORDERED alias table masks this: collar is matched first and consumes the
      mesh. The ambiguity is real and merely hidden by table order — which is exactly the
      mis-binding SOL predicted, now demonstrated rather than feared.

CONCLUSION: the BoM tag is not an identity. Before any component_id work:
  * decide what a component IDENTITY actually is when 146 rows share '—' — probably a
    minted stable id written back INTO the BoM at emit time, not derived from a tag;
  * the signature join must bind to that id at CONSTRUCTION (where the part and its BoM
    row are both in hand), never re-looked-up by noun afterwards;
  * only then is fatal-on-ambiguous safe to enable.
This is the measurement SOL's staged plan asked for; it says the design needs changing,
not just staging.
