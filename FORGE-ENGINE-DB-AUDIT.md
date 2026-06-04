# Forge-Engine Knowledge-Store Loop Audit

_Generated 2026-06-04. Audits whether each database connected to the ForgeOS PDF-design engine implements the full **growing-DB loop** end-to-end. Read-only against `~/.forge-truth/forge-truth.db` (3.5 GB); temp test rows inserted via the real writeback shapes and DELETED (verified 0 leaks)._

**The 6-step loop each store must close:** (1) DB-first, (2) web/training on miss, (3) add, (4) embed (1536-d), (5) hybrid search (lexical LIKE + semantic, RRF-fused via the shared `dual-search.ts`), (6) retrieve + use.

**Verdict in one line:** Only **suppliers** closed the full loop originally; **as of 2026-06-04 (P1+P2+P3 fixes) parts, specs and standards now ALSO close it** — specs/standards embed-on-write (was NULL) and parts/specs/standards reads route through the shared hybrid `dualSearch` (was single-arm). **Products** and **methods** remain partial (no embedding column at all — structural/keyed — so they can never be hybrid by construction; products has a write-mostly step-6, methods has no web-on-miss). Remaining: methods web-discovery+embed (P6) and products embedding-column + lock-gate consumption (P5).

> **⮕ UPDATE 2026-06-04 — P1+P2+P3 CLOSED (parts · specs · standards).** Three surgical fixes landed: **(P1)** `specs-writeback.ts` + `standards-writeback.ts` now compute `embedText(...)` and INSERT `embedding, embed_hash` (was NULL — proven by temp-row tests: `length(embedding)/4 = 1536`, then deleted). **(P2)** the Stage 17.6 parts RAG (`g5-rag.ts::lookupCorpusSuggestions`) now routes through the shared `dualSearch` (RRF fusion of the LIKE + cosine arms), replacing the cosine-only `topMatch`/`loadCorpus` scaffold (now deleted), with the `RagSuggestion` return shape and SIM_* honesty buckets preserved and the productClass domain-anchor threaded from the chain. **(P3)** specs + standards reads gained a `1b` hybrid `dualSearch` stage between the exact keyed read and the web search, key-equality / normalised-name guarded so the lock gate still gets the EXACT slot. Two regression invariants extended/added: `UNIVERSAL.growing_db_writeback_embeds_on_insert` (now spans all four write-back paths) and `UNIVERSAL.knowledge_reads_are_hybrid` (parts+specs+standards route through dualSearch; the cosine-only scaffold stays deleted). `npx eslint --quiet` exit 0 on all changed files. The (a)/(c)/(d) matrix rows below are the pre-fix state for the record; the per-step ✓/✗ in the table above reflect the post-fix state.

> **The stale `DATABASES.md` / `CLAUDE.md` priors are WRONG as of 2026-06-04.** They claim specs/standards/products have "NO writeback path" and are "baked into TS only". That was true on 2026-05-26. Since then `lib/knowledge/{specs,standards,products,spec-documents}-writeback.ts` were added AND wired into the chain via `engineering-lock-gate.ts`. The DB proves it: `pretraining_spec_documents.source_type='web_extracted'` = **53 rows** (chain-grown). The real residual gap is narrower than the docs say: **embedding-on-write + hybrid retrieval**, not the whole loop.

---

## (a) The 6×6 matrix

Legend: ✓ works · ◐ partial · ✗ broken/absent. Evidence = `file:line`.

