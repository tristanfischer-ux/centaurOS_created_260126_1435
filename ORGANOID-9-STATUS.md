# Organoid >9-drive — MEASURED status (autonomous, 2026-07-24)

## Result of re-run #1 (out/organoid-9drive-r1-*, ledger fix, PCB_STAGE=1)
- **CHECKS FAIL: 1 → 0** (ledger power-protection fix worked; ledger now 20 power edges,
  the PTC fuse is fed: `SMD Ferrite EMC Bead → PTC Resettable Fuse | power`).
- **26 / 35 tabs now >9** (from a floor-0 draft).
- Big lifts from the containment fix: Renders 4→9, Verification 4→≥9, ⚠Checks 4→≥9,
  Overview 6→≥9.
- ship_ok=False (floor still gated by the tabs below).

## Remaining tabs < 9 (with exact next-fix pointers)
1. **Connection trace 3.3** — scorer `_sc_connection` (build-excel-export.py:25662) caps because
   `_fam_rows(wb,"Connection trace","connection")` returns ~0 rows (→ _n_rows=1) while parts-ledger
   lists 35 connections, tripping `_n_led_cx > _n_rows*3`. tab_connection_trace (7373) writes 31
   part-rows but they are NOT counted as a family="connection" registered TABLE (or the phantom
   resolver `_resolve_trace_endpoints`:7422 dropped real endpoints because ledger names
   ("SMD Ferrite EMC Bead") ≠ BoM names). FIX: ensure the 31 rows register as a "connection"
   family table AND/OR loosen the phantom resolver's name match; then the cap won't fire.
2. **Interconnect 5** — draw_interconnect.py emits kinds=['mechanical','signal'] only; the ledger
   NOW has 20 power edges but the interconnect renderer isn't drawing them as orange power edges
   ("USB/LiPo → compute → source must appear, not legend-only"). FIX: draw_interconnect must read
   the ledger power edges (service=='power') and render them.
3. **Drawings 6** — capped: "register integrity only; need drawing_gates all_pass + GA coverage
   ≥80% (product-scale) OR Assembly+Interconnect (handheld)". FIX: make drawing_gates pass + GA
   coverage, or emit the handheld drawing pair.
4. **Bill of Materials 8.9** — "3 of 28 cells empty — row 11 '% present' empty". FIX: populate the
   '% present' column for those 3 rows in the ledger-BoM tab builder.
5. **Renders 9 / Assembly 9** — CAPPED at 9 "by construction" (Renders: 100% coverage but capped;
   Assembly: "sheet earned, not fab pack"). To exceed 9 needs the extra deliverable the scorer
   wants (fab pack / more). ⚠ May be a genuine ceiling — verify the scorer CAN award >9 for an
   instrument before chasing (Grok's warning). Check _sc_renders / _sc_assembly cap logic.
6. **PCB 0 — BLOCKER, Cursor's lane.** pcbGate fires `clean_toolchain_but_architecture_unfit`:
   wet_lab_hat missing `galvanic_isolator` role (a USB Galvanic Isolator EXISTS in BoM but isn't
   filling the role / lacks a footprint) + 1 unresolved electronic gap + 7 empty cells. Architecture
   = src/lib/pdf-engine-v2/lib/pcb/* which THIS TERMINAL STAYS OFF. Needs Cursor OR an honest ceiling.
7. Executive Summary / Quality & Audit — MIRRORS; auto-rise when 1–6 clear.

## Fixes committed + pushed this drive
600e62f3a harness→BoM · be60f26ae parity invariant · 1207c7a57 gold-spine reconcile ·
09b9330b0 ledger power-protection · ef04bac5d containment bbox-floor · +docs.

## ⭐ ACHIEVABILITY — the >9-on-EVERY-tab goal is BLOCKED by design (2026-07-24)
After fixing the floor-setters (27/35 tabs >9), the remaining sub-9 tabs are NOT all
fixable, because the scoring rubric DELIBERATELY caps instrument-scale tabs at 9:
- **Interconnect** — `_sc_interconnect` line 1116: `sc = 9 if concerns==0 else 7`. For an
  instrument the sheet IS the block diagram; "never 10 from a block diagram alone —
  pin-level netlist lives on the PCB tab". HARD 9 by honest design.
- **Assembly** — line 1026: "capped 9 (Assembly sheet earned, NOT fab pack)". >9 needs a
  PCB fab pack (gerbers/drill/positions zip).
- **Drawings** — line 891/898: "register alone never mints 10"; needs drawing_gates all-pass
  + GA coverage, and even then caps unless a fab pack exists.
- **PCB** — 0, pcbGate fires (galvanic_isolator role), Cursor's lane.
- The fab-pack that would lift Assembly/Drawings/Interconnect above 9 comes from the PCB
  pipeline — which is failing. So the whole cluster is gated on a working PCB (Cursor lane).

CONCLUSION: strictly >9 on EVERY tab is NOT achievable for a benchtop instrument with the
current HONEST rubric, without (a) a working PCB fab pack (Cursor lane) AND (b) the rubric
allowing an instrument block-diagram/assembly sheet to score 10 (which would be DISHONEST —
it isn't pin-level). This is a NAMED DECISION for Tristan (below), not something to fake.

DECISION NEEDED FROM TRISTAN (options):
  A. Accept 9 as the honest ceiling for instrument-scale tabs (Interconnect/Assembly/
     Drawings) — i.e. target ≥9, not strictly >9, on those; drive everything else >9.
  B. Get the PCB working (Cursor lane) so the fab pack exists → unlocks Assembly/Drawings
     >9 and PCB itself; then only the honest-9 Interconnect cap remains.
  C. Relax the rubric caps to allow instrument tabs to mint 10 (NOT recommended — breaks the
     honest-scoring principle; a block diagram would claim pin-level fidelity it lacks).

## Honest verdict
NOT yet all-tabs >9. The two deterministic floor-setters are FIXED and cascaded (26/35 >9).
The remainder splits into: fixable rendering/content bugs (1,2,4 — Excel/draw layer, flow via
dossier rebuild, no full re-run needed), a drawing-completeness requirement (3), possible
construction caps (5 — verify achievable), and one Cursor-lane blocker (6, PCB). All-tabs
STRICTLY >9 likely needs the PCB Cursor-lane work + confirming the Renders/Assembly caps can
exceed 9 for an instrument. Do NOT fake any tab to >9.
