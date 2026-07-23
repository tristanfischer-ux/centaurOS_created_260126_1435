# Audit — convert this session's learnings into permanent CODE GUARDS (2026-07-23)

Tristan (2026-07-23): "do a massive audit of all the findings. Make sure all key things
learned are written into CODE so the mistakes are not made again, and all the good stuff is
preserved. Also get all the good stuff from Cursor. Be very thorough, take your time."

**Status: PLANNED, not executed** (compaction hit before execution). This doc IS the plan —
execute it next session. Every learning is already a mempalace drawer; the audit's job is to
turn each memory-note into a self-catching CODE guard (gate / proveCatch / invariant / assert),
the ForgeOS self-correcting AIM.

## A. Learnings ALREADY code-guarded (verify they still hold; no new work)
- Shell contains parts (G19), envelope-equality (G20), part-set (G21) — proveCatch in
  `drawing_gates.py --selftest`. Reorder + centering size shell from post-placement bbox.
- `#DIV/0!` → IFERROR-guarded worked-calc result + Δ (build-excel-export.py).
- P9 "internal runs fit envelope" judges only DRAWN physical runs (deterministic_checks_lib.py).
- PCB banner discloses real DRC residual count (build-excel-export.py, reads drc-report.json).
- Firmware bundle top-level `firmware/`; PCB firmware honesty labels (tier-aware readiness_why).

## B. Learnings that are MEMORY-ONLY → NEED a code guard (the real audit work)
1. **Cross-artefact FEATURE consistency gate (BIGGEST GAP) — ESCALATED, see §F NAMED DECISION.**
   GROUNDED 2026-07-23: inspected the shipped manifest (`out/organoid-bioreactor-20260723-0442`)
   — NO part protrudes above the shell (Culture Vessel top 9.5mm ≪ shell top 63mm). The
   parts-manifest is written POST-clamp (build_universal_scene.py:7084), so a feature gate that
   reads only the manifest would PASS on the exact tower miss it's meant to catch — a FALSE-GREEN
   (the Goodhart trap). The tower appeared in the GA because the DRAWING plots a DIFFERENT geometry
   source (pre-clamp). So the real gate must compare the DRAWING's geometry source vs the render's
   POST-clamp geometry — AND it's entangled with the open sealed-box-vs-protruding-tower decision
   (§B.5). Building it on the wrong artefact is worse than not building it. NAMED DECISION in §F.
   Drawer `forgeos_gotchas_39791547a14c52c0`.
   ✅ **§B.3 DONE** (`8fb9bafb4`): AgX-first view-transform proveCatch (`render_view_transform_selftest.py`,
   wired into verify-engine-guards.sh) — fires on the flipped-to-Standard regression.
   ✅ **§B.4 DONE** (`53d039c98`): run-loop.sh pre-bake better-sqlite3/node@22 ABI check + auto-rebuild.
2. **Gate-36 benchmark-net must read the brief's cost band BEFORE crying "N× under".** It
   benchmarked a COMMERCIAL bioreactor (£3500) vs a DIY open-hardware brief (£275-385) → false
   "missing subsystems" alarm I wrongly relayed. Guard: gate-36 reads brief cost band +
   explicitly-excluded subsystems; only escalates if the DELIVERED cost tabs score low. Drawer
   `forgeos_gotchas_b73c1d357aa5d538`.
3. **AgX-not-Standard proveCatch.** Product view-transform MUST be AgX (Standard blooms light
   bodies to a pale wash — bit twice). Add an assert/selftest that the product render path uses
   AgX, not Standard. Drawer `forgeos_gotchas_c9888be968b4a186`.
4. **better-sqlite3 / node@22 pre-bake check.** A sub-agent push rebuilds better-sqlite3 for
   system Node 25 (ABI 141) → chain dies on node@22 (ABI 127). Guard: run-loop.sh asserts
   `require('better-sqlite3')` loads under node@22 before launch; auto-rebuild if not. Drawer
   `forgeos_gotchas_8744be60adfaa0b0`.
