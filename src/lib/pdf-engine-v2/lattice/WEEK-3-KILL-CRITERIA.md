# Week 3 Kill Criteria — non-negotiable

These are committed BEFORE Week 3 begins. If any fires, the Lattice architecture has a generalisation problem; surface to Tristan, no Week 4.

CROSS-PRODUCT REUSE TESTS (the universality check):

1. **Vfarm radical reuse** — at least 70% of vfarm BoM lines must reuse existing radicals (post-Week-2 library). Sub-70% means BESS+vfarm don't share a substrate; the library bifurcates by domain.

2. **Heat pump radical reuse** — at least 70% of heat pump BoM lines must reuse existing radicals. Same as above.

3. **Character reuse across all 3 products** — at least 50% of characters used across BESS, vfarm, AND heat pump must appear in 2+ products. If most characters are single-product, the model is per-class-in-disguise.

4. **Refrigerant-cycle coherence test** — heat pump's vapour-compression cycle (compressor + condenser + expansion valve + evaporator + refrigerant charge) MUST decompose to a single ATOMIC word entry, NOT a composition of separate sub-archetypes. If the cycle is split, kill — the coherence rule is broken.

5. **Per-product growth caps** — vfarm new radicals ≤8, heat pump new radicals ≤8 (sub-linear growth). If either product needs ≥10 new radicals beyond the post-Week-2 library, we're approaching per-class-in-disguise.

If ALL FIVE pass: Lattice architecture is universal. Recommend dispatch of v1 production migration (8-11 week effort per first council).

If any fail: surface to Tristan with diagnostic. Do not proceed to v1 production migration.