| Store | 1. DB-first | 2. Web/training on miss | 3. Add (writeback) | 4. Embed on write | 5. Hybrid (LIKE+sem, RRF) | 6. Retrieve + use |
|---|---|---|---|---|---|---|
| **1 parts**<br>`pretraining_extracted_parts` | ✓ chain reads DB-only cascade `db-only-cascade.ts:145` + RAG `g5-rag.ts` (now hybrid) + emitter LIKE `emitter-completion.ts:365` | ◐ **in-chain = LLM-generate** `emitter-completion.ts:462,829`; live-distributor web-on-miss is **out-of-band ingest only** (`recordDistributorHit` runs in `mouser/digikey/...`, called from `scripts/ingest/*`, NOT the chain — CHAIN-AS-DB-CONSUMER rule) | ✓ `library-writeback.ts:172` + `emitter-completion.ts:616` + `background-enrichment.ts:518` | ✓ embeds BEFORE insert `library-writeback.ts:170` / `emitter-completion.ts:614`; **TESTED dims=1536, self-cosine=1.0**; DB: 936+564+383+359 chain rows ALL embedded | ✓ **HYBRID (P2 FIXED 2026-06-04)** — Stage 17.6 RAG `g5-rag.ts::lookupCorpusSuggestions` now routes through the shared `dualSearch` (lexical `[part_name, manufacturer, raw_excerpt]` + cosine f32le_blob, RRF k=60); winner = RRF top-1, cosine of the winner drives the honesty bucket (SIM_* unchanged); productClass domain-anchor preserved. **TESTED: top-6 fused = 2 both-arm + 2 lexical-only + 2 semantic-only** (CATL M20280-E surfaced lexical-only; Tesla 1047404 semantic-only — single-arm would miss one). `emitter-completion.dbFirstLookup` (L365) stays its bespoke high-precision LIKE accept/reject (not a ranked retriever — left as-is) | ✓ RAG suggestion consumed `part-verification.ts:1599` (shape unchanged); completion word injected into BoM `emitter-completion.ts:801` |
| **2 suppliers**<br>`companies`+`supplier_embeddings` | ✓ `enrich-state-with-suppliers.tsx:1275` (dualSearch, DB-first) | ✓ web fallback persisted `persist-web-fallback.ts:381,564` | ✓ `persist-web-fallback.ts:467` UPSERT companies | ✓ embed-on-write same pass `persist-web-fallback.ts:49,552` → `embed-supplier.ts:199` (json_text 1536-d); **TESTED dims=1536** | ✓ **FULL hybrid** — shared `dualSearch` companies-LIKE + supplier_embeddings-cosine, RRF k=60; **TESTED: used_embedding=true, 50+50→6 fused** | ✓ chain spawns enrich `serial-design-chain-v2.tsx:5327`; suppliers → Sourcing Strategy section |
| **3 specs**<br>`pretraining_extracted_specs` | ✓ DB-first `specs-writeback.ts` (exact keyed) + **1b hybrid** `dualSearch` fallback, called in chain `engineering-lock-gate.ts:150` (lock gate, exit 22) | ✓ web-search on miss `specs-writeback.ts` (grounded Flash-Lite) | ✓ writeback `specs-writeback.ts` + deferred full-datasheet ingest; DB: 53+ `web_extracted` docs | ✓ **EMBEDS ON INSERT (P1 FIXED 2026-06-04)** — INSERT now carries `embedding, embed_hash`; `embedText([value, key, raw_excerpt])` computed BEFORE the INSERT (mirrors `library-writeback.ts:62`). **TESTED: temp row length(embedding)/4 = 1536, embed_hash set, then DELETED** | ✓ **HYBRID (P2/P3 FIXED 2026-06-04)** — read cascade now: exact keyed → **1b `dualSearch`** (lexical `[spec_key, spec_value, raw_excerpt]` + cosine f32le_blob, RRF) with a spec_key-equality precision guard → web. **TESTED: hybrid found the temp embedded spec [L=0 S=0]** | ✓ fills `contract.quantities[slot]` `engineering-lock-gate.ts:168`; also `parts-spec-validator.ts:71` DB-fallback specs |
| **4 standards**<br>`pretraining_extracted_standards` | ✓ DB-first exact-then-LIKE `standards-writeback.ts:75,90` + **1b hybrid** `dualSearch` fallback, called `engineering-lock-gate.ts:190` | ✓ web-search on miss `standards-writeback.ts:140` (BSI/IEC/UL domains) | ✓ writeback `standards-writeback.ts`; DB: shares `web_extracted` docs | ✓ **EMBEDS ON INSERT (P1 FIXED 2026-06-04)** — INSERT now carries `embedding, embed_hash`; `embedText([scope, name, raw_excerpt])` computed BEFORE the INSERT. **TESTED: temp row length(embedding)/4 = 1536, embed_hash set, then DELETED** | ✓ **HYBRID (P2/P3 FIXED 2026-06-04)** — read cascade now: exact → LIKE → **1b `dualSearch`** (lexical `[standard_name, scope]` + cosine f32le_blob, RRF) with a normalised-name containment guard ("IEC 62619"↔"IEC62619"/"BS EN 62619") → web. **TESTED: hybrid found the temp embedded standard [L=0 S=0]** | ◐ records `filled_standards` `engineering-lock-gate.ts:195` but result is **advisory** (captured to `0.6-…json`, light downstream use vs specs which patch the contract) — **unchanged (step-6 consumption is P7, out of this scope)** |
| **5 products**<br>`pretraining_products` | ✓ DB-first exact-then-LIKE `products-writeback.ts:65,73`, called `engineering-lock-gate.ts:212` | ✓ web-search on miss `products-writeback.ts:118` | ✓ UPSERT `products-writeback.ts:82` (ON CONFLICT product_name) | ✗ **table has NO `embedding` column** (TESTED via PRAGMA) — cannot embed even in principle | ✗ **NOT hybrid** — lexical only; no embedding column to fuse | ◐ class-level enrichment captured `engineering-lock-gate.ts:216` but **does NOT mutate the contract** (comment L208 "best-effort, non-fatal"); weakest consumption of all 6 |
| **6 methods**<br>`class_reference_graphs`/`_nodes`/`_edges` | ✓ DB-first JOIN `class-reference-graph-db.ts:509,522`, called in chain + generic-emitter | ✗ **no web-search** — on-miss = **baked-TS fallback** `class-reference-graph-db.ts:558` (+ bootstrap empty row L349). Not "search the web/own-training" | ✓ `writebackDiscoveredNode/Edge` `class-reference-graph-db.ts:400,442`; DB: 33 graphs / 398 nodes / 593 edges (chain-grown beyond the 24 baked) | ✗ **no `embedding` column** on nodes/edges (TESTED) — structural graph keyed by `product_class` | ✗ **NOT hybrid** — exact slug match (+ alias map); structural, no semantic | ✓ graph feeds K10 validator + generic emitter topology |

