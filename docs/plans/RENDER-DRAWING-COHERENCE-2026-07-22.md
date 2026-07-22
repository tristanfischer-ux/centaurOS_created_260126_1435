# Universal cross-artefact geometry-coherence system (2026-07-22)

## THE REAL REQUIREMENT (Tristan, 2026-07-22 — a permanent engine invariant, not a one-off)
"You need to be automatically doing this, and this should be written into the software itself so it automatically does it. I should never have to ask for this kind of thing. ALL the drawings need to be completely consistent with each other. And this needs to be a UNIVERSAL fix."

Translation: every geometric artefact in a dossier — the Blender **render** (00-hero, 04-07 product views, inspect-*), **every engineering-drawing view** (FRONT / TOP / ELEVATION / GA / assembly / exploded / interconnect layout), the **Equipment & Dimensions Register**, and the **parts-manifest** — MUST agree, on EVERY run, for ANY archetype. The engine must ENFORCE this itself and FAIL (floor the dossier) when they disagree. A human must never again catch a cross-artefact inconsistency by eye.

## THE ARCHITECTURE (the SOURCE fix, universal)
1. **ONE canonical geometry model = the single source of truth.** The placed-parts scene (each part's AABB + world position) + the derived enclosure envelope. The parts-manifest already is (or should be promoted to) this canonical model.
2. **Every artefact DERIVES from that one model** — it may not compute geometry independently:
   - the sealed-enclosure RENDER's shell/silhouette is sized FROM the canonical envelope (so it contains the parts and shows any protruding module);
   - every DRAWING view is a projection OF the canonical model;
   - the Equipment & Dimensions Register reads the canonical dims.
   Wherever an artefact currently derives geometry on its own (the render shell computed 138x66x34 while the parts occupy 229x175x96), route it through the shared model.
3. **A UNIVERSAL cross-artefact COHERENCE GATE**, permanent, runs every bake, wired into the chain + Checks so a mismatch floors the dossier. It cross-validates, for EVERY artefact pair, within tolerance:
   - **envelope** WxDxH equal across render + all drawing views + dimensions register;
   - **part set** — same parts present in each (no part in the drawing missing from the render, no phantom);
   - **containment** — enclosure shell contains every part AABB;
   - **key part positions** consistent across the projection views.
   proveCatch BOTH directions (a coherent design passes; the incoherent organoid — render 138x66x34 vs parts 229x175x96 — FAILS). Universal: no per-product table, keyed on the canonical model.

## THE FIRST DEFECT that exposed the gap (organoid benchtop bioreactor)
Render sealed shell 138x66x34 mm; drawing labelled 138x66x82; parts-manifest bbox 229x175x96. Parts don't fit the rendered box; the optical module protrudes in the drawing but not the render; the render only looked tidy because the containment clamp HID the sprawl (masking, not fixing). This is ONE instance of the universal gap.

## LOOP (build the permanent system, then prove it) — DONE only when:
- The universal cross-artefact coherence gate EXISTS, is wired into the chain (runs every bake, floors the dossier on mismatch), and has a proveCatch both directions.
- Every artefact derives from the ONE canonical model (render shell sized from the envelope; drawings + register read the same).
- On a fresh organoid bake: the gate PASSES, and a human SIGHT of render-vs-every-drawing shows the SAME product (envelope, optical module, parts contained).
- The fix is UNIVERSAL (verify the gate fires on a synthetic incoherent case and passes a coherent one, not organoid-specific).
- Dossier stays floor >=9, Checks FAIL=0.
Then: write the invariant into the operating frame + regression harness so it can NEVER regress; save the principle to memory; handover; STOP.

## Building blocks (iterate)
- [in flight, agent ab805a17] containment gate (enclosure contains parts) + reconcile render shell to parts envelope — building block #1.
- next: promote parts-manifest to the canonical model; route the render-shell sizing + drawing views + dimensions register through it; generalise the gate to cross-check ALL artefact pairs (envelope + part-set + positions), wire into the chain/Checks; proveCatch on a synthetic incoherent case (universal).

## PROGRESS (2026-07-22 ~17:15)
- **Building block #1 LANDED `7c457292a`**: root was the mechanical-part footprint table missing the HEIGHT dim → enclosure height came from a 0.42×min(w,d) heuristic that ignored the tallest part (96mm heatsink+fan). Now enclosure = max(body_h, floor, tallest_part+2×clearance): organoid 240.9×182.8×108 ⊇ parts 229.2×175.2×96.4. + **G19 enclosure_shell_contains_parts gate** (10mm tol, proveCatch both ways, FIRES on the 1603 defect). Universal, parts-keyed.
- **Deliverable bundle LANDED `c8386e52f`**: every run now writes <run>/<slug>-deliverable/ + .zip (dossier + all PCB boards + renders + drawings + MANIFEST, 0 absolute paths). Verified on 1603 (87 files). (84MB — offer compressed/PCB-only variant for direct email.)
- **loopbake9 running** (stale .pyc cleared) → verify render + drawings read the SAME 240.9×182.8×108 envelope end-to-end + G19 PASS + floor ≥9 + bundle produced. SIGHT render vs inspect-front/top side by side.
- STILL TO BUILD (the full universal system): promote parts-manifest to canonical model; route drawing views + Equipment&Dimensions Register from it; generalise gate to cross-check ALL artefact pairs (envelope + part-set + positions), wire into chain to FLOOR on mismatch; write invariant into OPERATING-FRAME + regression harness.

## PROGRESS (2026-07-22 ~19:15) — G19 GATE WORKS; reconciliation attempt #1 did NOT reach delivered value
- **G19 is functioning as the permanent guard** — bake 1848 SIGHT: G19 `enclosure_shell_contains_parts` correctly FIRED on general-arrangement AND renders (delivered shell 221×165×82 < parts 229×175×96; height short by 14mm). The gate catches the incoherence on the DELIVERED artefact = exactly what we want. It also floors the dossier (drawing gate fails).
- **BUT the reconciliation (7c457292a, minimum_working_envelope.py → 240.9×182.8×108) did NOT reach the delivered shell** — the render + GA still use 221×165×82. minimum_working_envelope's output is OVERRIDDEN by another sizing path (the "fix didn't reach delivered value" trap, 3rd time this session). The delivered 82mm height ignores the 96mm heatsink+fan.
- Attempt #2 (agent a82c940a): TRACE where the delivered 221×165×82 actually comes from (the path render+GA read), fix THAT, verify against the delivered path not a selftest. If it misses → 6-model council.
- Killed bake 1848.
