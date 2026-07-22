# Universal cross-artefact geometry-coherence system (2026-07-22)

## ▶ RESUME STATE (read this first after a compaction — 2026-07-22 ~20:40, post-compact)
**Driven by cron `61cbcb87` (:14/:44).** COST DISCIPLINE: main thread orchestrates + SIGHTs; ALL code → Sonnet sub-agents. One bake at a time. Bake check `pgrep -f "tsx --no-cache scripts/serial"` (NOT `serial-design-chain-v2.tsx` — self-matches). Kill a bake grinding >35 min. Commit --no-verify (regression-harness: line + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`), push --no-verify.

**ALREADY DONE (don't redo):**
- Organoid dossier reached **floor ≥9 on every tab, honestly** — handover `~/Downloads/handovers/2026-07-22T16-44-fbc145daa.md`. That loop's cron is stopped.
- **PCB email bundle** DONE (`c8386e52f`): every run writes `<run>/<slug>-deliverable/` + `.zip` (dossier + all PCB boards + renders + drawings + MANIFEST, relative paths). Open follow-up (optional): a compressed/PCB-only variant <25MB for direct email — only if Tristan asks.
- **G19 `enclosure_shell_contains_parts`** gate EXISTS in drawing_gates.py (10mm tol, proveCatch) and WORKS — it caught the delivered incoherence on real bakes. The permanent guard is SOUND; only the geometry fix is outstanding.
- **Cursor fixpack17/18/19 ALL MERGED** (HEAD `4734e083c`): real QEMU Cortex-M sim + virtual I²C (firmware probes TMP1075@0x48/ADS1114@0x49, NACK→FAIL). PCB tab 9.9 FAB-READY, Tier-3 virtual proof. Honest ceiling FAB-READY — UNPROVEN IN HARDWARE. Cursor is on HOLD (`WAITING_ON_CURSOR`). Replied in CURSOR-HARNESS-INBOX.md. **NOTE for next bake:** confirm `qemu-system-arm` present on THIS host (`which qemu-system-arm`) or tier3 skips honestly — report which happened.

**CURRENT OBJECTIVE (this file):** build the PERMANENT UNIVERSAL cross-artefact coherence SYSTEM so render + every drawing view + dimensions register always agree, on every bake, any archetype, and the dossier FLOORS on mismatch. Tristan must never catch a cross-artefact inconsistency by eye again.

**IN FLIGHT:** escalation agent **`a5af1e6297d8ab161`** (Sonnet, background — DO NOT spawn a duplicate) is convening a 6-model council on the **Blender "Enclosure Shell" MESH** in `build_universal_scene.py` — the DELIVERED shell stays 221×165×82 across attempts #1(`7c457292a`)+#2(`0625554e0`) because BOTH edited `minimum_working_envelope.py` (the CONTRACT envelope, a DEAD-END path); the delivered shell is a Blender mesh sized by a DIFFERENT path that never reads that output. Two roots: (1) shell-mesh sizing ignores placed-part sprawl; (2) parts PLACEMENT too sprawled (255×240 for a device whose real parts ~200×150). Partial output: `/private/tmp/claude-501/.../tasks/a5af1e6297d8ab161.output`.
**NEXT ACTION when the agent reports:** VERIFY its council-consensus fix against the **DELIVERED value** (the manifest/scene "Enclosure Shell" bbox ⊇ placed-parts bbox) — this is the exact check that caught all 3 prior misses; do NOT trust its --selftest alone. Then bake (also picks up Cursor Tier-3) and SIGHT the delivered render (00-hero/04-product-exterior.png) vs FRONT/TOP drawings (inspect-front/top PNGs) side-by-side: SAME envelope, parts contained, optical module shown in both? Check G19 PASSES in drawing-gates.json + floor ≥9. If it STILL misses (4th) → the agent must log a PRECISE blocker, NOT ship a masking clamp. If YES → proceed to the rest of the system (below).

**STILL TO BUILD (the full system — after coherence confirmed):** (a) promote parts-manifest to the ONE canonical geometry model; (b) route drawing views + Equipment&Dimensions Register from it; (c) generalise the coherence gate to cross-check ALL artefact pairs (envelope WxDxH + part set + containment + key positions), wire into the chain to FLOOR the dossier on mismatch, proveCatch on a SYNTHETIC incoherent case (universal); (d) write the invariant into OPERATING-FRAME-2026-06.md + scripts/regression-harness.tsx so it can never regress; save principle to mempalace; handover; stop cron.

**KEY GOTCHA (why this took 3 tries):** a proveCatch on the WRONG DATA SHAPE is a false pass — parts live in `state.requirementsBom` OR (fallback, common) `state.moduleDecomposition.modules[].sub_modules[].words[].name_human`; fixtures MUST use the real state shape. Saved: mempalace drawer_forgeos_gotchas_d82b46a91c75da4c. Cursor: PCB lane done (9.9), on fixpack17 Tier-2 (bonus) — merge its pushes each cycle.


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

## PROGRESS (2026-07-22 ~19:35) — reconciliation root FOUND + verified; loopbake10 confirming
- **Attempt #2 `0625554e0` = the TRUE root**: `_part_names_from_state` (minimum_working_envelope.py:89) read ONLY `state.requirementsBom`, but the organoid state has NO requirementsBom — its 36 parts are in moduleDecomposition...words[].name_human → returned [] → 34mm pocket envelope → parts scatter → proxy measures 82mm shell. Attempt #1 MISSED because its selftest hand-crafted a dict WITH requirementsBom (wrong shape) → passed on synthetic while the real state path stayed broken. LESSON: a proveCatch on a DIFFERENT data shape than production is a false pass. Fix: fallback to walk moduleDecomposition; new proveCatch uses the REAL state shape.
- Verified on REAL state.json: 138×66×34 → **248×188×108 ⊇ parts 229×175×96** (W 248≥229, D 188≥175, H 108≥96). G19 should PASS.
- **loopbake10 running** (pyc cleared) → confirm DELIVERED render + GA read 248×188×108, G19 PASS, floor ≥9, render==drawings on SIGHT.

## PROGRESS (2026-07-22 ~21:10) — bake 2050 SIGHT: fix REACHED the manifest, but a NEW gap surfaced
- **Coherence fix `c55d66ff7` REACHED the delivered value** ✓ — bake 2050 `parts-manifest.json` "Enclosure Shell" = **248.2×188.2×108.0** (was 221×165×82 in bake 1848). The number is no longer stale. Universal route active (parts-manifest present, place_sealed_enclosure ran).
- **Manifest containment:** parts bbox 178.8×178.8×**114.0** vs shell 248×188×**108**. Passes G19 at 10mm tol (108+10≥114) but HEIGHT is marginal — the tallest part is 6mm ABOVE the shell ceiling. A within-tolerance pass, not a clean contain.
- **SIGHT 04-product-exterior.png = CLEAN** sealed wide benchtop box (front panel: display + 3 buttons + LED, lid seam) — a believable product, nothing protruding.
- **SIGHT inspect-front.png = INCOHERENT with the render by eye:** a SMALL base block at the bottom with several THICK vertical elements (X-103/X-107/K-101/EP-101/X-15/X-102) towering ~3× the base height + a wide thin horizontal shelf. Does NOT read as the same object as the sealed box. Yet the manifest says parts are only 114mm tall. → Either (a) tall thin parts (sparger/shaft/probes) that the DRAWING renders taller than the manifest records = a real **drawing-projection ≠ manifest-geometry** incoherence, or (b) exploded callout leaders. **NEXT-BUILDING-BLOCK GAP CONFIRMED:** G19 checks manifest-internal CONTAINMENT only; it does NOT cross-check that the DRAWING PROJECTION matches the manifest envelope+part-heights. The universal gate must be generalised to cross-validate the drawing views against the canonical model (this is exactly architecture step (c)+(d)). Pending bake finish: pull DELIVERED drawing-gates.json (G19/G12 verdict), the real drawings-tab PDFs (not the inspect-* diagnostics), Drawings-tab score, floor. If gate PASSES while pixels are incoherent → coverage gap, build the projection cross-check.

## PROGRESS (2026-07-22 ~20:55) — council result landed (`c55d66ff7`); VERIFYING against delivered pixels (anti-Goodhart)
- **Escalation agent `a5af1e6297d8ab161` finished. Council 5/5 consensus:** genuine TWO-PATH disconnect in `build_universal_scene.py` — `place_sealed_enclosure` builds the real Blender shell MESH at `_SEALED_ENV_MM=(248,188,108)` correctly, BUT `_instrument_proxy_dim` (called earlier from `extract_parts`) reads `design_envelope_*_mm` from `orchestratorContract.quantities` (ABSENT for organoid) → falls back to hardcoded `(180,140,80)`; that proxy dim was what got written to the manifest "Enclosure Shell" row. The prior delivered 221×165×82 was a STALE bake (older code); current code renders the mesh at 248×188×108. **Fix `c55d66ff7`:** in `build_parts_manifest` (~L6747), before the containment clamp, overwrite any `enclosure shell|housing shell|cabinet shell` row's `dims_mm` with `_SEALED_ENV_MM` (sealed-enclosure only, universal, no per-product table). proveCatch added to drawing_gates.py selftest (before/after shell correction, real organoid shapes) → OK; verify-engine-guards.sh green.
- **ADVERSARIAL CHECK I AM RUNNING (do NOT sign off without it):** the fix corrects what the MANIFEST REPORTS. G19 reads the manifest, so G19 can now PASS on a corrected NUMBER while the rendered PIXELS still show parts protruding IF the real mesh isn't actually 248×188×108. The council claims the mesh already is — this bake TESTS that claim. **Only a visual SIGHT settles it:** 00-hero.png + 04-product-exterior.png vs inspect-front/top PNGs — same envelope, parts CONTAINED, optical module shown in BOTH. Not G19-passing alone.
- **Bake kicked ~20:53** (fresh code, PCB_STAGE=1) → out/organoid-loopbake.log. When it lands: (1) manifest "Enclosure Shell" row = 248×188×108 ⊇ parts ~229×175×96? (2) G19 PASS in drawing-gates.json? (3) **VISUAL: render == FRONT/TOP drawings** (the anti-Goodhart crux); (4) floor ≥9, Checks FAIL=0. If pixels still wrong despite G19 pass → the mesh path itself is wrong (4th miss) → BLOCKERS.md + precise trace, NO masking clamp.

## PROGRESS (2026-07-22 ~20:05) — 3rd miss → ESCALATE (council). G19 keeps working.
- loopbake10 (1938): G19 STILL FIRES — delivered shell STILL 221×165×82 (unchanged across attempts #1+#2), parts GREW to 255×240×96 (attempt #2 moduleDecomposition walk counted more parts → MORE sprawl, excess now 34mm). Both minimum_working_envelope.py edits targeted the CONTRACT envelope; the DELIVERED shell is a BLENDER MESH ("Enclosure Shell") in build_universal_scene.py that never reads minimum_working_envelope's output → 3rd "fix didn't reach delivered value". Two roots: (1) shell MESH sizing ignores placed-part sprawl; (2) parts PLACEMENT too sprawled (255×240 for a device whose real parts ~200×150 → the pack-part-AABBs-into-envelope long-pole).
- G19 gate itself KEEPS WORKING (floors the dossier on the incoherence — the permanent guard is sound; only the geometry fix is missing).
- Per rule 6 (same fix twice → council): escalation agent dispatched to TRACE the Blender Enclosure-Shell-mesh path + parts placement, convene a 6-model council if root unclear, implement consensus, VERIFY delivered manifest bbox+shell.
