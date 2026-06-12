# Anvil — how the engine works (capability overview)

*A short, plain-English description of what the system does and how an engineer would work with it. Written to share with a reviewing engineer so they can propose a workflow. Capability level — not the internal machinery.*

---

## 1. What it is

You give it a short brief — a paragraph or two describing what you want to make and the key targets (for the carbon dioxide plant: capture rate, solvent, the mineralisation route, a cost ceiling). In a few minutes it returns a complete first-pass engineering design: the process, the calculations, a costed parts list, and the suppliers and specialists you would need to build it.

It is best understood as an **engineer's copilot for the earliest stage of design** — the part that is normally days or weeks of scattered work: finding the right correlations, sizing the units, pricing the equipment, hunting for suppliers, and working out who you need on the team. It does roughly **80% of that first pass** and is explicit about the 20% it cannot be sure of, so the engineer's time goes on judgement rather than fetching.

It does **not** replace the engineer. It gives them a strong, consolidated starting point and the sources to check it against.

---

## 2. The two questions it answers (the report's two halves)

The output is deliberately split into the two questions an engineer asks, in order:

**Part 1 — Does it work?** (the engineering basis)
Everything needed to judge feasibility, in one place:
- the process flow (the whole process as a sequence of operations and streams);
- the mass and energy balance / stream table — does it close?;
- the governing calculation for each unit operation (e.g. absorber packing height, reactor volume, stripper duty), with the maths, the assumptions, and a confidence flag on each;
- the reaction chemistry and thermodynamics (stoichiometry, equilibrium, the kinetic regime);
- the economics — levelised cost, and the single variable most likely to decide viability;
- a clear verdict: feasible / feasible-with-caveats / not feasible, and **what is empirically anchored vs first-principles vs genuinely uncertain**.

No equipment selection, no bill of materials, no suppliers in this half. An engineer can read only Part 1 to decide whether the concept is worth pursuing.

**Part 2 — How do I build it, and who do I need?** (realisation)
Once the physics holds up:
- the breakdown into modules and sub-modules (the equipment);
- a costed bill of materials — commodity, catalogue-buyable items named; bespoke / made-to-order items flagged as such;
- the suppliers and fabricators to source it from, matched against a large supplier database;
- the specialists and fractional executives the build calls for — the type of expert, the credentials that matter, and the questions to put to them;
- lead times and the critical path.

This half is the route from "it works on paper" to "here is who builds it and what it costs."

---

## 3. How you work with it (the interaction model)

It is meant to behave like a coding assistant, not a black box:

- **It proposes options, you choose.** For a design decision it puts up a small number of candidate approaches (for example, several ways to size or configure a unit) with the trade-offs, and the engineer picks the one that fits — rather than the tool committing to a single answer you have to unpick.
- **You feed in real results and it recalibrates.** Models are always a few percent off reality, so plant data, pilot results and laboratory measurements can be fed in to anchor the numbers. Where real data exists it overrides the model. (The carbon dioxide absorber is a live example: a first-principles model badly under-sized the column; a packing height taken from published pilot trials replaced it.)
- **It tells you where it is unsure.** Each number carries a basis and a confidence. The hard, judgement-heavy parts are flagged for an expert rather than presented with false certainty.
- **It iterates.** You change an assumption or a target and it re-runs, so the design converges over a few passes instead of one shot.

---

## 4. The data underneath it

- **A supplier database of tens of thousands of companies**, used to match real suppliers and fabricators to each line of the design — the part that is normally the most scattered and time-consuming to assemble by hand.
- **A growing parts, standards and pricing library** that learns from every run, so coverage improves over time rather than starting cold each time.
- **A real-data calibration loop** — measured plant and laboratory results, and live distributor pricing, used to keep the numbers honest.

---

## 5. What it is good at — and what it is not

**Good at:** breadth and consolidation (pulling information that lives in a dozen places into one coherent document), speed (a costed, sourced first pass in minutes), and sourcing (suppliers and specialists matched to the design). These are the things that save an engineer real time.

**Not a substitute for:** rigorous, judgement-heavy physics. Some unit operations — a reactive amine absorber is the clearest example — are governed by complex, kinetically-enhanced behaviour that has few good models; the right answer comes from an experienced engineer and real data. The system aims to get ~80% of the way, source the right people and parts, and be honest about the remaining 20% — not to pretend it has solved what it has not.

---

## 6. Where it is going

The direction is a **single guided pipeline that walks an engineer through the design iterations** — feasibility first (Part 1), then realisation (Part 2) — proposing options at each step, taking in real data, and consolidating everything that is normally spread out into one place.

That last step is where an experienced process engineer's view of the *workflow* — what the steps should be, what to put up for a decision at each one, and where real data should enter — would be genuinely valuable to shape.
