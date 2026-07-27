# Class-keyed design memory: the second product in any class inherits the first one's design

**2026-07-27 · ForgeOS / CentaurOS · for review by Cursor and other model seats**
**Status: three patches landed and pushed (`f29cee87f`), problem NOT solved. Seeking a second opinion on the direction, not on the patches.**

---

## 0. What I want from you

Read §1–§5, form your own view, then tell me where §6 (my recommendation) is wrong. I am specifically **not** asking you to review the code I already wrote — I am asking whether the direction is right, because I think the patches I landed are correct-but-insufficient and I would rather be argued out of the next step than commit to it alone.

The three questions I care about are in §8.

---

## 1. What the engine claims

ForgeOS's stated AIM, in its own words, is a **universal engine — any/unknown archetype, ≥8 floor on every section, self-learning and self-correcting**. "Universal" is not marketing here; it is the design constraint that justifies the architecture. Every fix in this codebase is required to be universal, keyed off nouns/units/provenance rather than per-class tables (the CORE FIX PRINCIPLE, in `CLAUDE.md`).

The test of that claim is: can it design something it has never seen?

## 2. The observed failure

A **benchtop 8-channel battery cell cycler** — a desk-sized lab instrument, mains powered, Peltier-controlled cell bay, three PCBs, ~£1,400–2,000 prototype BoM. Written fresh, no prior art in the repo.

The classifier assigned it `consumer_electronics` (HIGH confidence). It then produced, before any LLM "painting":

- an `actuation_kinematics` module with a **2-axis gimbal (NEMA 17, slip rings, absolute encoders, roll/pitch rings) to "time-average gravity"**
- a `mass_fluid_transport_process` module with a **microfluidic cassette perfusion pump**
- **fluorescence / brightfield imaging** in sensing
- a **200 kW shell-and-tube heat exchanger** and a £39,000 environmental-interface module, on a desktop box
- later, **industrial refrigeration** (evaporator and condenser coils) for a Peltier bay

Skeleton critic: **plausibility 1/10**, "tool skeleton is unrecoverable; reviewer cascade will NOT fix this."

None of that is in the brief. All of it belongs to a **microgravity RPM appliance** — the only prior product ever classified `consumer_electronics`.

## 3. Root cause

Three separate stores are keyed on **product class alone**:

| store | what it fixes for the whole class |
|---|---|
| `tool_creation_proposals` | which calculation tools run |
| `class_graph_candidates` | **the module skeleton** (nodes/edges) |
| `class_tool_plan_candidates` | **the ordered tool plan** |

Verbatim from the run log:

```
[generic-emitter] graph BOOTSTRAPPED for slug='consumer_electronics':
  9 nodes / 15 edges — candidate_id=13, version=1, reused=true
[bootstrap-tool-plan] REUSING stored candidate slug=consumer_electronics version=2
[tool-creation] PROPOSAL-CACHE HIT for consumer-electronics: replaying 5 stored duty spec(s)
  (rpm-kinematics:microgravity-simulation, microfluidics:shear-stress, gimbal-dynamics:torque-sizing)
```

Each store's stated purpose is legitimate — determinism, cost, and avoiding a "domain-blind auto-planner fallback". The bug is not that they cache. It is **what they use as the key**.

**Blast radius, measured:** 14 distinct class slugs are already stored in `class_graph_candidates`, 13 in `class_tool_plan_candidates`, 14 in `tool_creation_proposals`. Each was written by whichever product reached that class first. Every archetype built to date was the *first* in its class, which is exactly why this never surfaced until now.

## 4. What I changed, and why it is not a cure

I scoped all three store keys by the envelope's own `application` descriptor — `<class>__<8hex(application)>` — touching the **store key only**, so `slug` still names the class everywhere else and no hashed name leaks into `graph.product_class` or downstream lookups.

Measured effect across the three fixes:

| | before | after |
|---|---|---|
| graph reuse | `reused=true` | `reused=false` |
| brief fidelity | 1/10 | 2/10 |
| plausibility | 1/10 | 2/10 |
| internal coherence | 2/10 | 4/10 |
| honesty | 3/10 | 5/10 |
| HIGH issues | 5 | 3 |

Still **FAIL_FAST**. Remaining: wrong-scale refrigeration (the tool-plan patch landed after that run and is untested against it), a 16 A main breaker sized for a 0.12 kW connected load, and every part number `TBD`.

