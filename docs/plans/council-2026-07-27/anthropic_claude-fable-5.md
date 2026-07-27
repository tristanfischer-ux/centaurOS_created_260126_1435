## Q1 — Content-hash keying or removal?

Content-hash keying is acceptable, but be honest about what it is: with `sha1(derived requirements + units + scale tier)` as the key, cross-product hits will be vanishingly rare. Two independently-written briefs almost never produce identical derived-requirement sets. So your proposal is functionally **"remove cross-product reuse, keep per-brief memoization"** — determinism across reruns of the *same* brief, nothing more. That is the right scope for a cache, so I endorse it, but stop calling it structural reuse; it isn't.

The harder point: your own data shows the caches were never the whole disease. With `reused=false`, the run scored **2/10**. The miss path — the "domain-blind auto-planner fallback" the caches were protecting against — is itself broken. The robustness the caches provided was *masking a weak generator with a stale-but-coherent donor design*. If cross-class knowledge transfer is genuinely valuable, it should return as explicit **retrieval with adaptation and validation** (a named donor, checked against the brief's duties before acceptance), never as a silent key match.

## Q2 — Is `derived_requirement keys + units` the right determinant?

No — insufficient, and your own failure modes prove it. The 200 kW heat exchanger and the 16 A breaker on a 0.12 kW load are **magnitude** errors, not topology errors. Keys + units say "this product has thermal management"; they don't distinguish 50 W Peltier from 200 kW industrial. One envelope-level scale tier is too coarse: hash **per-requirement magnitude buckets** (order-of-magnitude bins per physical domain — power, mass, flow, force). Bin coarsely so paraphrase drift doesn't cause spurious misses; misses are cheap once the bootstrap path works, so err toward missing.

## Q3 — Should `class` contribute structure?

No, and don't enforce it by discipline. Two mechanical guards:

1. **Provenance on every structural element.** Every module, edge, and tool carries the requirement(s) that justified it. A hard gate fails the run if any element's provenance chain terminates in a class label rather than a brief-derived requirement. This also fixes your worst complaint — silent, confident inheritance — because reuse now names its donor at the element level, not the log level.
2. **Schema-level separation.** Defaults/tolerances/vocabulary live in a class-keyed store that structurally *cannot* hold nodes, edges, or tool specs. Make the wrong thing unrepresentable rather than reviewable.

## 4 — What I'd do FIRST

**Fix the bootstrap/miss path, not the cache keys.** This is where I diverge from your §6 ordering. Every genuinely novel product — the entire point of a "universal" engine — goes through bootstrap. It currently yields 2/10. Perfecting the cache key merely converts "confidently wrong inherited design" into "wrong fresh design." Get one clean-cache run of the cell cycler to a passing skeleton first. That also settles the strategic question: if bootstrap from the brief is good, the structural caches are pure cost optimization and the keying debate becomes low-stakes; if bootstrap can't be made good, then reuse-with-adaptation is load-bearing architecture and needs real design, not a hash.

Keep the landed patches — they're a correct hygiene improvement — but they're not the critical path.

## 5 — Strongest argument against me

The caches exist *because* the fallback was tried and produced worse results; "fix the generator" may be an open-ended LLM-quality problem with no bounded fix, whereas keying + provenance is a bounded change that stops silent corruption today. If the generator is fundamentally hard, case-based reuse with validation is the real architecture and I've told you to chase the expensive problem first.

## 6 — What to measure

- **Miss-path quality:** N fresh briefs (some sharing a class), cold caches — skeleton-critic plausibility and brief fidelity. Success: median ≥7, no cross-product module inheritance (verified via element provenance). **If miss-path plausibility stays ≤3–4, the keying direction was a distraction and the failure was never really about caches.**
- **Determinism:** same brief twice → identical skeleton hash.
- **Hit rate under the new key:** if ~0% over months, drop the structural caches outright and stop maintaining them.
- **Scale sanity:** zero order-of-magnitude mismatches between sized components and derived loads — a direct check for the breaker/HX failure class.