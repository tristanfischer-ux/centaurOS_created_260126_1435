# THE AIM — the canonical engine pipeline (Tristan, 2026-06-14)

> READ THIS FIRST every session. The recurring failure (Claude, repeatedly) is treating this as a
> LINEAR pipeline and point-fixing each box. **It is a LOOP.** Each box is garbage in isolation;
> only the loop converges it. Build the loop, not symptoms.

## The pipeline (Tristan's exact words, 2026-06-14)

1. **Brief → detailed brief.** Take a thin brief and augment it into an incredibly detailed, useful
   brief — for ANY subject.

2. **Select + assemble + run the tools.** Look through all the tools necessary to fulfil that brief
   — **INCLUDING tools which may not yet exist, in which case make those tools up on the fly.**
   Assemble them, choose which to use, sequence them. Take the inputs from the brief, put them
   through the tools → outputs. **Some of those outputs become the inputs for other tools, and those
   outputs become inputs for another set of tools** (a real dependency chain — layer on layer, not a
   flat fan).

3. **Blender — spatially aware layout.** Put all that information through the Blender model, which
   focuses on **the shortest route from one tool's output to another tool's input.** Spatially aware.
   **Physical parts NOT on top of each other when they shouldn't be.**

4. **Wiring / piping / HVAC.** Create all the wiring, piping, HVAC linking the parts. This sets a path
   = the **number of pipes/cables/ducts from one part to another** → a list of all the parts + components.

5. **THE LOOP (the part Claude keeps missing).** That parts list + the Blender feed **BACK to the
   engine/tools.** A series of loops, **round and round and round, until the result is ACCURATE.**
   Crucially: **Blender must ask "are there any ADDITIONAL tools needed?"** — the tools↔Blender
   circuit loops, not just the numbers.

6. **Raw bill of materials.** The converged long list of components/parts → what tank / what pipe you
   need → the raw BoM of what you need and **what all those parts are supposed to do.**

7. **Costing.** Look up the parts — **database FIRST, then online.** For parts you cannot find, make
   an **educated guess** at the cost. → the cost of the system.

8. **The 8 engineering documents** sit on top of the Blender, and **must be checked to actually work.**

## Why the linear approach keeps producing garbage (the honest diagnosis)

The numbers come out wrong (Monod 121× out, a chiller sized for a HEATING duty at impossible COP),
the tanks overlap, the P&ID shows 1 tank not 10, the BoM is 64% unmatched — and I keep "re-discovering"
these. They are NOT independent bugs to swat one at a time. They are what you get when **the loop never
runs**: each tool fires once on un-chained inputs, Blender lays out un-converged data, nothing feeds back,
nothing self-corrects. The engine's own physics critic ALREADY fires `BLOCKED` (plausibility 3/10) — it
knows the design is wrong — but there is no loop for that signal to drive another, tighter pass.

## What EXISTS vs what is genuinely MISSING (2026-06-14)

| Stage | Exists? | Reality |
|---|---|---|
| 1 brief→detailed | ✅ | contract expansion works-ish |
| 2 tool SELECTION on the fly | ✅ | DONE 2026-06-14 (no curation; right tools; commits 2c0b126c5/5d5a0656d/4f5b8d1ca) |
| 2 tool CHAINING (output→input→output) | ⚠️ weak | mostly a flat fan; tools read the brief, not each other → wrong, un-grounded numbers |
| 2 tool CREATION on the fly (invent a missing tool) | ❌ **MISSING** | selection works; creation does not exist |
| 3 Blender spatial / shortest-route / no-overlap | ⚠️ | renders a recognisable plant + is lit, BUT tanks pack edge-to-edge, parts overlap (C2), pipes graze not connect, not truly shortest-route |
| 4 wiring/piping/HVAC → parts list | ⚠️ | interconnect census + connection sizing exist but weak; HVAC drawing renders empty |
| 5 **THE LOOP (parts+Blender → tools → … until accurate; Blender asks for more tools)** | ❌ **THE CENTRAL GAP** | settle-loop exists but is STARVED — "converges" on pass 1 because topology is too sparse to change anything; Blender never asks for tools; the BLOCKED physics-critic signal drives nothing |
| 6 raw BoM | ⚠️ | 64% NOT FOUND; absurd pins (gas-lab device on a water loop; domestic pump on a 156 kW duty) |
| 7 costing DB-first→online→guess | ⚠️ | growing-DB exists; part matching poor |
| 8 the 8 drawings, checked | ⚠️ | GA works (10 tanks); P&ID shows 1 tank (recurring); HVAC empty |

## THE TWO REAL GAPS (everything else is a symptom these converge, or a point-bug)

1. **The loop doesn't iterate.** Make it actually loop: chained tools → spatial Blender → wiring →
   parts → feed back → physics-critic drives a re-run → tighten → repeat until accurate. Blender must
   emit "missing tools/parts" into the feedback.
2. **Tool-creation-on-the-fly is missing.** When no tool fits a needed duty, the engine must invent +
   register one (the growing-DB pattern, same as the tool-plan + class-graph bootstraps).

## The rule

Stop point-fixing the boxes. **Build the loop.** A symptom (overlap, wrong number, P&ID tank count) is
evidence the loop isn't converging — fix the loop, not the symptom, unless it's a genuine isolated bug.
