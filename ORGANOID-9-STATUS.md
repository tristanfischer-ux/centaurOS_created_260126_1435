# Organoid >9-drive — live status (autonomous, 2026-07-24)

## Fixes committed this drive
1. 09b9330b0 — ledger: power-protection parts require POWER not signal (PTC fuse missing_input).
   Cascades → Connection trace, Interconnect, ⚠Checks, Overview. IN re-run #1.
2. ef04bac5d — containment check floors enclosure envelope to placed-parts bbox
   (22 false-oversized → 0). Flows via dossier REBUILD.
3. 1207c7a57 (earlier) — gold-spine "Compute UI Module" reconciles to real BoM line.
4. be60f26ae (earlier) — render↔BoM parity invariant.
5. 600e62f3a (earlier) — harness→BoM + smooth ledger harness.

## Re-run #1 (out/organoid-9drive-r1-*) — ledger fix, QUALITY_LOOP_PHASE=3, PCB_STAGE=1
Running. On completion: rebuild dossier (picks up containment + gold-spine), then MEASURE
per-tab. Ledger fix needs the full re-run (topology authored pre-render).

## Remaining blockers (baseline scores → target >9)
- Connection trace 3.3 / Interconnect 0 / Overview 6 → expect lift from fix #1 (ledger).
- ⚠Checks 4 → fixes #1 (ledger CHECKS fail) + #2 (containment) both feed it.
- Renders 4 / Verification 4 / Drawings 6 → council: content/completeness; re-measure post-rerun.
- Bill of Materials 8.9 / Assembly 9 → near; re-measure.
- **PCB 0 → BLOCKER (Cursor's lane).** pcbGate fires `clean_toolchain_but_architecture_unfit`:
  wet_lab_hat missing `galvanic_isolator` role (a USB Galvanic Isolator EXISTS in BoM but
  isn't filling the role / has no footprint) + 1 unresolved electronic gap + 7 empty cells.
  Architecture/roles = src/lib/pdf-engine-v2/lib/pcb/* which this terminal stays OFF.
  → Needs Cursor-lane work OR honest ceiling. FLAG to Tristan.

## Council new design findings (my lane, next batch — decomposition)
- Redundant polyfuse + PTC resettable fuse (a polyfuse IS a PTC) → dedup one.
- 0.9A PTC undersized for ~1A (12W/12V) load → nuisance trip.
- (Lower priority for scoring; may affect BoM/verification honesty.)

## Achievability caveat (Grok, honest)
Some judgement tabs (verification/drawings) may cap 8-9 by construction. Many tabs ARE 10
already, so >9 is reachable — but PCB honest-ceiling + Cursor-lane may block a true all->9.
Will report the real per-tab gap after re-run #1 + rebuild, and escalate PCB.
