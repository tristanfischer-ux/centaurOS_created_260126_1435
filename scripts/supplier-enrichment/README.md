# Supplier Enrichment Scripts

Batch enrichment pipelines. All scripts use the Supabase service role key from `SUPABASE_SERVICE_ROLE_KEY` env var and read from `SUPABASE_URL`.

## Scripts (in recommended run order)

1. **domain-email-infer.ts** — probe MX + guess common aliases (sales@, info@) for rows with website but no email
2. **companies-house-sync.ts** — for UK suppliers (GB country_iso), enrich founded_year, employee_count, address from Companies House API (free, no key needed)
3. **website-enrich.ts** — scrape supplier websites + LLM-extract MOQ, lead time, equipment into supplier_capabilities
4. **sanctions-screen.ts** — weekly cron; fuzzy-match supplier names against OFAC SDN + BIS Entity List + UK FCDO consolidated list; writes supplier_sanctions_flags
5. **google-places-lookup.ts** — *requires GOOGLE_PLACES_API_KEY* — Google Business Profile ratings + response times
6. **linkedin-decision-maker-lookup.ts** — *requires APOLLO_API_KEY or HUNTER_API_KEY* — LinkedIn decision-maker contacts

## Environment setup

```bash
# Required for all scripts
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...

# Optional — enables external-API scripts
export GOOGLE_PLACES_API_KEY=...   # for google-places-lookup.ts
export APOLLO_API_KEY=...          # for linkedin-decision-maker-lookup.ts
# OR
export HUNTER_API_KEY=...          # alternative to Apollo
```

## Running

All scripts are idempotent — safe to re-run. They only update rows that match their criteria (e.g., domain-email-infer only touches rows with `website_url IS NOT NULL AND contact_email IS NULL`).

```bash
# One-off
npx tsx scripts/supplier-enrichment/domain-email-infer.ts

# Batched — process N rows
npx tsx scripts/supplier-enrichment/website-enrich.ts --limit 100

# Dry-run (print what would be updated, don't write)
npx tsx scripts/supplier-enrichment/website-enrich.ts --dry-run
```

## Rate-limits / politeness

- Companies House: 600 req/5min (handled internally)
- Website scrape: 3s delay between requests, respects `robots.txt`
- Sanctions lists: downloaded once per run, cached in /tmp
- Google Places: use official quota; script sleeps to stay under 100 req/sec
- Apollo / Hunter: script respects plan quota env var (APOLLO_DAILY_QUOTA)

## Output

Every run updates `marketplace_listings.enrichment_sources` JSONB with an audit entry:
```json
{ "source": "website_enrich", "run_at": "2026-04-18T03:12:00Z", "fields": ["minimum_order", "lead_time"] }
```

Use this to know what's been touched and when.