**Why I call it a patch:** I replaced one string key with a slightly longer string key. Two products whose `application` strings happen to match still collide. The same product whose `application` drifts by a word gets a spurious miss. I have made collisions *less likely* without changing the thing that makes them possible.

## 5. The question underneath

**Should the engine reuse design STRUCTURE across products at all?**

A cache key must be a function of everything that determines the output. For a module skeleton, the determinant is the *brief and its derived duties* — not a label. `class` is not that function. `class + application` is a better approximation of that function. Neither *is* it.

There is a real trade-off, and I want it named rather than assumed away:

- **Reuse buys** determinism across runs, LLM cost, and — per the code's own comments — protection from a "domain-blind auto-planner fallback" that has previously produced worse results than a stale-but-coherent plan.
- **Reuse costs** correctness the moment two products share a key. And it fails *silently and confidently*: nothing flagged the inheritance, the skeleton simply arrived wrong and a downstream critic caught it four stages later.

## 6. My recommendation

**Key the structural caches on a content hash of the INPUTS that determine the structure — the derived-requirement set — and demote `class` to a defaults hint that can never contribute a module.**

Concretely:

1. Cache key = `sha1(sorted derived_requirement keys + units + the envelope's scale tier)`. Two genuinely similar products still hit; two different products cannot. This is the ordinary correct answer for a cache: hash what determines the output.
2. `class` continues to select defaults, tolerances and vocabulary. It must never be the *source* of a module, a tool or an edge.
3. On a miss, bootstrap — which is already the documented fail-safe in all three stores.
4. **Log every reuse with its key and the product that wrote it.** The worst property of this bug was not that it happened; it is that `reused=true` appeared in a log nobody reads and the design changed underneath. A reuse that names its donor is auditable.

**Why this rather than the alternatives:**

- *Keep class keys, add more scoping dimensions* — this is what I did. It postpones the collision rather than removing it, and each new dimension is another guess about what makes two products "the same".
- *Drop the caches entirely* — honest, and it would work, but it discards a real robustness property the comments say was hard-won, and it raises cost and run-to-run variance on every product. I do not think correctness requires going this far.
- *Fix the classifier so the cycler lands elsewhere* — treats the symptom. There is no generic "benchtop electrical test instrument" class; the instrument classes are product-named (`potentiostat`, `lab_microscope`, `benchtop_bioreactor`). Adding one class per product is the opposite of a universal engine, and the next unseen archetype hits the same wall.

**My confidence:** high that class-alone is wrong and that structure must derive from the brief. **Moderate** on content-hash keying being the right replacement — it may reduce reuse so far that the robustness benefit disappears, in which case dropping the caches and fixing the fallback is the more honest end state.

## 7. A second, smaller finding

The classifier put a laboratory test instrument in `consumer_electronics` with HIGH confidence. Even with the caches fixed, that is a poor home for it. The class taxonomy is product-named rather than functional, so genuinely novel instruments have nowhere to go. I have **not** fixed this and I am not sure it should be fixed by adding classes.

## 8. What I would like your view on

1. **Is content-hash keying right, or should the structural caches be removed?** If removed, what replaces the robustness they were protecting (the "domain-blind auto-planner fallback")?
2. **Is `derived_requirement` keys + units the right determinant set** for a module skeleton, or is there a better one? I am not confident this is the correct hash input.
3. **Should `class` be able to contribute structure at all**, or only defaults? If only defaults, what is the minimal change that enforces that rather than relying on discipline?

Disagreement is more useful to me than agreement here. If you think the three patches already landed are wrong and should be reverted, say so plainly.

---

## Appendix — reproduction

```bash
# The brief (clean provenance, written 2026-07-27)
briefs-loop/benchtop_cell_cycler.md

# The failing run
npx tsx scripts/serial-design-chain-v2.tsx \
  briefs-loop/benchtop_cell_cycler.md out/cell-cycler-v2

# The evidence, in the log
grep -E "graph BOOTSTRAPPED|REUSING stored|PROPOSAL-CACHE|skeleton critic|FAIL_FAST" \
  out/cell-cycler-v2/chain.log
```

Commits: `89810bccd` (tool proposals), `f29cee87f` (class graph + tool plan).
Files: `scripts/lib/orchestrator/generic/{tool-creation-pass,bootstrap-class-graph,bootstrap-tool-plan}.ts`.
Engine guards pass; `bootstrap-class-graph.test.ts` 21/21.
