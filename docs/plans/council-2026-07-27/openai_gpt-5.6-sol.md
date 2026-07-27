### 1. Content-hash keying or remove the caches?

**Remove cross-product structural replay.** Retain only exact-input memoization.

Your proposed content hash is appropriate as a cache for repeating the same planning problem, but it should not be treated as a mechanism for transferring structure between “similar” products. Similarity-based reuse is retrieval or case-based reasoning, not caching; it requires adaptation and full revalidation.

The robustness currently provided by stale plans should be replaced with:

- a deterministic requirement-to-duty bootstrap;
- mandatory provenance from every module, edge, and tool to a requirement, duty, interface, or hazard;
- scale and contradiction checks before accepting the skeleton;
- fail-closed behavior if the planner cannot produce a defensible graph.

A weak fallback is an engine defect. Masking it with an unrelated donor design is worse because it fails confidently.

The landed patches are reasonable containment and need not be reverted immediately, but they are not the destination. Quarantine or purge existing class-authored candidates; changing keys does not make those artifacts trustworthy.

### 2. Is requirement keys + units the correct determinant?

**No. It is materially insufficient.** Omitting values recreates exactly the scale failure you observed: 120 W and 200 kW requirements can have identical keys and units.

Fingerprint the canonical, fully resolved planning input, including at least:

- requirement semantics, values, ranges, tolerances, priorities, and units;
- operating modes and duty cycles;
- interfaces, environment, hazards, regulatory constraints, and physical scale;
- explicit exclusions and architecture constraints;
- resolved defaults, regardless of whether class supplied them;
- provenance where it affects authority or interpretation;
- planner/schema/tool-library versions and relevant generation configuration.

Hash the normalized representation after defaults and unit normalization, not selected fields from it. If the derived requirements are themselves class-contaminated or incomplete, perfect cache keying still reproduces a bad plan; input validation is therefore separate and necessary.

Expect very little cross-product cache reuse. That is acceptable. Exact replay still buys determinism and cost savings for retries and unchanged briefs.

### 3. Should class contribute structure?

**Class may propose structure, but must never commit it.** Restricting it to scalar defaults and vocabulary is unnecessarily absolute: domain knowledge can usefully suggest likely safety isolation, calibration, containment, or sensing patterns. The prohibition should instead be against **class-only justification**.

The minimal enforceable rule is an admission invariant: every module, edge, and tool must trace to an accepted requirement, derived duty, interface, or hazard. “Selected because class=X” is not valid provenance. Class-derived candidates must pass the same scale, necessity, and contradiction checks as planner-generated candidates.

This is stronger than relying on author discipline and still allows useful priors.

### 4. What I would do first

**Immediately disable cross-product reads from all three structural stores and fail closed when a newly generated skeleton cannot pass admission checks.**

Do this first because the current system has a known, silent contamination path across at least 14 classes. Improving taxonomy or designing a better fingerprint while that path remains active permits more confidently wrong designs to be emitted.

### 5. Strongest argument against my position

The fallback planner may be so weak that disabling replay causes broad quality regression, higher cost, greater variance, and more omissions than the cached coherent templates caused. Provenance checks are also better at detecting unsupported additions than missing modules. Consequently, short-term pass rates could fall substantially.

That is real, but it exposes the actual capability gap instead of concealing it.

### 6. What to measure

Use a blinded suite containing repeated identical briefs, materially different products sharing a class, scale variants, and novel archetypes. Measure:

- unsupported/donor-specific modules, edges, and tools;
- requirement and hazard coverage;
- scale-order errors;
- skeleton critic scores and FAIL_FAST rate;
- repeat-run determinism, latency, and cost;
- provenance completeness.

The change is disproven if any same-class product inherits donor-only structure, or if novel-product plausibility remains below target despite zero cache contamination. It also fails operationally if validated fresh planning performs consistently worse than the old system without making failures explicit.