---

## (b) Per-store narrative — does the loop CLOSE, and the weakest link

### 1. parts — CLOSES, but not hybrid (the documented residual). **Weakest link: step 5 (hybrid).**
The loop is real and live: the chain reads DB-first (`db-only-cascade`), and on a gap two in-chain writeback paths fire — `completeEmitterGaps` (chain L3752) and `fillBlankWordMpns` (chain L4008) generate a real-OEM part via grounded LLM, **embed it before the INSERT**, and write it back; `background-enrichment.ts` (chain L6706) does the post-run pass. The DB proves the writeback works **and embeds**: every chain-written row is embedded (mouser 936/936, farnell 564/564, emitter_completion 383/383, digikey 359/359). Next run, that part is a DB-first hit. **The single gap is hybrid retrieval:** `g5-rag.ts` (Stage 17.6) ranks by cosine ONLY; `emitter-completion.dbFirstLookup` ranks by SQL-LIKE ONLY. Neither fuses the two. `dual-search.ts:39` even documents the exact drop-in call to fix this — it is simply not wired. **Nuance Tristan asked for:** the live-distributor "web-on-miss" (Mouser/DK/Farnell APIs → `recordDistributorHit`) does **not** run in the chain — by the deliberate CHAIN-AS-DB-CONSUMER rule it runs only in `scripts/ingest/*`. So in-chain "web/training on miss" = the LLM-generate path; the distributor-API path is an offline ingest job. That is "connection exists but is single-arm", not "missing".

### 2. suppliers — FULLY CLOSES. **Weakest link: nothing structural; semantic-only-saves was 0 on the test query (corpus already lexically rich for common needs).**
This is the reference implementation of the loop. `dualSearchCandidates` (enrich L1275) calls the shared `dualSearch` with the companies LIKE arm + the supplier_embeddings cosine arm, RRF-fused. On a thin archetype, `persistArchetypeWebCandidates` (persist-web-fallback L564) UPSERTs the web candidate into `companies` **and** writes its `supplier_embeddings` row in the **same pass** (the "no companies row without an embedding row" guarantee, L45-49). Live test: `used_embedding=true, 50 lexical + 50 semantic → 6 RRF-fused`; embed-on-write produced a valid 1536-d json_text vector. All six steps green.

