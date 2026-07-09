# scripts/ingest — Distributor ingest jobs

These scripts populate `~/.forge-truth/forge-truth.db` with distributor catalogue
data. They are the ONLY code permitted to call live distributor APIs.

Chain-side code (gates, orchestrator tools) must NEVER import from these scripts
or from `src/lib/pdf-engine-v2/lib/distributors/{mouser,digikey,farnell,lcsc,nexar}.ts`.
See `src/__tests__/chain-must-be-db-only.test.ts` for the enforcement regression.

---

## Jobs

### `run-weekly-component-sweep.sh`

**Frequency:** Weekly (Sunday 02:00)
**Quota usage:** up to 1000 Mouser + 1000 DigiKey calls/day across the sweep
**What it does:** Iterates every enabled entry in `scripts/distributor-keyword-map.ts`
and calls `scripts/ingest-distributor-catalogue.ts` per entry. Writes to
`pretraining_extracted_parts` + `distributor_cascade_cache` in forge-truth.db.

**Output:** `~/.forge-truth/ingest-weekly-<date>.log`

**Usage:**
```bash
set -a; source ~/.claude/secrets/distributor-apis.env; set +a
bash scripts/ingest/run-weekly-component-sweep.sh
```

**Overrides:**
- `SWEEP_DISTRIBUTOR=mouser` — only run Mouser entries
- `SWEEP_DRY_RUN=1` — print commands without executing
- `SWEEP_MAX_ENTRIES=10` — stop after N entries (useful for testing)

---

### `run-monthly-oem-scrape.ts`

**Frequency:** Monthly
**Quota usage:** None (direct OEM website scraping, no API keys required)
**What it does:** Scaffolds scraping of 10 BESS OEM product pages (Sungrow,
ABB, Grundfos, Beckhoff, Kidde, Stat-X, SMA, GE LV5+, Hitachi Energy, Pfannenberg).
Currently a STUB — logs TODO entries with URLs and manual-curation instructions.

**Output:** `~/.forge-truth/ingest-monthly-oem-<date>.log`

**Usage:**
```bash
npx tsx scripts/ingest/run-monthly-oem-scrape.ts
```

**Status:** Stub. Individual OEM scrapers need implementing in the `scraperReady: true`
path. Until then, follow the `manualInstructions` in each OEM_TARGETS entry.

---

### `replay-ingest.ts`

**Frequency:** On-demand, after any failed ingest run
**Quota usage:** Only re-runs previously successful API calls whose DB write failed
**What it does:** Reads `~/.forge-truth/ingest-replay.jsonl` (populated by
`scripts/lib/ingest-replay.ts` on write-back failures) and re-attempts the DB
write. Currently a STUB — logs entries and retains them.

**Usage:**
```bash
npx tsx scripts/ingest/replay-ingest.ts [--dry-run]
```

---

### `refresh-material-prices.ts` / `seed-material-prices.ts`

**Frequency:** Every 28 days (or cron); seed once after schema create
**Quota usage:** None until a live commodity feed is wired (`TRADING_ECONOMICS_KEY`)
**What it does:** Growing-DB half of raw-commodity £/kg anchors used by
`material-prices.ts` (gate-10 B-8). Seed writes curated rows; refresh walks
stale rows and write-backs `origin='web'` when a live fetch is implemented.
Chain stays DB-consumer — never calls this mid-run.

**Usage:**
```bash
npx tsx scripts/ingest/seed-material-prices.ts
npx tsx scripts/ingest/refresh-material-prices.ts [--dry] [--days=28]
```

---

### `enrich-new-suppliers.ts`

**Frequency:** After supplier merge; also spawned post-chain (limit 25)
**Quota usage:** Brave Search + OpenRouter Flash-Lite
**What it does:** Enriches `companies` rows with `enrichment_quality=0` from
`pretraining_extracted_suppliers`, then embed-on-write to `supplier_embeddings`.

**Usage:**
```bash
npx tsx scripts/ingest/enrich-new-suppliers.ts --write --limit 50
```

---

## Quota protection

All jobs use `scripts/lib/quota-semaphore.ts` to track calls per (source, day).
The semaphore writes to `~/.forge-truth/forge-truth.db` table `distributor_quota_usage`.

Free-tier daily caps (see `scripts/lib/quota-semaphore.ts` DAILY_CAPS):

| Source  | Cap      | Notes                                     |
|---------|----------|-------------------------------------------|
| mouser  | 1000/day | Soft cap — not header-enforced            |
| digikey | 1000/day | Hard cap via x-ratelimit-remaining header |
| farnell | 2000/day | More generous in practice                 |
| nexar   | 3/day    | 100 matched parts/month Evaluation plan   |
| lcsc    | 99999    | No documented cap                         |

---

## Write-back failure recovery

If an ingest job's API call succeeds but the DB write fails (e.g. locked WAL),
`ingest-replay.ts` appends a JSONL entry to `~/.forge-truth/ingest-replay.jsonl`.
Run `replay-ingest.ts` to retry those writes.

---

## Inspect the cache

```bash
sqlite3 ~/.forge-truth/forge-truth.db \
  "SELECT COUNT(*), source FROM distributor_cascade_cache GROUP BY source"
```

```bash
sqlite3 ~/.forge-truth/forge-truth.db \
  "SELECT COUNT(*) FROM distributor_cascade_cache WHERE miss=1"
```

```bash
sqlite3 ~/.forge-truth/forge-truth.db \
  "SELECT source, day, count FROM distributor_quota_usage ORDER BY day DESC LIMIT 20"
```
