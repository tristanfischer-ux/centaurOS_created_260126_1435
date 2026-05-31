# MPN Validation Architecture — council-validated plan (2026-05-31)

## Problem (root-caused on a BESS integration run)
The deterministic emitter places (manufacturer + part_number) on every sub-module (gate-23 requires ≥1 MPN word each, pre-Phase-2). A Phase-2 LLM repair prompt ("strip fabricated SKUs", Google-Search-grounded, biased *"better to strip than fabricate"*, serial-design-chain-v2.tsx ~line 1143) removes mfr+MPN combos it judges hallucinated. It is **over-aggressive and unreliable**: on one BESS run it stripped 6 structural parts — 3 REAL wrongly stripped (RUD VLBG-PLUS-4.0, Hawke ICG/501, ABB CT-05S-2000) + 2-3 INVENTED correctly stripped (Mersen "PVSP-600x800" = dimension-as-SKU, CIMC "ISO-1161-CC-A" = standard-as-SKU). Stripped words keep their manufacturer but lose the part_number → the dossier ships a brand with a **blank SKU**. gate-23 ran pre-strip, so nothing re-checks; the live chain ships incomplete content the regression harness rejects.

## Council verdict (Gemini 3.1 Pro + Grok 4.3 + DeepSeek V4 Pro — strong convergence)
- **KILL the LLM strip stage.** "An LLM cannot out-verify a cache." The deterministic distributor cache (`db-only-cascade::lookupCached`) + gate-20 (fictional-PN) + gate-13 (spec) are the proper, deterministic part validators. The LLM strip is the inferior duplicate of gate-20 — same anti-pattern as the 2026-05-31 consolidation (two systems for one job; keep the deterministic one).
- **Root flaw (Gemini): Phase 2 has write-access to Phase-1 structured part data.** Phase 2 must be prose-only / read-only on the BOM.
- **Uncatalogued parts → structured discriminated union, NOT free-text.** Every part: `{type:'mpn', manufacturer, mpn}` (cache-verified) OR `{type:'descriptor', text, class:'commodity'|'standard'|'custom'}`. Never blank, never a guessed SKU. The CIMC/Mersen cases are a **schema-mapping error** (standard-number / dimension wrongly placed in the MPN field) — fix at the emitter.
- **Deterministic MPN normalisation + alias map BEFORE cache lookup** (DeepSeek) — real parts ship under variant strings; a naïve lookup misses RUD/Hawke. Uppercase, strip dashes/spaces, curated alias map.
- **Re-run the completeness gate on the FINAL state**, accepting cache-verified-MPN OR descriptor.
- **De-risk with SHADOW/AUDIT mode first** — run the final-state gate log-only across all 35 classes, fix emitter gaps, THEN hard-enforce (else it crushes every class's pass rate on day one).

## ⚠️ CORRECTION (verify-before-build, 2026-05-31) — INC-1 is INVALID; the real root is CACHE COVERAGE
The council (and I) assumed the stripped parts were "real, cache-verifiable parts wrongly stripped." **The distributor cache disagrees:** all 6 stripped MPNs are confirmed-miss or absent (RUD VLBG-PLUS-4.0 miss=1, Hawke ICG/501 miss=1, ABB CT-05S-2000 absent, CIMC/Mersen/Würth miss/absent). So INC-1 (cache-restore) restores NOTHING.

**Measured scale (BESS, 141 emitter MPNs):** 20 (14%) cache-verified, **121 (86%) ABSENT** — and the absent ones are mostly GENUINELY REAL common parts (CATL LF280K, LEM HASS 100-S, Bender iso685-D-B, EPCOS/TDK thermistors, Klauke lugs). The cache is only 957 rows / 400 real hits, mostly electronics-distributor SKUs. So:
- The real root is **sparse cache coverage (~14%)** — neither the deterministic cache NOR the LLM can verify 86% of real industrial parts.
- "Replace LLM-judgment with cache-verification" (council) only works if the cache COVERS the parts. It doesn't. Fixing this is fundamentally a **growing-DB / ingest** problem: ingest the emitter's common part vocabulary so the cache can verify it. Ingest needs live distributor APIs (the background job, NOT the chain — quota) → flag for Tristan before burning quota.

## Sequenced increments (REVISED for the cache-coverage reality)
- **[INC-1] ~~cache-restore~~ — DROPPED (no cache-verified stripped parts to restore; verify-before-build caught this).**
- **[INC-2] Final-state completeness gate in SHADOW mode (SAFE — DOING NOW).** Re-run gate-23 on the final post-Phase-2 state, LOG-ONLY to actions.jsonl (don't fail). Makes the "shipped incomplete" problem visible in the live chain (currently only the dev harness sees it) + gives corpus data on scale across all 35 classes. Zero risk. Council-prescribed de-risk step.
- **[INC-2] Final-state completeness gate in SHADOW mode.** Re-run gate-23 (+ 24/29) on the final post-Phase-2 state, LOG-ONLY (don't fail). Gives corpus data on what's still incomplete across all 35 classes. Zero risk.
- **[INC-3] Structured part type (discriminated union) at the emitter.** `{type:'mpn'|'descriptor'}`. Emitter emits descriptors for genuinely-uncatalogued commodity/standard/custom parts (ISO-1161 corner casting → standard; arc-flash barrier → custom/made-to-drawing) instead of inventing a SKU. Renderer + gates + harness updated to the polymorphic field; legacy flat columns as a view. **This is the 35-class schema refactor — biggest ripple, needs the shadow data from INC-2.**
- **[INC-4] Kill the LLM strip behaviour** from the Phase-2 prompt (now redundant: cache-restore + descriptors + gate-20 cover validation). Phase 2 becomes prose-only on part data.
- **[INC-5] Flip the final-state gate from shadow to HARD** once INC-3 has the emitter emitting clean descriptors and the corpus is green in shadow.
- **[INC-6] Mechanical BOM render from the frozen Phase-1 struct** (Gemini) + a descriptor→cache promotion feedback loop (DeepSeek: log descriptors, quarterly promote any now-catalogued part to MPN).

## Status
INC-1 in progress (2026-05-31). The rest are tracked here; INC-3 is the schema refactor that needs shadow data (INC-2) before it's safe to enforce.
