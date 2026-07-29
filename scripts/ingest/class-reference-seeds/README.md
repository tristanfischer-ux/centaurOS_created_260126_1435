# Class-reference seeds (universal)

Every product class should have a seed JSON here so design time is grounded in:

1. **Gold imagery URLs** — public exemplars used as a *training check* for form-follows-function (never mesh paste).
2. **Literature** — regs, white papers, OA theses, app notes → ingested into `forge-truth.db` with FTS5 + hybrid search.
3. **Visual invariants** — function-forced geometry rules (no OEM part numbers / named silhouettes).

## Add a class

1. Copy `formula_e_rear_mgu.json` → `<product_class>.json`
2. Fill `visual_invariants`, `gold_imagery`, `literature`, `search_hints`
3. Validate: `python3 scripts/lib/class_reference_corpus.py --selftest`
4. Ingest: `npx tsx scripts/ingest/ingest-class-reference-corpus.ts <product_class>`
5. Encode invariants into the universal form grammar (Blender / spine) — do not paste gold photos

## Search

- FTS whole-word: `searchClassReferenceFts({ productClass, query })`
- Hybrid: `searchClassReference({ productClass, query })` in `src/lib/pdf-engine-v2/lib/knowledge/class-reference-search.ts`
