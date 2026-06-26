# Tristan's dossier review — 2026-06-27 (the "10:10" Excel) — TRACKED PUNCH-LIST

Every point from the verbal walkthrough, captured verbatim-faithful, grouped. `[ ]` = open.
Routing in **→** to where the fix lives. This is the authoritative list; work it top-down, fix at SOURCE.

## ★ CROSS-CUTTING (apply to ALL tabs)
- [~] **X1 (BANNER on every sheet + GATE coverage DONE; drawing CONTENT fixes remain → #100/#101) — EVERY tab needs a tab-quality banner + score**, including the DRAWING/RENDER sheets that
      currently have none: ⭐ Scorecard, Render interior layout (×3 views), Render building exterior (×4),
      GA, P&ID, BFD, Single-line, HVAC, Isometric (201/202/203), ⚠ Checks, ⚠ Audit. The per-tab scorecard
      only scores ~16 data tabs today; it must cover the WHOLE workbook (37 sheets). **→ dossier_audit + build-excel**
- [~] **X2 (Overview+Conn-trace DONE; rest of false-pass audit ongoing) — a quality banner must be HONEST (no false PASS).** Overview shows 10/10 PASS while rows
      17–21 visibly show failures; Connection-trace shows status "OK" but it's HARD-CODED, not computed.
      A green score over visible failures is the fake-8 again. **→ make each tab's check read the real cell state**
- [x] **X3 (FIXED) — TAB ORDER must be logical (said several times):** Brief → Inputs & Assumptions → Calculations
      → … → Bill of Materials → Cost waterfall. (Calculations AFTER Brief; Inputs near the front, before
      Calculations; Cost waterfall AFTER the BoM it derives from.) **→ build-excel sheet order**
- [ ] **X4 — every NUMBER needs WHERE-FROM and WHERE-TO.** Each value must trace UP to its source
      (brief → calc) and DOWN to its consumer (where it's used next). Currently unclear on Calculations,
      Quantities, Inputs & Assumptions, Cost waterfall. **→ provenance spine both directions**
- [ ] **X5 — everything needs a TAG number** for traceability (Line & velocity has none). **→ tag every row**
- [ ] **X6 — Risk findings must be FIXED, not just listed.** The physics-critic HIGHs say "resolve before
      procurement / re-run to confirm closure" but are left open — the whole point is to fix them. **→ close the loop**

## EXECUTIVE SUMMARY
- [~] Key specs & brief compliance achieved 6/10 — **Tristan: realistic, fine.** (no action)
- [x] E1 (banner DONE) — the ⭐ Scorecard tab itself has NO tab-quality check; add one for consistency (every tab incl. this).

## OVERVIEW
- [x] O1 (FIXED commit) — shows 10/10 PASS but rows 17–21 contain a bunch of FAILURES. The 10/10 is FALSE — the score
      must reflect the failures shown on the tab. **→ Overview check must read those rows**

## BRIEF
- [~] tab quality fine. (no action)

## QUANTITIES
- [ ] Q1 — values' provenance unclear ("not sure where all the values are coming from"). Each quantity
      needs its WHERE-FROM. **→ X4**

## CALCULATIONS
- [x] CA1 (FIXED via X3) — move the Calculations tab to come AFTER Brief (order). **→ X3**
- [ ] CA2 — each number's derivation chain is unclear: inputs/outputs shown but "where is this going" +
      "status used or not" is murky. Show where each calc value FLOWS TO. **→ X4**
- [ ] CA3 — specific: B56 incident energy = 3.1 — no visible SOURCE for it; the arc-flash IB rating = 144
      further down — no visible source. (line ~70 starts to show some lineage — do it for ALL.) **→ X4**

## FINANCIAL MODEL
- [ ] F1 — NO revenue associated with the model.
- [x] F2 (FIXED — feedstock marked N/A for non-feed-driven classes) — line 13 talks about feed / feedstock with a feedstock NUMBER — a water/fertigation plant has
      NO feedstock; that number is wrong / shouldn't exist. **→ class-appropriate economics**

## COST WATERFALL
- [ ] CW1 — the raw-materials / BoM numbers are HARD-CODED; they must be DERIVED FROM the Bill of Materials
      (where do they come from?). **→ X4 + compute from BoM**
- [x] CW2 (FIXED via X3) — order: Cost waterfall should come AFTER the BoM. (raised before.) **→ X3**

## INPUTS & ASSUMPTIONS
- [x] IA1 (FIXED via X3) — move near the FRONT, after Brief and before Calculations. **→ X3**
- [ ] IA2 — numbers' provenance unclear; they should come FROM the brief. **→ X4**

## BILL OF MATERIALS (Ledger) — 6/10
- [x] B1 (FIXED — G/H now parse the basis derivation) — columns G & H (Key inputs / Factors) are EMPTY — populate them or they have no purpose.
      **(raised every time — stop ignoring it.)**
- [~] B2 (children now marked ↳ apportioned / carry class+conf) — from ~line 335 the format CHANGES (the sub-component/child rows): no class estimate, no
      confidence number, no material choice. Make the child rows consistent (or clearly mark them as
      apportioned children of a parent). **→ build-excel BoM child rendering**
- [ ] B3 — BoM rows need WHERE-IT-GOES (destination/usage). **→ X4**
- [~] B4 — rows finally have tag numbers. (good)

## LINE & VELOCITY
- [ ] LV1 — NO tag numbers — every line must have a tag. **→ X5**

## PANEL SCHEDULE
- [~] has tag numbers, looks vaguely correct — **needs a verification check.**

## PROCESS SCHEDULES
- [ ] PS1 — plausible (line N → N) but needs a class-appropriate-instruments check (verify).

## ASSEMBLY SEQUENCE
- [~] plausible. (verify class-appropriate)

## RISK & REGULATORY
- [ ] R1 — two physics-critic plausibility findings shown as HIGH with "resolve before procurement / re-run
      to confirm closure" — they are NOT fixed. Actually FIX them + re-run the physics check to close. **→ X6**

## RENDER — INTERIOR LAYOUT (view / top / view-2)  [3 sheets]
- [x] RI1 (banner DONE) — NO tab-quality number on any of them — add one. **→ X1**
- [ ] RI2 — image is a MASS of very fine blue wires everywhere + lots of tiny identical little boxes /
      valves / tanks. Suspect default-sized objects littered across the scene. Identify what they are; a
      cabinet's internals should be IN the cabinet, not scattered. **→ Blender scene / object sizing**

## RENDER — BUILDING EXTERIOR (×4)
- [x] RE1 (banner DONE) — needs a tab-quality number (generally looks fine). **→ X1**

## GA — GENERAL ARRANGEMENT
- [ ] GA1 — masses of tiny little components all over the place. **→ object sizing**
- [ ] GA2 — **CRITICAL**: the GA (top) and the Render interior-layout (top) show COMPLETELY DIFFERENT
      arrangements despite BOTH being top views — they must be the SAME layout. **→ one layout source feeds both**

## P&ID
- [x] PID1 (banner DONE) — needs a tab-quality number. **→ X1**
- [ ] PID2 — EMPTY — nothing shows in it. **→ P&ID generator for water archetype**

## BFD — BLOCK FLOW
- [x] BFD1 (banner DONE) — needs a tab-quality number. **→ X1**
- [ ] BFD2 — EMPTY — nothing shows. **→ BFD generator**

## SINGLE-LINE
- [x] SL1 (banner DONE) — needs a tab-quality number (more detailed; verify correctness). **→ X1**

## HVAC
- [x] HV1 (banner DONE) — needs a tab-quality number. **→ X1**
- [ ] HV2 — right size space, but verify the air-duct system actually works / is placed where it should be.

## ISOMETRIC (201 / 202 / 203)
- [x] ISO1 (banner DONE) — needs a tab-quality number. **→ X1**
- [ ] ISO2 — 201, 202, 203 look ALMOST IDENTICAL — they should be DISTINCT (per-line spools). Clarify the
      difference or fix the generator. **→ isometric generator**

## ⚠ CHECKS
- [x] CH1 (banner DONE) — needs a tab-quality number. **→ X1**
- [ ] CH2 — the live-input column on the RIGHT does not line up with the rows BELOW (ROW MISALIGNMENT,
      data shifted) — **raised many times** — fix the alignment. **→ build-excel Checks layout**

## ⚠ AUDIT (dossier self-audit)
- [x] AU1 (banner DONE) — needs a tab-quality number. **→ X1**
- [ ] AU2 — MISSING: the comparison of what the GENERATIVE LLM expects vs what the engine actually produced
      (the benchmark net), and whether they're CONNECTED/agree. It must be shown in the dossier. **→ surface state.benchmarkDivergence**

## CONNECTION TRACE — 10/10
- [x] CT1 (FIXED commit — invariant now routes to Connection-trace) — status shows "OK" but it's HARD-CODED. It must be COMPUTED (OK only if a real check passes),
      not a literal. **→ compute connection status**

## PART NAMES
- [~] tag numbers + quantities present — fine.

## GLOSSARY
- [~] fine.