### 3. specs — CLOSES the data loop, NOT the search loop. **Weakest link: step 4 (embed-on-write missing) → forces step 5 lexical-only.**
Contrary to the stale doc, specs is wired into the chain: `lockEngineering` (chain L2414, unconditional when a contract exists) calls `lookupSpec` for every hard slot — DB-first, then grounded web-search on miss, then writeback, and **the value patches `contract.quantities` in place** (real consumption, gates exit 22 if a hard slot stays empty). The two residuals: (a) the writeback INSERT (`specs-writeback.ts:113`) has **no embedding column in the column list** — TESTED, the row lands `embedding=NULL`; (b) the read is a keyed LIKE join, no semantic arm. So a web-discovered spec is found next time only by exact key match, and is invisible to any future semantic query until the **manual** `backfill-embeddings.ts` runs (it is not cron/chain-scheduled). The data grows; the *searchability* of the new data is deferred + lexical.

### 4. standards — CLOSES data loop, weaker consumption. **Weakest link: step 6 (advisory) tied with step 4 (no embed).**
Same shape as specs (DB-first exact-then-LIKE → web on miss → writeback, all chain-wired via the lock gate), with the same embed-on-write gap (TESTED `embedding=NULL`) and lexical-only read. It is one notch weaker on **use**: `filled_standards` is recorded into the lock-gate result JSON but does not patch the contract the way specs does — it informs jurisdiction/citation hygiene downstream rather than driving a quantity. So even when the loop grows the DB, the immediate in-dossier payoff is smaller.

### 5. products — loop runs but the OUTPUT is barely used. **Weakest link: step 6 (does not mutate contract) + step 4 (no embedding column).**
`lookupProduct` is chain-wired (lock gate L212) and the DB-first→web→UPSERT mechanics all work (TESTED UPSERT). But two real weaknesses: the `pretraining_products` table has **no embedding column at all** (so steps 4-5 are impossible by construction), and the lock gate explicitly **does not mutate the contract** with the result (`engineering-lock-gate.ts:208` "best-effort, non-fatal" — it only records `key_specs_count`/`standards_count` for the regression harness). So this is the loop that grows a DB nobody downstream really consumes yet. "Connection exists but is write-mostly + lexical-only."

### 6. methods — DB-first + writeback CLOSE; discovery + search do not. **Weakest link: step 2 (no web/training on miss) and step 4/5 (no embedding).**
`getClassReferenceGraphDBFirst` reads DB-first and `writebackDiscoveredNode/Edge` grow the graph (DB shows 33 graphs / 398 nodes / 593 edges — well beyond the 24 baked, so writeback has fired in production). But "on miss" means **fall back to the baked TypeScript registry**, then bootstrap an empty row — it does **not** "search the web and/or own-training" for a genuinely-new class's topology. And the graph is a structural object keyed by `product_class` string: nodes/edges have **no embedding column** (TESTED), so retrieval is exact-slug, never semantic. The loop closes for *known* classes (read → discover edge → write → richer next time); it does **not** self-generate topology for an unseen class from the web.

---

## (c) Test results — what was run + what it returned

Harness: a standalone Node/tsx script exercising each store's REAL read SQL and REAL writeback column-shape against the live DB; temp rows tagged `__FORGE_AUDIT_TEMP__` and DELETED. Final sweep verified **0 temp rows remaining** in all 6 tables + the spec_documents parent.

