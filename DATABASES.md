# ForgeOS / Forge-Truth Databases

> Regenerated 2026-07-09. Canonical paths for agents — check here before hunting the filesystem.
> Growing-DB audit detail: [`FORGE-ENGINE-DB-AUDIT.md`](./FORGE-ENGINE-DB-AUDIT.md).
> Ingest jobs (live distributor APIs): [`scripts/ingest/README.md`](./scripts/ingest/README.md).

---

## Principle: chain is a DB consumer

The design chain (`scripts/serial-design-chain-v2.tsx` + gates) **must not** call live distributor APIs.
Reads go through `db-only-cascade.ts` / library lookups. Live Mouser/Digi-Key/Farnell/LCSC/Nexar
calls happen only in `scripts/ingest/*`.

Chain **may** write growing-DB rows (parts/specs/standards writeback, emitter completion) under
SQLite WAL + `busy_timeout`. With `WORKER_POOL_SIZE=2`, two chain children share one
`forge-truth.db` safely as concurrent readers + serialized writers.

Opt-in LLM part minting: `CHAIN_BLANK_MPN_GENERATE=1` (default off — DB-first only).

---

## Primary store: `~/.forge-truth/forge-truth.db`

| Table | Role | Writeback | Chain read |
|---|---|---|---|
| `pretraining_extracted_parts` | Parts library + RAG | ✓ `library-writeback.ts`, emitter completion, background enrichment | ✓ Stage 17.6 RAG, blank-MPN fill, db-only cascade |
| `pretraining_extracted_specs` | Spec slots (lock gate) | ✓ `specs-writeback.ts` (embed-on-write) | ✓ engineering lock gate |
| `pretraining_extracted_standards` | Standards citations | ✓ `standards-writeback.ts` (embed-on-write) | ✓ lock gate (advisory consume) |
| `pretraining_extracted_suppliers` → `companies` | Supplier roster | ✓ merge + `enrich-new-suppliers.ts` + persist-web-fallback | ✓ Engine D / enrich-state-with-suppliers |
| `supplier_embeddings` | 1536-d supplier vectors | ✓ embed-on-write with companies | ✓ dualSearch hybrid |
| `pretraining_spec_documents` | Datasheet / web stubs | ✓ web_extracted docs | ✓ specs join |
| `pretraining_products` | Product catalogue | ✓ `products-writeback.ts` (no embedding column yet) | ◐ lock gate records only |
| `material_prices` | Raw commodity £/kg | ✓ `seed-material-prices.ts` + `refresh-material-prices.ts` (offline) | ✓ `material-prices.ts` DB-first → curated fallback |
| `distributor_cascade_cache` | Cached distributor hits | ✓ ingest jobs only | ✓ db-only cascade / Stage 10.5 |
| `distributor_quota_usage` | Daily API caps | ✓ ingest semaphore | ✗ chain never touches |
| `class_reference_graphs` (+ nodes/edges) | Method / topology graphs | ✓ writebackDiscoveredNode/Edge | ✓ generic emitter + K10 |

**Supplier discovery profiles** (same DB, `companies` table ~28k rows): filters such as
`bess-supplier-discovery-20260422`, `manufacturing`, `cleantech-uk` — see historical notes in CLAUDE.md.

---

## Offline / scheduled growing-DB jobs

| Job | Script | Cadence | Notes |
|---|---|---|---|
| Weekly component sweep | `scripts/ingest/run-weekly-component-sweep.sh` | Weekly | Live distributor APIs → parts + cascade cache |
| Material price refresh | `npx tsx scripts/ingest/refresh-material-prices.ts` | Every 28 days (or cron) | DB-first → web-on-stale → write-back; live feed pluggable |
| Seed material prices | `npx tsx scripts/ingest/seed-material-prices.ts` | Once / after schema | Curated seed into `material_prices` |
| Supplier enrich (new rows) | `npx tsx scripts/ingest/enrich-new-suppliers.ts --write` | Post-merge + post-chain background | Brave + Flash-Lite; embed-on-write |
| Price ingest queue | `scripts/ingest/run-price-ingest.sh` | As queued | `~/.forge-truth/price-ingest-queue.jsonl` |
| Monthly OEM scrape | `scripts/ingest/run-monthly-oem-scrape.ts` | Monthly | Stub — see ingest README |
| Replay failed writes | `npx tsx scripts/ingest/replay-ingest.ts` | On demand | |

Post-chain: the chain already spawns `scripts/lib/background-enrichment.ts` (detached) for
parts + supplier web-fallback writebacks. That is the supplier post-chain enrich path —
do **not** call live distributors from the chain.

---

## Other stores (do not confuse)

| Store | Path | Use |
|---|---|---|
| Investor intel | `~/.forge-capital/forge-capital.db` (legacy name may say `forge-capital-corrupted.db` — still functional) | Forge Capital pipeline |
| Crawler corpus | `~/Developer/Forge-Capital/nightshift/crawler/corpus.db` (~99 GB) | Night Shift crawl |
| Design-stage LLM cache | `out/.design-cache/` (override `DESIGN_STAGE_CACHE_DIR`) | Determinism #86 replay ledger |
| Worker run dirs | `~/.pdf-engine-worker/runs/<job-id>/` | Per-job out-dir (N=2 pool) |

---

## Concurrency knobs

| Env | Default | Meaning |
|---|---|---|
| `WORKER_POOL_SIZE` | `2` | Parallel chain jobs in `pdf-engine-worker.mjs` |
| `OPENROUTER_MAX_INFLIGHT` | `4` | Per-process OpenRouter chat concurrency |
| `CHAIN_BLANK_MPN_GENERATE` | unset/off | Opt-in LLM part mint + writeback |
| `CHAIN_SKIP_CAD_EXPORT` | unset | Skip STEP/glTF separate download after Excel |
| `CHAIN_SKIP_BACKGROUND_ENRICHMENT` | unset | Skip post-chain growing-DB enrich |

---

## CAD downloads (not in Excel)

After `dossier.xlsx` is written, the chain fail-soft-exports:

- `out/<run>/cad/<run>-model.step` — analytic B-rep (`export_step.py`)
- `out/<run>/cad/<run>-model.glb` — browser preview (`export_gltf.py`)

Copies land in `~/Downloads/` as separate files. Never embedded or scored inside Excel.
