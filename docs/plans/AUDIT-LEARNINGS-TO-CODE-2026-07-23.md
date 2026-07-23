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
1. **Cross-artefact FEATURE consistency gate (BIGGEST GAP).** The coherence stack checks
   envelope/part-set/containment/caption but NOT "does the render show the same protruding /
   exterior features the GA drawing draws" — that's why the optical-tower miss slipped past all
   gates AND my SIGHT. BUILD a new gate (G22): the set of named exterior/protruding features in
   the render (form-meshes.json kept-on-exterior) must equal those the GA exterior views draw;
   a feature on one side but not the other FAILS. proveCatch both directions. Drawer
   `forgeos_gotchas_39791547a14c52c0`.
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
- **Translucent "see-inside" render**: agent `a798fac234646fa63` edited build_universal_scene.py
  (translucent shell) + rendered to `out/ghost/` — UNVERIFIED, I never SIGHTed it. That edit is
  STASHED (see below). Next session: unstash, SIGHT out/ghost/00-hero.png, iterate if the shell
  isn't actually translucent, then drop a ghost image in Downloads for Tristan.
- **Stashes**: `stash@{0}` = translucent-shell edit (this wrap-up) + the prior vial-tower geometry
  (unverified). Don't discard.
- HEAD `2968f6074` pushed. cursor-pcb 3 ahead (unmerged).

## E. Honest residuals on the organoid design (not demo-blocking, for later)
- Enclosure ~321mm vs 180mm contract intent → deterministic pack-solver (task #59).
- Front-panel hero contrast slightly softer than the 04 view.
- Risk register honestly flags 1 copy-paste error in a part's 'form' field.
