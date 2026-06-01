# Discover-on-miss part-number stage — design (for coding-council review)

**Directive (Tristan, 2026-06-01):** the engine must be universal + create new products in new classes on the fly. The pretraining parts DB must self-generate: **search DB first → on miss search Internet + own training → verify → add to DB → take from DB.** Goal: lift the bill-of-materials section ≥8 by giving non-BESS classes real, branded part numbers (today haps = 7% MPN coverage, BOM 7.33).

## What already exists (do NOT rebuild)
`src/lib/pdf-engine-v2/lib/emitter-completion.ts :: completeEmitterGaps()` runs in-chain at `serial-design-chain-v2.tsx:3436` (just before gate-23). For every **empty sub_module** (zero part_number words) it injects ONE word, sourcing the part **DB-first** (`dbFirstLookup`, high-precision whole-word match against `pretraining_extracted_parts`) → on miss **generate** (grounded LLM `generatePart`) → **writeback** (`writeBackGenerated`, class-tagged `<class>_completion`, conf 0.6). This is the growing-DB principle already applied to gate-23.

**Two deliberate limits (the gaps vs the directive):**
1. It only fills **empty sub_modules**. The 76 blank haps words live **inside populated sub_modules** (the sub_module already has ≥1 word, so gate-23 passes and they're never visited).
2. On the generate path it **always defers** — emits `honestDescriptorMpn()` = `"specify exact MPN at detailed design"`, keeping the real LLM-proposed MPN only in the DB writeback. There is **no verify step**, so it never promotes a generated part to a real structured MPN. Those deferred/placeholder words ARE the generic BOM lines.

## Hard constraints a correct build MUST respect
- **Gate-20 (fictional-pn, exit 20) reads the DB-only distributor cache** (`distributor_cascade_cache`) + `KNOWN_PART_AUTHORITATIVE`, NOT live APIs. A structured MPN emitted into the BOM **passes gate-20 only if it is in that cache / table**. Brave "≥1 web hit" is NOT sufficient — emitting a Brave-only-verified structured MPN would fail exit 20.
- **CHAIN-AS-DB-CONSUMER (CLAUDE.md, hard principle, quota-protection):** no chain-side code calls live distributor adapters. Live web/distributor calls happen ONLY in ingest/background-enrichment jobs. So the in-chain stage is **DB-read-only**; the live "search Internet + verify" leg is an **enrichment job**, not in-chain.
- **Gate-15 (slot-mispin):** a wrong-type pin (M12 connector into a main-shaft-seal slot) fails. `dbFirstLookup` is already high-precision (head-noun + ≥2 tokens, or ≥3 tokens, whole-word) to avoid this. Widening to words must keep that precision.
- **Catalogue vs structure:** a carbon wing spar / GaAs laminate / welded enclosure is **fabricated from material**, not bought as a part — it should cost £/kg (`material-prices.ts :: isMaterialDominated`), NOT carry an MPN. The stage must SKIP material-dominated words.

## Design — Increment 1 (two parts, both respecting the constraints above)

### Part A — in-chain: widen completion to blank catalogue WORDS (DB-read-only, gate-20-safe)
Generalise the completion layer to also visit **words with a blank/placeholder part_number inside populated sub_modules**:
- **Selector:** a word is a discover-candidate when (a) it has no real `part_number` modifier — absent, empty, or the `"specify exact MPN…"` placeholder, or a non-structured descriptor; AND (b) `isMaterialDominated(name) === false` (catalogue/assembly, not a £/kg material); AND (c) `inferComponentClass(name)` resolves to a catalogue-leaning class (`electronic_*`, `sensor`, `motor_actuator`, `battery_cell`, `oem_subsystem`, `optical`, `magnetic`, `thermal`, `fluid_path`) — NOT `structural_*`/`mechanical_fastener`.
- **Fill:** DB-first via the existing `dbFirstLookup` (cache/library). If a **cache-real** structured part is found → emit the structured MPN (gate-20-safe). Else → leave the word as-is / honest descriptor (NO unverified structured MPN in-chain).
- Reuses `buildCompletionWord`, `isMaterialDominated`, `inferComponentClass`, `dbFirstLookup` verbatim. No live calls. Cannot break gate-20 (only emits cache-real structured MPNs) or chain-as-DB-consumer (DB-read-only).

### Part B — enrichment: the DISCOVER leg (live, capped, grows the DB so next run hits)
Extend `background-enrichment.ts` (already a post-chain enrichment job with Brave + writeback) to, for each **blank catalogue word** in the state, do the directive's middle leg:
1. **own training:** LLM proposes a real (manufacturer, MPN) for {class, description} — `generatePart` exists.
2. **verify exists:** confirm via the **distributor cascade** (the ingest-side live lookup — allowed in enrichment) — a real hit. (Brave as a weaker secondary signal only.)
3. **add to DB:** write the verified hit to BOTH `distributor_cascade_cache` (so gate-20 passes next run) AND `pretraining_extracted_parts` (class-tagged, so `dbFirstLookup` serves it). Unverified → NOT written as structured (no DB poisoning — the gate-20 rationale).
4. Next chain run: Part A's DB-first now **hits** → emits the real structured MPN → coverage climbs.

**Demonstrating the lift:** run enrichment to grow the DB for haps's blank catalogue words → re-run haps → measure MPN-coverage + BOM score before/after.

## Regression invariant
`UNIVERSAL.discover_skips_material_words` — the blank-word selector picks an electronic/catalogue word (e.g. a motor driver) but SKIPS a material/structural word (wing_spar, gaas_solar_laminate) so we never try to pin an MPN on a fabricated structure. Plus: the in-chain Part A never emits a structured MPN that isn't cache-real (gate-20 can't regress).

