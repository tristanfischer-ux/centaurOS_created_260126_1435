## 1. Content-hash keying vs. removal of structural caches

**Remove them.** Content-hash keying is a more principled cache invalidation strategy, but it’s still solving the wrong problem. The structural caches exist to protect against a “domain-blind auto-planner fallback” that produces worse output than a stale-but-coherent plan. That framing reveals the real issue: *the fallback is broken*, and the caches are a bandage.

A content hash of derived requirements will collapse reuse to near-zero for genuinely novel products—the exact case where you need the engine to work. For products similar enough to collide, it might hit, but that’s a narrow window. You’ll end up bootstrapping almost every time anyway, paying the full cost without the cache’s benefit.

The honest move is to remove the structural caches entirely, accept the cost and variance increase, and **fix the auto-planner fallback** so it produces competent skeletons from requirements alone. The comments say this was “hard-won” robustness, but the evidence says otherwise: the protected output was *never tested against a second product in the same class*. That’s not robustness; it’s fossilized luck.

**Replace the caches with an auditable, deterministic bootstrap pass that runs on every product, every time.** The “domain-blind” problem should be solved by giving the planner better domain grounding (units, scale tiers, physical constraints), not by memorizing one skeleton per class.

## 2. Is derived-requirements + units + scale tier the right hash input?

No. It’s better than class, but it’s still a guess. The derived-requirement set is itself a product of the brief + the classifier + the requirement-derivation pipeline. Two genuinely different products can produce similar derived requirements if the pipeline is shallow. Two similar products can diverge if phrasing shifts.

If you were going to cache (which I argue you shouldn’t), the correct input is a structural embedding of the *brief itself*, not an intermediate representation that already lost information. But this is a research problem, not an engineering fix, and it’s not worth solving for a cache you should drop.

## 3. Should `class` contribute structure at all?

**No structure. Only defaults, tolerances, vocabulary, and constraints.**

The class taxonomy is a labeling convenience, not a causal determinant of what a product *needs*. A gimbal doesn’t belong in a cell cycler because they happen to share a classifier bucket. The minimal change to enforce this: add a lint rule or test assertion that no graph-edge, module, or tool originates from a class lookup. Class-sourced data goes through a separate path that only feeds parameter defaults (e.g., “typical bearing preload for consumer electronics”) and never topology.

But enforcement by discipline will fail. The codebase should make it *impossible* to call a function that returns a module skeleton from a class key. Delete the function that does it.

## 4. What I would do FIRST

**Remove `class_graph_candidates` and `class_tool_plan_candidates` entirely.** These are the two caches that dictate topology. `tool_creation_proposals` is less dangerous—it maps duties to tool types, which is closer to a defaults function—but I’d scope it too.

I’d start here because it’s irreversible in the right way: you can’t accidentally reintroduce class-keyed structure if the store doesn’t exist. The downstream bugs it exposes (bad fallback output) are the *real* bugs you need to fix.

## 5. Strongest argument against my position

**Cost and determinism.** Removing the caches means every product bootstraps from scratch, every run. That’s higher LLM cost, higher latency, and non-deterministic output across runs for the *same* product. If the auto-planner fallback is genuinely worse than a bad cache hit—and it might be for some classes—you’ve regressed the floor for existing products to fix a ceiling for novel ones. The cache was solving a real problem for repeated runs of the same product; content-hash keying would preserve that while fixing the cross-product contamination.

## 6. Measurement

**Measure:** run the *existing* benchmark suite against all previously built archetypes (the 14 classes with stored graphs) after removing the caches. Compare:

- `plausibility` and `internal_coherence` scores (must not regress)
- `bootstrapped_vs_cached` rate (should be 100% bootstrapped)
- LLM token cost per product (report the delta)

**What proves it didn’t work:** any archetype whose plausibility drops below 5/10 where it was previously ≥7/10, *and* where the degradation traces to the auto-planner producing a worse skeleton than the stale cache did. That would mean the fallback needs hardening before the caches can be removed. In that case, content-hash keying is the interim step while you fix the planner—but it’s an interim step, not the end state.