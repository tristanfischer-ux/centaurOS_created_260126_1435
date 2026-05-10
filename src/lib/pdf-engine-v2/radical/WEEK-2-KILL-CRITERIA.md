# Week 2 Kill Criteria — non-negotiable

These are committed BEFORE Week 2 decomposition begins. If any fires, the Radical architecture is killed for BESS coverage; no Week 3 dispatch.

1. **Radical growth ratio** — new radicals added during BESS decomposition must be ≤ 3× the seed (5 → max 15 new = 20 total). >15 new radicals to cover BESS = atomistic too coarse, kill.
2. **Character growth ratio** — new characters added must be ≤ 5× the seed (10 → max 50 new = 60 total). >50 new characters = composite layer not capturing reuse, kill.
3. **Archetype growth ratio** — new archetypes added must be ≤ 10× the seed (10 → max 100 new = 110 total). >100 new archetypes for one product = the whole library is collapsing into per-product entries.
4. **Directionality test** — radical reuse rate (% of decomposed parts that mapped to existing radicals) MUST exceed word reuse rate (% mapped to existing words) by ≥ 3×. If reuse pattern inverts (more word reuse than radical reuse), the level structure is wrong.
5. **Coverage** — at minimum 60% of the BESS BOM lines must successfully decompose (radical → character → archetype). If coverage <60%, the seed library is missing fundamental concepts that no incremental growth will fix.

If ALL FIVE pass: Week 3 dispatch (decompose vertical farm + heat pump). If any fail: stop, surface to Tristan.
