# Render ↔ Drawing geometry coherence loop (2026-07-22)

## THE DEFECT (Tristan caught it by eye; my ≥9 scoring was blind to it)
The sealed exterior RENDER and the assembly DRAWING disagree on the product's size/shape — three different dimension sets for the same product:
- Render enclosure (sealed SHELL, what the render draws): **138 × 66 × 34 mm** (flat)
- Assembly drawing labelled envelope: **138 × 66 × 82 mm**
- parts-manifest bbox (drives the DRAWINGS): **229 × 175 × 96 mm** (parts sprawl beyond the shell)

Consequences a chartered engineer rejects:
1. The parts shown in the drawing (96mm tall, 229mm wide) would NOT fit inside the flat 138×66×34 box the render shows.
2. The optical module protrudes in the drawing; the render is a uniform flat lid with no bump.
3. The render looks tidy only because the containment clamp HID/clamped the sprawl; the drawing plots parts at their real (larger) extent.

## ROOT
- Render (`place_sealed_enclosure`, build_universal_scene.py) uses the enclosure SHELL dims.
- Drawings (`generate_drawing_set.py`) use the parts-manifest bbox (real part extent).
- NOTHING cross-validates them; the containment clamp masked the render but not the drawing.
- Likely the real fix: size the enclosure to genuinely CONTAIN the packed parts (grow the shell, or pack part AABBs into the envelope) so ONE reconciled envelope drives BOTH artefacts, and the render silhouette reflects the true product (incl. optical protrusion). This is the known "pack real part AABBs into envelope / phenotype HARD gate" long-pole.

## OBJECTIVE (loop until CONSISTENT)
A. Reconcile geometry: enclosure shell ⊇ parts-manifest bbox (±small tol), and render + drawings read the SAME envelope. Real benchtop bioreactor ~200×150×150mm is plausible; the 138×66×34 flat shell is unrealistically small for the parts.
B. Add a DETERMINISTIC coherence gate: `render/enclosure outer bbox ≈ drawing/parts-manifest envelope` (and enclosure CONTAINS all parts) → FAIL if they disagree beyond tolerance. proveCatch both directions. Wire into the ⚠Checks / drawing-gates so a mismatch floors the dossier.
C. Loop: fix → bake → run the gate + SIGHT the render vs the FRONT/TOP drawing side-by-side → repeat until the gate PASSES and they visually match (same silhouette, optical bump present in both, parts fit).

## DONE = the coherence gate PASSES on a fresh bake AND a human SIGHT of render-vs-drawing shows the same product (proportions, optical module, parts contained) AND the dossier stays floor ≥9.