5. **Sealed-shell containment vs protruding-tower — NAMED DECISION still open.** The
   sealed_enclosure clamps everything below the lid, so the vial/OD tower can't protrude on the
   render while the GA draws it. Options: (a) raise envelope H, (b) exempt vial_bioreactor
   signature parts from the containment clamp, (c) closed-box product shot + tower only in GA +
   a translucent "see-inside" render (Tristan's ask). Preserved in stash (see §D).

## C. Preserve the wins + get Cursor's good stuff
- OPERATING-FRAME-2026-06.md already has the coherence-system section. ADD: the SIGHT-side-by-
  side discipline, don't-trust-sub-agent-SIGHT (main thread judges renders), the fast-loop
  (single Blender render + 47s `build-excel-export.py <run_dir>` rebuild; only a fresh design
  needs the chain), AgX-not-Standard, gate-36-read-the-brief.
- CURSOR: **cursor-pcb is 3 commits ahead — MERGE it** (docs-only likely; keep both inbox
  blocks, selftest green). Cursor offered to land a first-class checked-in `firmware/pcb-bringup/`
  SOURCE tree — accept. Cursor's fixpack17/18/19 (real QEMU MCU sim + virtual I²C) already merged;
  honest ceiling FAB-READY — UNPROVEN IN HARDWARE. Read full CURSOR-HARNESS-INBOX + reply.
- Task #13 (pcbGate SHADOW clean_board misleading) is now partly addressed by the banner-DRC
  disclosure — finish it: the pcbGate `drc_ok` should read the REAL drc-report count, not
  state.pcb.pipeline.drc (which said 0 while wet_lab_hat had 9).

## D. Pending state at compaction (do NOT lose)
- **Demo DONE + emailed**: v3 dossier SHIPS floor 9, all tabs ≥8; two emailable zips sent
  (Part1 Dossier+PCB 21MB, Part2 Renders 12MB). All 3 spot-check issues fixed (#DIV, render
  contrast+tower-diagnosis, PCB DRC honesty).
- **Translucent "see-inside" render**: DONE + SIGHTed + pushed. Commit `77fefa4c9` adds the
  8a-ghost render pass (smoked-glass shell, alpha 0.18, Cycles). `out/ghost/08-product-ghost-shell.png`
  + `~/Downloads/Organoid-Bioreactor-SeeInside-GhostShell-2026-07-23.png`. Main-thread SIGHT verdict:
  translucency CORRECT (see-through shell, internals visible, good contrast) — BUT the interior reads
  SPARSE/toy-like (round vessel + 2 rails + a couple of bits in a mostly-empty box). FOLLOW-UP: populate
  the full component story (vessel+impeller+Peltier+OD LED/photodetector+PCB+perfusion) so the see-inside
  shot looks packed, not empty. Fine as a supplementary image; not hero-grade.
- **Stashes**: `stash@{0}` = a STALE intermediate of the ghost-shell edit (22 lines differ from the
  final committed `77fefa4c9`; superseded — safe to drop next session). `stash@{1}` = vial-tower
  geometry (unverified — feeds the tower NAMED DECISION §B.5). `stash@{2}` = older temp-stability WIP.
- HEAD `77fefa4c9` pushed. cursor-pcb 3 ahead (unmerged).

## E. Honest residuals on the organoid design (not demo-blocking, for later)
- Enclosure ~321mm vs 180mm contract intent → deterministic pack-solver (task #59).
- Front-panel hero contrast slightly softer than the 04 view.
- Risk register honestly flags 1 copy-paste error in a part's 'form' field.

## F. NAMED DECISION — the feature-consistency gate + the sealed-box-vs-tower question (needs Tristan)
The tower miss (GA draws an optical tower; sealed render doesn't) has ONE root: the
`place_sealed_enclosure` containment clamp forces every mesh `bbox_z_max ≤ base_z + H`, flattening
any protrusion below the lid. The drawing plots pre-clamp geometry (tower shows); the render + the
post-clamp parts-manifest don't. So there are TWO coupled questions:

**Q1 — what SHOULD the product look like?** (design intent)
- **Option A — sealed box is correct; the DRAWING is wrong to show a protruding tower.** Fix =
  make the GA read the same post-clamp geometry as the render (tower drawn flush/internal). Cheapest;
  the product is a clean sealed benchtop box. The tower becomes an internal feature seen only in the
  cutaway / translucent view.
- **Option B — the protruding tower is correct; the RENDER is wrong to hide it.** Fix = exempt
  vial_bioreactor "signature" parts (optical tower / vessel neck) from the containment clamp, or
  raise H so they fit. The product keeps its distinctive silhouette. More engine work + risks
  re-introducing the sprawl the clamp was added to fix.
- **Option C — accept the split:** closed box is the hero (Option A visual), the tower lives only
  in the GA cutaway + the translucent see-inside render, and we DISCLOSE that on the drawing.

**DECISION (Tristan, 2026-07-23): Option B — the protruding tower is correct; the RENDER is wrong.**
Implementation plan (the next focused increment — needs the render→SIGHT loop, do NOT mark done
without SIGHTing the tower actually appear in `00-hero.png`):
1. **Clamp exemption (Z only).** In `place_sealed_enclosure` (build_universal_scene.py ~16887, the
   mesh-level containment clamp loop `for zp in parts`), skip the Z-axis containment (i==2 branch at
   ~16908, `hi[i] > _int_hi[i]` → don't pull down) for parts flagged as a signature exterior
   protrusion. KEEP X/Y containment (the tower must not sprawl sideways, only rise). Universal signal
   — NOT a per-class table: key on a role/tag attribute (e.g. `zp.role in {'signature_protrusion',
   'roof_feature','exterior_mount'}` or an explicit `zp.exterior_protrusion is True`), set where the
   vial_bioreactor optical-tower/vessel is authored. If no such tag exists yet, add one at the
   authoring site keyed on the part's function (an optical read-head / vessel neck that the design
   marks as the instrument's signature feature), never on the class slug.
2. **Grow the shell envelope** so the caption + G19 stay coherent: the enclosure envelope H must
   include the protrusion (shell contains the tower base + the tower is an allowed exterior feature),
   OR model the tower as lid-mounted (base at lid, rising above) with the shell reporting the tower
   in its exterior-feature set.
3. **G19 allowance:** `enclosure_shell_contains_check` must treat a designated exterior-protrusion
   part as ALLOWED to sit proud of the lid (else G19 false-fires on the intended tower). Same
   universal signal as (1). Keep the containment check for every non-signature part.
4. **Re-render** (`render-blender-scene.py --state <run>/state.json --out-dir <dir>`, background it)
   and **SIGHT** `00-hero.png` — the tower must now protrude, matching the GA. Confirm no sprawl
   regression (other parts still contained; drawing-gates G19/G20/G21 PASS).
5. Then build G22 (below) with BOTH artefacts now showing the tower — the gate fires if they diverge.
   stash@{1} (`wip-vial-tower-geometry-unverified`) has prior tower-geometry placement — unstash and
   compare; it placed geometry that "wasn't visible in any product render" — that invisibility was
   almost certainly THIS clamp, so step 1 is likely the missing piece.

**ROOT CAUSE FOUND (2026-07-23, deep diagnostic — SIGHT + form-meshes + runtime print):** the tower
is NOT a build gap and NOT a suppress-hide. Confirmed:
- SIGHT of a fresh re-render of the 0442 state (current code): `00-hero.png` AND `04-product-exterior.png`
  BOTH show a flat box, no tower.
- The tower meshes ARE built — `form-meshes.json` lists `u_se_le_vial`, `u_se_le_od_src`, `u_se_le_od_det`,
  `u_se_le_vial_collar`, `u_se_le_od_arm_*`, `u_se_le_vial_fluid` (27 meshes total).
- The gate fires: a runtime print at build_universal_scene.py:12817 showed `INSTRUMENT=True
  LAB_ELEC_FORM=True LE_SIG=vial_bioreactor` — so the `elif _LE_SIGNATURE=="vial_bioreactor"` signature
  builder (17285) runs and appends the vial+OD.
- `_suppress_instrument_boilerplate_meshes` (16417) KEEPS them (u_se_le_ is in `_INSTRUMENT_MESH_KEEP_PREFIXES`).
- **Z-anchor hypothesis DISPROVEN:** the post-placement resize reassigns the local H (`W, D, H =
  _post_need_...`, line 17063) BEFORE the signature builder runs (17225+), so the tower's `_z_top =
  base_z + H` (17288) already uses the FINAL H (126). The tower is correctly placed ~100mm ABOVE the
  final lid. So it is NOT a build gap, NOT a suppress-hide, NOT a Z-anchor bug.
- **NARROWED to an above-lid render-visibility bug.** Decisive observation: in the re-render, the
  `u_se_le_face_*` meshes (display/keys/LED, which sit ON the shell front face at z≈base_z+H·0.5) DO
  render (visible in 00-hero + 04), but the `u_se_le_vial` / `u_se_le_od_src`/`od_det` / collar / arms
  (which sit ABOVE the lid at z>base_z+H) do NOT. So specifically the geometry above the lid line
  vanishes while same-prefix geometry on the shell renders. Candidate causes NOT yet checked: (i) the
  product-view camera (build_universal_scene.py ~12919) frames off a PRE-resize env height and the
  taller-than-expected tower falls outside the rendered frame despite centre_frac=0.82 (but the box is
  not cropped, so weakly supported); (ii) a per-view hide/clip step that removes above-lid meshes; (iii)
  the vial glass material (alpha 0.62) + amber fluid + dark OD reading invisible against the light
  studio bg from these angles (least likely — dark OD housings would show). Next diagnostic: in a
  render, temporarily give u_se_le_vial/od a bright opaque material + print each tower mesh's final
  world-bbox and hide_render state right before the product-view render, to see if they're hidden,
  off-frame, or just invisibly-transparent.

**FIX: root not yet isolated — needs one more focused render-diagnostic iteration (above). Do NOT
claim Option B done until 00-hero SIGHTs the tower.** Likely entangled with §E sprawl (task #59): the
oversized 321×288 shell also distorts the camera/scene. After the tower renders, build G22.

**Q2 — the gate (independent of which option):** whichever geometry is canonical, build a
cross-artefact FEATURE-consistency gate (G22) that FIRES when the set of protruding/exterior
features differs between the DRAWING's geometry source and the RENDER's post-clamp geometry. This
catches the mismatch REGARDLESS of the Q1 answer — it just needs to know which source is canonical
so it compares the right two things. Do NOT build it against the post-clamp manifest alone (proven
above to false-green the tower miss). proveCatch: plant a protruding feature in one source only →
gate fires. Drawer `forgeos_gotchas_39791547a14c52c0`. Recommendation: **A or C** (sealed box is a
more honest "product" shot; the tower is a genuine internal feature, well served by the translucent
render just shipped), then build G22 with the render's post-clamp geometry as canonical.