```
### STORE 1: PARTS ###
[read LEXICAL/LIKE — emitter-completion path] 'sensor' → 5 rows  (Sartorius BB-8804037 STR PT100, …)
[read SEMANTIC/cosine — g5-rag Stage 17.6]    'LFP 280Ah cell' → top sim=0.767: CATL M20280-E
  → HYBRID? NO (g5-rag cosine-only; emitter-completion LIKE-only; no dualSearch)
[embed-on-write] temp row dims=1536, embed_hash=set; self-cosine of written row = 1.0000 (searchable immediately)

### STORE 2: SUPPLIERS ###
[read HYBRID dualSearch] ok (hybrid: 50 lexical + 50 semantic → 6 fused, RRF k=60); used_embedding=true
  • Custom Technologies [L=0 S=0]  • Mid Fab Developments [L=3 S=1]   ← S-rank present ⇒ semantic arm live
[embed-on-write] companies + supplier_embeddings row: dims=1536, model=text-embedding-3-small, parsed_len=1536 (json_text)

### STORE 3: SPECS ###
[read LEXICAL keyed-join] key 'Weight' → '6.75' kg
[embed-on-write] replicated specs-writeback INSERT → embedding column = NULL  (writeback omits embedding!)

### STORE 4: STANDARDS ###
[read LEXICAL exact-then-LIKE] 'UL 1973' → scope 'System safety'; LIKE 'IEC' hit=yes
[embed-on-write] replicated standards-writeback INSERT → embedding = NULL  (writeback omits embedding!)

### STORE 5: PRODUCTS ###
[read LEXICAL] 'Tesla Megapack 3' (class bess); embedding column exists? NO
[write] UPSERT temp row ok=true (no embedding column → cannot embed)

### STORE 6: METHODS ###
[read DB-first] graph 'bess-utility-scale' → 11 nodes, 32 edges; edge embedding column? NO
[writeback] bootstrapped temp graph + wrote node ok=true; on-miss = baked-TS fallback only (NO web-search)

### CLEANUP ### all 6 tables + spec_documents: 0 temp rows remaining OK
```

**Supporting DB census (read-only):**
- Embedded coverage of CHAIN-written parts rows: `distributor:mouser` 936/936, `distributor:farnell` 564/564, `emitter_completion:llm` 383/383, `distributor:digikey` 359/359 → **embed-on-write is real for parts**.
- `pretraining_spec_documents.source_type`: `manufacturer_datasheet` 586, `distributor_listing` 562, **`web_extracted` 53** (chain-grown via lock gate), `chain_review` 1 → **specs/standards web-on-miss writeback HAS fired**.
- `companies` 28,833 / `supplier_embeddings` 26,981 → suppliers ~94% embedded.
- `class_reference_graphs` 33 / nodes 398 / edges 593 → methods writeback HAS fired (24 baked → 33 live).
- All rows in parts/specs/standards/suppliers currently show full embedding coverage in aggregate — because the **manual** `backfill-embeddings.ts` was last run; the per-write GAP only bites between a web-discovery and the next manual backfill.

---

## (d) Prioritised gap list — exact fix per broken/partial step

Ordered by leverage. "Connection exists but single-arm/keyword-only" is flagged distinctly from "missing entirely".