## Questions for the council
1. Does Part A break gate-20, gate-15, gate-23, or chain-as-DB-consumer? (Intended: no — DB-read-only, cache-real-only structured emission, high-precision pin, catalogue-only.)
2. Is the catalogue-vs-structure filter (`isMaterialDominated` + `inferComponentClass`) sound, or will it misclassify (e.g. a "battery_pack_enclosure" — structure? or a bought enclosure with an MPN)? What's the failure mode?
3. Part B writes verified hits to `distributor_cascade_cache` — is that the right cache shape/key for gate-20 to read them? Any risk of poisoning if the distributor "hit" is a near-match not an exact part?
4. Single-pass inline-discovery (bend chain-as-DB-consumer with strict caps, so ONE run does the whole loop) vs two-pass (Part A in-chain + Part B enrichment + re-run). Which is right given quota-protection is the principle's purpose?
5. Any cheaper/simpler universal lift we're missing?

---

## STATUS — coding-council done + Phase 1 built + empirically tested (2026-06-01)

**Council (3 seats) verdicts:**
- **BLOCKER (seats 1+2): the catalogue-vs-structure filter was wrong.** `isMaterialDominated` is an assembly-cost signal, misfires (`motor_pylon_mount` passes via "motor"; `flight computer`/`connector` skipped). FIXED → dedicated `isCatalogueComponent` (STRUCTURAL/CATALOGUE token sets + head-noun tiebreak), scores 8/8 on the council's test-names.
- **DEFER Part B (all 3 seats):** the live-discover leg poisons gate-20 if a near-match is cached as exact (seat 1's #1 bug), `background-enrichment.ts` is exempt from the chain-as-DB-consumer regression test, and it's net-new code that only helps the next run. Build it later WITH the guards (exact proposed==returned MPN before `miss=0`; write `distributor_cascade_cache`; extend the regression test).
- **Honest lift (seats 2+3): ~7.8–8.1, not reliably ≥8** for exotic classes — the parts aren't on distributors. Crossing 8 needs targeted ingest.

**Phase 1 BUILT (Part A only, the safe consumer):**
- `fillBlankWordMpns` (src/lib/pdf-engine-v2/lib/emitter-completion.ts) — brands blank CATALOGUE words DB-first (gate-20-safe: pins only come FROM `pretraining_extracted_parts`, the table gate-20 reads), generate-on-miss (real OEM + honest deferred MPN) + writeback. Wired post-Phase-2 (chain ~3675). Regression invariant `UNIVERSAL.discover_skips_material_words`.
- **Empirical test on haps (DB-first only): 12 clean fills, 0 nonsense mis-pins** (6→18 real-MPN words). Spectrolab XTJ-PRIME, Orion BMS, Cube Orange+, Cobham S-band, Honeywell heater, Trinamic stepper driver, Genasun MPPT — spot on. The token matcher needed HARDENING (maker-vendor reject + motion/sensor class rules + per-sub_module dedup) to kill demonstrated mis-pins (a TI op-amp pinned as an ESC; a hobby servo on aerospace; one crystal on three battery parts).

**KEY EMPIRICAL FINDING (the embedding RAG probe):** even the precise class-scoped embedding RAG (`queryLibraryCandidates`) returns sim 0.48–0.62 + many null rows for HAPS — **the library genuinely lacks real stratospheric-UAV parts.** So DB-first (token OR embedding) cannot lift exotic classes with quality; **the lift requires GROWING the DB (Part B web-discover, or targeted ingest)** — which is Tristan's directive's middle leg. Drawer `forgeos_decisions_786b308612f44f39` + `274055be22b7c3e0`.

**Next (supervised): Part B — the grower**, with the council's guards. Then re-run + re-score for the BOM before/after.
