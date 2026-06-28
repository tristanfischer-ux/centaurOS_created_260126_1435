# Plan: fix the render layout (the stray "beam", the over-large footprint) — deterministic-first

## The problem (grounded in Codema v33, the real artefact)
The 3-D render + GA score 4/10: the vision critic flags "a red pipe/beam shooting off the platform to a
floating box" and "a thin blue wireframe far beyond the plant". These are **connections, not parts** —
confirmed in `connection-schedule.json`:
- longest drawn routes are **22–24 m**: `Fresh Water Tank → Mains Incomer` **24.2 m**, `Ultrafiltration
  Module → Fresh Water Tank` 23.3 m, `Cip Tank → Cleaning Tank` 22.0 m.
- The 24 m `… → Mains Incomer` run is a **power/utility service** to the electrical gear, which the
  layout solver places in the far `utilit/power/electrical` region (REGION_PRIORITY rank 60) — metres
  from the loads it feeds → a long cable rendered as a 3-D beam = the red stray.
- Footprint is ~**27 m × 29 m** for a ~50-part plant (≈2× too big); modules fling to the edges
  (maintenance/CIP at y −8.5 m, nutrient array at x +30 m) via the N_BANKS serpentine + the unfinished
  Y-compaction (#147) + the qty-N array spread.

## Why deterministic checks miss it today
`audit_connection_geometry(parts)` already verifies every drawn line **lands on a real part at both
ends** (no line to nowhere). The red beam **passes** it — it genuinely connects the tank to the Mains
Incomer. Nothing checks connection **length**, **cross-site span**, or **footprint compactness**, and
nothing decides a power cable should not be a 3-D beam at all. That is the gap.

## Root causes (two, independent)
1. **Wrong thing drawn.** A POWER/SIGNAL service (cable) is an electrical-distribution concept — it
   belongs on the single-line diagram + P&ID, not as a physical 3-D beam in the GA/render. Drawing it
   as a routed pipe is the red beam.
2. **Wrong placement.** Connected PROCESS equipment is placed far apart (22–24 m process runs that
   should be ≤ ~10 m), because the solver lays out by process-order region bands + serpentine Y banks,
   not by connection adjacency, and the footprint never compacts to the equipment's true extent.

## The fix — 4 parts, deterministic-first (aligns with the prior council verdict: typed ontology +
## spatial containment; vision = flag-only, never the gate)

**P1 — Draw only what is physically a 3-D route; exclude electrical/signal services.** In the render's
edge-drawing (`route_topology` / `_edge_service` / `_rm_service_code`), classify each connection's
service; **process/mechanical** services (water, air, chemical, drain, CIP) draw as 3-D pipe; **power /
control / signal / earth** services are SUPPRESSED from the 3-D scene and remain on the single-line +
P&ID + connection schedule. This deletes the red power-cable beam at the source. UNIVERSAL — keyed on
the service code, no class table.

**P2 — Deterministic connection-length / containment gate (the catch the red beam must fail).** Extend
`audit_connection_geometry` → `audit_route_sanity`: for every DRAWN 3-D route, flag (a) length >
`max(footprint_diag × 0.6, 12 m)` — a route spanning most of the site is a placement smell; (b) any
waypoint OUTSIDE the site-boundary bbox + margin (spatial containment — every vertex inside the
boundary). Returns offenders; wired into `drawing_gates.py` (gate G-route) so a stray route FAILS the
drawing score and routes the fix to the placement stage. proveCatch on the frozen v33 24 m beam.

**P3 — Compaction + connection-aware nudge of the placement.** (a) After placement, COMPACT each axis
to the true equipment extent + a fixed walkway (finish the #147 Y-compaction; remove the dead bands so
the footprint ≈ the packed equipment, not 2×). (b) A bounded **connection-adjacency nudge**: for the
few highest-degree / longest-run pairs (e.g. switchboard ↔ its loads, a tank ↔ its main consumer),
pull the lighter end toward its partner within the free grid (no overlap), shrinking the worst runs.
Keep the process-train left→right reading; this is a local nudge, not a full re-solve. Guard: every
other archetype's footprint must not regress (RAS/BESS regression render).

**P4 — Vision-critic verify (already built, flag-only).** `render_vision_critic` runs on the new hero
each chain (wired); the render only earns ≥8 when (P2) is clean AND the critic returns `broken:false`.
The frozen red-beam fixture stays the rot-guard. Vision never PASSES a bad render — it only confirms
the deterministic fixes actually cleared the eye-level defect.

## Sequencing (smallest blast radius first; re-render + vision-critic after each)
1. P1 (suppress electrical-service beams) — likely removes the red beam alone; cheap, contained.
2. P2 (route-sanity gate + containment) — makes the defect deterministically catchable; proveCatch.
3. Re-render → vision-critic. If the blue-wireframe stray remains, it is a long PROCESS run → P3.
4. P3 (compaction + adjacency nudge) — tighten footprint + worst runs; regression-render RAS/BESS.
5. Final chain run → all render/GA sheets ≥8 AND vision-critic `broken:false`.

## Universality + guards (CORE FIX PRINCIPLE)
- Every change keyed on a signal (service code, route length, footprint extent), never a class table.
- proveCatch per part: P1 (a power service is not in the 3-D route set), P2 (the 24 m beam + an
  out-of-boundary waypoint both FAIL), P3 (footprint ≤ packed-extent × tolerance). Wired into
  `verify-engine-guards.sh` + a regression-harness invariant; RAS/BESS render regression must hold.

## Open questions for the council
1. P1: is "suppress power/control/signal services from the 3-D scene" correct universally, or are there
   archetypes where a power run IS a legitimate massed 3-D object (busway/cable bridge) that should show?
2. P2 length threshold: `footprint_diag × 0.6` vs an absolute (12 m) vs per-service — what is robust
   across a 5 m skid and a 200 m wind farm without false-flagging a legitimately long run?
3. P3: is a bounded local "adjacency nudge" enough, or is the region-band+serpentine solver itself the
   wrong model — should placement be a connection-minimising (force-directed) solve from the start?
4. Is there a deeper single root than "wrong-drawn + wrong-placed", and are we still inspecting-in
   quality vs the typed-graph compile-not-author north star?
5. Biggest blind spot in this plan?

---

# COUNCIL VERDICT (Gemini 3.1 Pro · Grok 4.3 · GLM-5.1 · MiMo-2.5-Pro — 2026-06-28)
**Gemini SHIP-WITH-CHANGES · Grok RECONSIDER · GLM RECONSIDER · MiMo critical.** Strong convergence on 6 blockers; the original plan is cosmetic where it matters. REVISED below.

**Blocker 1 — P1 is WRONG (4/4): don't suppress by SERVICE; key on PHYSICAL ROUTING CLASS.** A cable TRAY / busway / conduit / raceway is real 3-D infrastructure — clash-critical, occupies corridors, belongs on the GA. Suppressing all power/control hides real spatial claims and causes future clashes + dead voids. The flaw is rendering a point-to-point CABLE as a rigid straight beam, not the service. FIX: render the physical CONTAINER (tray/busway/duct); suppress only the bare individual wire/signal run that has no tray. Needs a component-TYPE layer, not service alone.

**Blocker 2 — P2 magic numbers are brittle (4/4): use a RELATIVE / TOPOLOGY metric.** `max(diag×0.6,12 m)` false-flags a 5 m skid and masks a 200 m farm. Converged replacements: route-efficiency ratio `route_len / manhattan(A,B) > ~2–3` (scale-free), AND/OR topology hops — "edge crosses > N region bands" (a CABLE should be ≤1 band = local by definition; a pipe ≤3). Catches short-but-wrong placements too; never false-flags a legit long run.

**Blocker 3 — P3 nudge is a band-aid; the ROOT is the categorical PARTITIONER (4/4).** Region assignment is purely by tag ("utility" → far region) with NO co-location cost for connected pairs, so the switchboard is topologically EXILED from its load. FIX: give placement an edge-weight co-location objective — pre-cluster high-affinity pairs (supply↔consumer, esp. electrical gear ↔ its dominant load: decentralised MCC/local panel NEAR the load) BEFORE the serpentine fold (Kernighan-Lin / min-cut partition). Drop the post-hoc "nudge". REJECT force-directed (breaks determinism + access/walkway constraints).

**Blocker 4 — compaction must be DEFAULT, not conditional (2/4).** Layout is ONE deterministic phase; collapse dead bands every run (footprint ≈ packed extent). GLM's killer line: P1 alone deletes the beam but leaves the 27×29 m empty room — "you hid the symptom, fixing nothing." Compaction is mandatory, not a reactive P2→P3 loop.

**Blocker 5 — vision is the WRONG gate for compactness (MiMo, category error).** The critic catches visual artefacts; a 27×29 m footprint "looks fine" if evenly spaced. Compactness MUST be the deterministic metric (Blocker 2/4); vision only confirms the beam is gone.

**Blocker 6 — the stray WIREFRAME is unaddressed (Gemini/MiMo).** Separate bug — a broken mesh / zero-dim part / unculled bbox visualiser. Investigate independently; not a layout issue.

**Deeper single root (converged):** the connection graph CONFLATES logical connectivity (P&ID / cable schedule) with physical spatial routing — every edge gets the same 3-D pipe treatment (a 6 mm impulse line and a 24 m power cable both become beams) — AND the layout stage has no compactness objective + no co-location cost. Tag edges `physical_route` vs `logical_connection`; feed only physical routes to the 3-D renderer.

**Also:** proveCatch must use a FROZEN synthetic stray (if P1 deletes the live beam, P2 never sees it — circular). RAS/BESS render regression untested = the recurrence risk (all 4).

# REVISED PLAN (council-driven)
1. **Edge typing** — tag every connection `physical_route` (process pipe; cable tray / busway / duct) vs `logical_connection` (bare wire / signal / earth, no tray). Only `physical_route` feeds the 3-D scene; a tray'd power run renders the TRAY. (Replaces P1.)
2. **Co-location partitioner** — edge-weighted clustering so connected high-affinity pairs (esp. electrical gear ↔ dominant load) sit together before the serpentine fold; decentralised panels near loads. Deterministic, not force-directed. (Fixes the root.)
3. **Always-on band compaction** — collapse dead bands → footprint ≈ packed extent + walkway. Single phase. (P3 compaction, mandatory.)
4. **Route-sanity gate, RELATIVE** — flag `route_len/manhattan > ~2.5` OR bands-crossed > service-max (cable ≤1, pipe ≤3) + waypoint-in-boundary containment; wired into drawing-gates; proveCatch on a FROZEN synthetic. (Replaces P2.)
5. **Vision = beam-gone confirmation only**; compactness is the deterministic metric. (P4 scoped.)
6. **Separate task: hunt the stray wireframe** (mesh/zero-dim/cull).
7. RAS/BESS render regression must hold for 1–4.

---

# IMPLEMENTATION LOG
**P1 (edge-typing / service-coherence) — DONE + VERIFIED, commit ac7be90d1.** Re-render dropped the 2
phantom fluid-to-electrical edges (Tank/Vessels → Mains Incomer); blue stray gone from the hero.

**P2 (co-location) — first attempt FAILED + REVERTED (verify-driven, not committed).** Tried the
tractable version: reorder the back-row periphery lane so `power_distribution` sits at the CENTRE
(`_centre_electrical_in_lane`). 3-archetype render gate (Codema + RAS + BESS) showed it did NOT work:
the key power run `Motor Control Center → 3 Phase Power Input` STAYED at 24.35 m, and Codema's longest
runs got WORSE (33 m tank-to-tank fluid — the back-row reorder rippled the shared centreline). REVERTED.
**ROOT (now verified):** the electrical gear is SPLIT ACROSS TWO LANES — `energy_storage_source` is a
FLOW-train region (it holds the generator / transformer / "3 Phase Power Input") while
`power_distribution` is a back-row periphery region (switchboard / MCC). The distribution SPINE
(Generator→Transformer→Switchboard→MCC) therefore runs BETWEEN the train lane and the back row = the
long red beam. Centring one region cannot shorten a run whose two ends live in different lanes.
**REAL P2:** CO-LOCATE both electrical regions in ONE lane — i.e. classify `energy_storage_source` as
periphery/electrical (it carries no process fluid) so it clusters with `power_distribution` and the
spine is short + local. That is a flow-plan PARTITION change (`get_flow_plan` / the flow-vs-periphery
split, ~line 1431), with the same 3-archetype regression gate. Do it fresh with baselines captured
FIRST (render RAS/BESS on the committed P1 build before any P2 edit, so regression is measurable).