| # | Store · step | Severity | Diagnosis (exists-but-X vs missing) | Exact fix |
|---|---|---|---|---|
| **P1** | **specs · standards — step 4 embed-on-write** | ~~HIGH~~ **✅ DONE 2026-06-04** | **Exists but write omits embedding.** `specs-writeback.ts:113` + `standards-writeback.ts:107` INSERT no `embedding`/`embed_hash` → web rows un-embedded until a manual backfill. | **DONE.** Added the `embedText()` helper (exact copy of `library-writeback.ts:62`) to both files; both INSERTs now include `embedding, embed_hash` with recipe `[value/scope, key/name, raw_excerpt].filter(Boolean).join(' ')`, computed BEFORE the INSERT. TESTED: temp row `length(embedding)/4 = 1536`, embed_hash set, deleted (0 leaks). |
| **P2** | **specs · standards · parts — step 5 hybrid** | ~~HIGH~~ **✅ DONE 2026-06-04** | **Exists but single-arm.** parts read is cosine-only (`g5-rag.ts:303`) OR LIKE-only (`emitter-completion.ts:365`); specs/standards read is LIKE-only. `dual-search.ts` is built + tested + documented for exactly these tables but unused. | **DONE.** parts: `g5-rag.ts::lookupCorpusSuggestions` now calls `dualSearch({table:'pretraining_extracted_parts', lexicalCols:['part_name','manufacturer','raw_excerpt'], embedding:{…format:'f32le_blob',joinColumn:'id'}, where: engine_c_seed-excluded})`, injecting the batched query vector; emits the RRF top-1, cosine of the winner drives the SIM_* bucket; cosine-only `topMatch`/`loadCorpus` deleted. specs/standards (P3): a `1b` hybrid `dualSearch` stage (lexicalCols `['spec_key','spec_value','raw_excerpt']` / `['standard_name','scope']`) between the exact keyed read and web, key-equality / normalised-name guarded. TESTED: parts top-6 fused mixes both-arm + lexical-only + semantic-only; specs/standards hybrid finds the embedded temp rows. Invariant `UNIVERSAL.knowledge_reads_are_hybrid` guards regression. |
| **P3** | **parts — step 2 in-chain web-on-miss** | MED | **By-design out-of-band, not missing.** Live-distributor confirmation (`recordDistributorHit`) runs only in `scripts/ingest/*` (CHAIN-AS-DB-CONSUMER rule). In-chain miss → LLM-generate (`emitter-completion.ts:462`), which is real but unverified-MPN. | Acceptable as-is IF the weekly ingest sweep runs (`scripts/ingest/run-weekly-component-sweep.sh`). To tighten: have `fillBlankWordMpns` enqueue its generated (mfr, slot) to an ingest queue so a distributor pass promotes the descriptor to a real MPN before the next chain run. |
| **P4** | **backfill-embeddings not scheduled** | MED | **Exists but manual.** `scripts/ingest/backfill-embeddings.ts` covers parts/specs/standards/suppliers but nothing fires it (only `run-backfill-embeddings.mjs` by hand). The safety net for P1's gap is dormant. | Add a cron/GitHub-Action (or chain-end fire-and-forget) invoking `backfill-embeddings.ts`. Lower priority once P1 lands (writes self-embed → backfill becomes belt-and-braces). |
| **P5** | **products — step 4/5 + step 6 use** | MED | **Missing column + write-mostly.** `pretraining_products` has no `embedding` column; lock gate captures the lookup but **does not mutate the contract** (`engineering-lock-gate.ts:208`). | (a) `ALTER TABLE pretraining_products ADD COLUMN embedding BLOB; … embed_hash TEXT;` then embed on UPSERT (`products-writeback.ts:82`). (b) Wire `lookupProduct` envelope/key_specs into `contract.quantities` (like specs at L168) so the grown data is actually consumed. |
| **P6** | **methods — step 2 web-on-miss + step 4/5** | LOW | **Missing.** On-miss = baked-TS only (`class-reference-graph-db.ts:558`), no web/own-training topology generation; nodes/edges have no embedding (structural keyed lookup). | (a) On a genuine miss (no DB row, no baked graph), add an LLM/web step that proposes a node/edge skeleton for the unseen class, then `writebackDiscoveredNode/Edge` (the write path already exists + is tested). (b) Hybrid is low-value here (exact slug match is correct for a class ontology) — embedding could help fuzzy class-name match but is optional. |
| **P7** | **standards — step 6 consumption** | LOW | **Exists but advisory.** `filled_standards` recorded but not contract-mutating like specs. | If desired, feed `filled_standards` into the jurisdictional-standards gate (gate 19/10) as the authoritative citation source rather than re-deriving. |

---

### Bottom line for Tristan's scepticism

He is right to be sceptical that "they all work", but the failures are **narrower and different** than the stale docs imply:
- **They are NOT all broken.** All 6 read DB-first and 5 of 6 grow the DB (methods grows for known classes). The docs' "NO writeback for specs/standards/products" is **out of date** — those writebacks exist and have fired (53 web_extracted docs prove it).
- **The real systemic gap is the last mile of the loop, steps 4-5 (embed-on-write + hybrid):** only suppliers does it; parts has the embeds but not the fusion; specs/standards/products/methods are lexical-only and (except parts) don't embed their own writes.
- **3 most-broken loops:** (1) **products** — no embedding column AND its lookup result is discarded (grows a DB nobody reads); (2) **methods** — no web-on-miss discovery (can't self-generate topology for an unseen class, only baked fallback) and no semantic arm; (3) **specs/standards** — closest to done but writeback drops the embedding, so the grown rows are search-invisible until a manual backfill, and retrieval is keyword-only.
