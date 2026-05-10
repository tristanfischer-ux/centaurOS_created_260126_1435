# First Light Kill Criteria — non-negotiable

These are committed BEFORE the spike begins. If any of them fires during First Light Week 1, the Lattice architecture is killed; no Week 2 dispatch.

1. **Property cascade integrity** — A character that contains radical "steel" must inherit `steel.density = 7.85 g/cm³` without override. If the character's resolved density is anything else, kill.
2. **Grammar rule firing** — The KCL rule (Kirchhoff's Current Law) must fire on a deliberately broken test composition (a circuit with current_in ≠ current_out) and PASS on a balanced one. Both polarities must be observed. If the rule produces same verdict for broken + balanced, kill.
3. **Inheritance with override** — A character with modifier "316L grade" must override its parent radical "steel"'s `corrosion_marine_acceptable = false` to `true`. If override doesn't work, kill.
4. **Archetype layer present in schema** — `Archetype` type must exist between `Modifier` and `CatalogueEntry`. Property API must successfully resolve through Archetype. If Archetype is collapsed into Catalogue Entry, kill.
5. **Relaxation weight applied** — Two grammar rules must conflict on a test composition; the lower-weight rule must relax with the tradeoff EXPLICIT in the engine's output. If the engine returns "no valid composition" instead of relaxing, kill.

If ALL FIVE pass cleanly: First Light succeeds, dispatch Week 2 (decompose BESS into the new schema using only the existing primitives library — measure how many new entries are needed).
