# Demand-Driven Supplier Directory Enrichment — PLAN

**Branch:** `feat/forge-v2-cutover`. Do not push. Planning only.

**Status:** DRAFT for red-team + Tristan sign-off. Implementation follows.

---

## 0. Problem (restated)

When a founder with an out-of-catalogue project (HVAC chillers, shipping containers, vertical farming, refrigeration) hits Suppliers, `matchCadLabModuleSuppliers` returns zero candidates because `suppliers` / `marketplace_listings` have no rows in that domain. Nothing fires downstream. The directory never grows in the direction of real demand.

**Ground truth:**
- `suppliers`: 651 rows. Top domains: automotive 370, aerospace 331, electronics 298, industrial 214, medical 184. ZERO horticulture / HVAC / shipping-container / refrigeration.
- `marketplace_listings`: 23,095 rows. Same skew.
- `forge_supplier_shortlist` — Container Farm CF-40 (horticulture) project got 0 rows vs NetHawk (aerospace) 2 rows. The user hit this exact cold start.

**Goal:** when the directory doesn't know about something a founder needs, discover it, enrich it, persist it, and surface it on the founder's shortlist in one pass. Next founder asking for the same thing gets instant hits.

---

## 1. Trigger semantics

### When discovery fires

**Inside `matchSuppliersForProject` (`src/actions/forge-v2-supplier-match.ts`)**, after the sequential scorer loop:

```text
for each module in project.modules:
  matches = matchCadLabModuleSuppliers(module)
  if matches.length < 3:                        // discovery trigger threshold
    gapKey = canonicalize(industry, process, material, productCategory)
    if not recentlyDiscovered(gapKey, 14d):
      queue DiscoveryJob(projectId, moduleId, gapKey)
```

- **Trigger condition:** `< 3` candidates for a module after scoring. Three is the tunable. Two felt brittle (one match could be spurious); five is too aggressive.
- **Gap key canonicalization:** lower-case, trim, normalise with existing `normalizeToCategories()` helpers in `cad-lab-supplier-match.ts`. Shape: `{ industry: "horticulture", process: "refrigeration", material: "steel-alloy", productCategory: "hvac-chiller" }`. Serialise with `JSON.stringify` over a key-sorted object; SHA-256 hash → `gap_key_hash`.
- **Idempotency:** new table `supplier_discovery_jobs` (see §6). A `gap_key_hash` with status `done` or `running` inside the last 14 days → short-circuit. Otherwise insert a new `queued` row.
- **Why 14 days:** discovery is expensive (tokens + time). Re-running for the same gap inside two weeks is wasted spend unless the catalogue has been seeded with 3+ new suppliers meanwhile. The 14-day window is re-evaluated after first 50 runs.
- **Who can trigger:** only authenticated foundry members (inherited via `withAuth`). No unauthenticated trigger surface.

### What the trigger does NOT do

- Does not block the founder's shortlist. The in-flight scorer results (however sparse) are written to `forge_supplier_shortlist` immediately. Discovery is background work.
- Does not cancel an already-running discovery for the same gap key even from a different foundry — the first caller's job wins, later callers attach their `projectId` to `interested_project_ids[]` on the existing row so re-match fires for them too.

---

## 2. Discovery step — Claude Opus 4.7 with native `web_search`

### Decision: use Claude native web_search, NOT Brave

| Factor | Claude native web_search | Brave Search API | Perplexity |
|---|---|---|---|
| New env var | None — `ANTHROPIC_API_KEY` already wired | `BRAVE_API_KEY` — decision required | `PERPLEXITY_API_KEY` |
| Cost (rough) | ~$10 per 1,000 searches (Anthropic pricing, included in token billing) | $3 / 1,000 free tier, $5 / 1,000 Pro | $5 / 1,000 + model cost |
| Latency | Single call — model loops internally, 10-30s for a 5-search task | Multiple back-and-forth calls (search → parse → embed → call LLM) | Single call, 5-15s |
| Quality | Model decides what to fetch + synthesises | Raw SERP JSON, need to scrape + extract ourselves | Pre-synthesised answers, opaque sourcing |
| Citation provenance | URLs returned per claim | Full URL + snippet for every result | URLs, variable detail |
| Codebase fit | Already implemented pattern (`buy-part-search.ts:622-661`, `web-search.ts`) | Needs new provider wrapping | Needs new provider wrapping |

**Recommendation:** Claude native web_search. No new dependency. Reuses the existing Anthropic SDK pattern at `src/actions/buy-part-search.ts:661` (`tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }]`). Lower operational surface area; one provider to monitor, one bill to watch. If quality disappoints on niche-industry queries (HVAC UK vertical-farm specialists) we can add Brave as a second-pass augmenter later — but not Day One.

**DECISION FLAG FOR TRISTAN:** If we later need Brave (e.g. Claude web_search hits rate limits on concurrent founders): adding `BRAVE_API_KEY` is a 20-minute task. Not a blocker.

### Prompt shape

Prompt constructed in new file `src/lib/supplier-discovery/prompt.ts`:

```text
You are a supply-chain research analyst. A founder in the {industry} sector is
building a {productCategory} that requires {process} using {material}.

The current directory has zero suppliers in this domain. Your job is to identify
{N} real companies that could serve this need, with a strong bias toward
the UK and EU (the founder is UK-based).

For each company, return structured JSON:
{
  "name": string,
  "website": string (must be a real live URL, root domain),
  "hq_country_iso": ISO-3166-2 (e.g. "GB", "DE", "NL"),
  "hq_city": string | null,
  "one_line_description": string (max 160 chars, what they actually do),
  "capability_keywords": string[] (max 8, domain terms — e.g. ["industrial-chiller", "ammonia-refrigeration"]),
  "inferred_certifications": string[] (only if visible on site — e.g. ["ISO 9001"]),
  "source_urls": string[] (pages you read, minimum 2)
}

Hard rules:
1. Only real companies. If unsure, skip.
2. No aggregators, no directories, no Alibaba listings. Only primary manufacturers or specialist
   distributors with a website and a UK/EU presence.
3. No companies on UK/EU/US sanctions lists.
4. Reject candidates whose website 404s or is parked.
5. Return an empty array rather than inventing data.

Return {N} candidates or fewer. JSON only, no prose.
```

- **N = 8 per discovery call.** Rationale: target 5 usable after dedupe + website-validation filter. Over 10 the model's precision degrades per internal benchmarks of `buy-part-search`.
- **Model:** `claude-opus-4-7-20260101` (the 1M-context variant currently in use). Opus over Sonnet for this: recall on niche-industry queries is noticeably better; the per-discovery budget is small enough that the delta doesn't matter.
- **Tool config:** `tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }]`. 8 uses caps the model at ~8 search calls; Anthropic bills ~$10/1000 so this is ~$0.08 of search cost per discovery.
- **Max tokens:** 8000 output. Beyond that we're wasting budget on prose; the JSON array fits.
- **JSON extraction:** use `extract_tool_result` + regex fallback already used in `buy-part-search.ts`. Validate with Zod before persisting.

### Structured output

```typescript
// src/lib/supplier-discovery/types.ts
export interface DiscoveredCandidate {
  name: string
  website: string
  hq_country_iso: string
  hq_city: string | null
  one_line_description: string
  capability_keywords: string[]
  inferred_certifications: string[]
  source_urls: string[]
}
```

---

## 3. Enrichment step

After discovery returns N candidates, each candidate gets a lightweight enrichment pass. **Per-candidate enrichment runs as its own Vercel function** to stay under the 300s cap (see §8).

### Per-candidate enrichment sequence

For each candidate, in `src/actions/supplier-discovery/enrich-candidate.ts`:

1. **Website reachability check** (new helper in `src/lib/supplier-discovery/website-check.ts`)
   - `fetch(candidate.website, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) })`
   - Reject non-2xx; reject redirects to known parking domains (`sedoparking.com`, `godaddy.com/park`, etc. — small blocklist in the helper).
   - This alone kills ~20% of LLM hallucinations before they hit the DB.

2. **Website homepage scrape** (new helper in `src/lib/supplier-discovery/website-scrape.ts`, thin wrapper over `fetch` + `cheerio`)
   - GET the homepage, extract `<title>`, `<meta description>`, and first 500 chars of `<body>`. No JS execution (this repo doesn't ship a headless browser to Vercel functions; Patchright is scripts-only).
   - Feed into a small Haiku call (model `claude-haiku-4-5`, 500 tokens output, $0.001 per call) that returns `{ confirmed_name, confirmed_description, extracted_certifications[], extracted_materials[], extracted_processes[] }`.
   - If homepage 404s or content is blank → degrade confidence, do NOT discard (they still get persisted but flagged `unverified-ai-discovery` with `confidence < 0.5`).

3. **Companies House lookup (UK-only)** — adapter around `scripts/enrich-companies-house.py`
   - **The existing script is CSV-in, CSV-out.** We do NOT run Python from Node. Instead build a new TypeScript adapter: `src/lib/supplier-discovery/companies-house.ts` that calls the Companies House REST API directly:
     - `GET https://api.company-information.service.gov.uk/search/companies?q={name}&items_per_page=3`
     - Match on name similarity (Levenshtein > 0.85) + postcode if available.
     - If matched: `GET /company/{number}` → `{ companies_house_number, incorporation_date, registered_address_postcode, status }`.
     - Env var: `COMPANIES_HOUSE_API_KEY` — already present (see existing script). Rate limit: 600/min, we sleep 150ms between calls; one discovery batch of 8 = 1.2s.
   - **Reuse:** the exact HTTP headers / auth pattern from `scripts/enrich-companies-house.py:78-84`. No new secret needed.
   - EU / US candidates: skip Companies House. OpenCorporates is the equivalent but the cost is non-trivial; defer to a later iteration, flagged as `enrichment_degraded = true`.

4. **Confidence scoring** — new helper in `src/lib/supplier-discovery/confidence.ts`:
   - +0.2 website reachable (2xx)
   - +0.2 homepage content matches candidate name (fuzzy)
   - +0.2 Companies House match (UK) OR website explicitly names a parent entity + address
   - +0.2 at least two source_urls from the web_search call
   - +0.1 inferred_certifications non-empty after homepage scrape
   - +0.1 capability_keywords overlap with gap_key (dedup check for relevance)
   - **Threshold to persist:** ≥0.5. Below that → log + drop.

---

## 4. Persistence step

### Two-tier persistence (addresses Disruptor's critique pre-emptively — argued both ways in §10)

**Tier A — per-project candidate pool (`forge_supplier_shortlist`, existing table, reuse):**
- Every persisted candidate gets written here for the triggering project with:
  - `supplier_id = "discovered:<uuid>"` (prefix distinguishes discovered from marketplace listings)
  - `supplier_name = candidate.name`
  - `is_verified = false`
  - `supplier_type = "service"`
  - `best_match_score = confidence * 100`
  - `all_match_reasons = ["Discovered via demand", "Confidence: <score>"]`
  - `ramp_role = "unassigned"`
  - Founder-visible, immediately actionable.
- Tenant-scoped (existing RLS).

**Tier B — global directory (`suppliers`, existing table + new metadata fields):**
- Tier B write is **gated** behind either (a) admin approval, or (b) second foundry independently asking for the same gap. See Dedupe + Admin-verify below.
- The first foundry to discover a supplier gets per-project Tier A. The second foundry asking a semantically similar question promotes it to Tier B. This is the "two-witnesses" rule — no single-user-driven directory pollution.

### Dedupe rule (both tiers)

- Normalise: `website.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")` → `website_root`.
- Before insert: `SELECT id FROM suppliers WHERE metadata->>'website_root' = $1 OR website ILIKE $1`.
- Collision → update the existing row's metadata (`metadata.discovered_by_project_ids[]` append, `metadata.last_seen_at` bump), do NOT duplicate.
- Also check `marketplace_listings.website_url` — if an existing listing matches, we link the discovered row to the listing's id rather than creating a shadow supplier.

### Schema — Tier B writes

New metadata fields (no new columns needed — all go inside existing `suppliers.metadata` JSONB):

```json
{
  "discovery": {
    "discovered_by_project_ids": ["b194c308-..."],
    "discovered_at": "2026-04-24T10:11:12Z",
    "gap_key_hash": "sha256:...",
    "gap_industry": "horticulture",
    "gap_process": "refrigeration",
    "discovery_confidence": 0.73,
    "verification_status": "unverified-ai-discovery",
    "admin_promoted_at": null,
    "admin_promoted_by": null,
    "source_urls": ["https://example.com/about", ...],
    "enrichment_degraded": false,
    "companies_house_number": "12345678",
    "second_witness_project_id": null
  }
}
```

- `suppliers.verification_status` column (existing) is set to `"unverified-ai-discovery"` on Tier B insert.
- `suppliers.used_by_count` stays at 0 until a real founder adds the discovered row to a shortlist via Source's manual add — no fake social-proof inflation.
- `suppliers.community_rating` stays NULL — no synthetic rating.

### Admin-verify flow (Tier B promotion)

New server action in `src/actions/admin-supplier-discovery.ts`:

- `listPendingDiscoveredSuppliers()` — admin-only, returns rows where `metadata->discovery->verification_status = 'unverified-ai-discovery'` ordered by `discovery_confidence` desc.
- `promoteDiscoveredSupplier(id, action)` where `action ∈ { "verified", "rejected", "flagged" }`.
  - `"verified"` → sets `verification_status = "verified"`, `metadata.discovery.admin_promoted_at = now()`, stays in directory.
  - `"rejected"` → soft-delete: `metadata.discovery.rejected_at = now()`; row hidden from searches via `WHERE metadata->discovery->>'rejected_at' IS NULL` filter added to `matchCadLabModuleSuppliers`.
  - `"flagged"` → stays visible but pinned with a badge; used for "looks real but needs human check".
- Admin UI: new page `src/app/(platform)/admin/discovered-suppliers/page.tsx`. Table with website preview, confidence score, inferred data, Approve / Reject / Flag buttons. Guarded by existing admin role check pattern at `src/app/(platform)/admin/`.

---

## 5. Re-match step

After a Tier A write batch lands for a triggering project, kick off a re-match:

- New action: `src/actions/supplier-discovery/re-match.ts` exports `reMatchProjectAfterDiscovery(projectId, moduleIds[])`.
- Internally: `matchSuppliersForProject(projectId)` is called with the discovered rows now in the pool — the scorer will pick them up via the `discovered:` prefix lookup in a new code path added to `matchCadLabModuleSuppliers` (it currently queries `marketplace_listings` only; we add a second query against `suppliers.metadata->discovery` and merge results).
- Emits a new `pipeline_runs` row: `specialist_id = "chase"`, `stage = "supplier.discovery.re-match"`, `trigger = "auto.discovery-complete"` — so the UI can render a "Chase found 3 new suppliers for your chiller module" toast.
- Re-match is bounded: if it re-triggers discovery (< 3 again), we short-circuit via the 14-day idempotency rule. No infinite loops.

---

## 6. Schema changes (minimal)

**Single new migration file:**

`supabase/migrations/20260424100000_supplier_discovery_jobs.sql`

```sql
CREATE TABLE public.supplier_discovery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id text NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  triggering_project_id uuid NULL REFERENCES public.cad_lab_projects(id) ON DELETE SET NULL,
  triggering_module_id text NULL,
  gap_key_hash text NOT NULL,
  gap_industry text NULL,
  gap_process text NULL,
  gap_material text NULL,
  gap_product_category text NULL,
  interested_project_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued',  -- queued | discovering | enriching | persisting | re_matching | done | failed
  candidates_returned integer NULL,
  candidates_persisted integer NULL,
  total_cost_gbp_pence integer NULL,
  error_code text NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL
);

CREATE INDEX idx_supplier_discovery_jobs_gap_key
  ON public.supplier_discovery_jobs(gap_key_hash, created_at DESC);

CREATE INDEX idx_supplier_discovery_jobs_status_active
  ON public.supplier_discovery_jobs(status)
  WHERE status IN ('queued','discovering','enriching','persisting','re_matching');

CREATE INDEX idx_supplier_discovery_jobs_foundry
  ON public.supplier_discovery_jobs(foundry_id, created_at DESC);

ALTER TABLE public.supplier_discovery_jobs ENABLE ROW LEVEL SECURITY;

-- Same foundry SELECT; service-role-only INSERT/UPDATE. Mirrors pipeline_runs.
CREATE POLICY supplier_discovery_jobs_select ON public.supplier_discovery_jobs
  FOR SELECT USING (
    foundry_id IN (SELECT foundry_id FROM public.foundry_memberships
                   WHERE user_id = auth.uid() AND active = true)
  );

CREATE POLICY supplier_discovery_jobs_insert ON public.supplier_discovery_jobs
  FOR INSERT WITH CHECK (false);

CREATE POLICY supplier_discovery_jobs_update ON public.supplier_discovery_jobs
  FOR UPDATE USING (false);

-- updated_at trigger (copy of pipeline_runs pattern)
CREATE OR REPLACE FUNCTION public.set_supplier_discovery_jobs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER set_supplier_discovery_jobs_updated_at_trg
  BEFORE UPDATE ON public.supplier_discovery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_supplier_discovery_jobs_updated_at();

COMMENT ON TABLE public.supplier_discovery_jobs IS
  'Demand-driven supplier discovery jobs. A row per gap-key-hash; idempotency, observability, cost tracking.';
```

**No other schema changes.** All candidate data lives in existing `suppliers.metadata` JSONB, per "prefer jsonb over new columns" constraint.

---

## 7. UI / UX

### Where the founder sees this

1. **Source page / V2 Suppliers tab** (`src/app/(platform)/the-forge-v2/projects/[id]/suppliers/`):
   - When `modulesEmpty > 0` in the `matchSuppliersForProject` result, render a new banner:
     > **Chase is sourcing new suppliers for the {module name} module.** This usually takes 2-4 minutes. The shortlist will refresh automatically when candidates are ready.
   - Banner pulls status from `supplier_discovery_jobs` via a new `getDiscoveryStatusForProject(projectId)` action (polls every 10s, auto-stops on `done` or `failed`).
   - Uses existing `pipeline_runs` chip pattern — `specialist_id = "chase"` chip in the specialist briefing column.

2. **After discovery completes:**
   - Shortlist re-fetches (via existing `router.refresh()` or SWR revalidation).
   - New candidates show up with a visible `UNVERIFIED — AI DISCOVERY` chip (warning colour, not destructive).
   - Tooltip on the chip: "Chase found this supplier by searching the web. Confirm the website before outreach."

3. **Three states** (was previously two):
   | State | Old behaviour | New behaviour |
   |---|---|---|
   | No suppliers shortlisted yet | "No matches" empty state, dead-end | "Chase is sourcing..." banner + progress |
   | Discovery running | didn't exist | Banner + spinner, auto-refresh |
   | N suppliers shortlisted | Shortlist visible | Same, plus UNVERIFIED chips on discovered rows |

4. **Pipeline_runs chip:** new stage string `supplier.discovery`. Renders in the existing specialist activity column via `src/components/forge-v2/pipeline-run-chip.tsx` (existing file, add one stage label).

---

## 8. Vercel-cap plan — stage split

300s per function. The whole discovery→enrich→persist→re-match chain is ~4-8 minutes. Same `after()` + stage-runner pattern as `forge-v2-autopilot.ts`. Each stage is its own function, each fits under 300s.

### Stages

| Stage | File | Bounded by | Max time |
|---|---|---|---|
| `triggerDiscovery` | `src/actions/supplier-discovery/trigger.ts` | Insert `supplier_discovery_jobs` row, call web_search, parse. **One Anthropic call.** | ~60s |
| `enrichCandidate` (one per candidate, called N times in parallel via `Promise.allSettled`) | `src/actions/supplier-discovery/enrich-candidate.ts` | Website fetch + Haiku extraction + Companies House | ~20s per candidate; 8 parallel = ~20s wall clock |
| `persistBatch` | `src/actions/supplier-discovery/persist-batch.ts` | Dedupe + upsert Tier A + conditional Tier B | ~10s |
| `reMatch` | `src/actions/supplier-discovery/re-match.ts` | Calls `matchSuppliersForProject` | ~30s |

Chain them via `after()` from `next/server`, identical to autopilot at `src/actions/forge-v2-autopilot.ts`.

**Worst-case wall clock:** ~2 minutes. Comfortable under any single Vercel function's 300s cap.

**Failure semantics:** copied from autopilot. A failure in any stage writes `status = "failed"` + `error_code` / `error_message`, stops the chain. No auto-retry. UI shows "Chase couldn't find suppliers for this module — try a manual search".

---

## 9. Cost + rate-limiting + auth gate

### Per-discovery cost estimate

| Cost line | Rough figure |
|---|---|
| Opus 4.7 call (2K in + 8K out + 8 web_search uses) | $0.03 + $0.12 + $0.08 = **~$0.23** |
| Haiku website-extract per candidate (×8 candidates, 500 out) | 8 × $0.001 = **~$0.008** |
| Companies House lookups (×8 candidates, free tier) | **$0** |
| Website HEAD fetches | **$0** (egress negligible) |
| **Total per discovery job** | **~£0.19–0.25** (ballpark 20–30p) |

### At the ground-truth scale Tristan named in the red-team prompt

**50 founders × 10 empty shortlists × 5 candidates per discovery:**

- 50 × 10 = 500 discovery jobs / month.
- 500 × £0.23 = **~£115 / month** at current usage.
- If 70% hit the 14-day idempotency and short-circuit (likely on repeat sectors), real cost drops to ~£35/month.

**Realistic upper bound (no idempotency):** 500 jobs × £0.30 (accounting for retries) = **~£150 / month**.

This is cheap for the product value. The cost ceiling isn't "keep it under £X"; the cost ceiling is "don't let it run away" (see below).

### Hard runaway limits

In `src/lib/supplier-discovery/budget.ts`:

- **Per-foundry:** max 20 discovery jobs / 24h. Beyond that, return early with `error_code = "FOUNDRY_BUDGET"` and surface "daily discovery limit reached — contact support".
- **Global:** max 200 discovery jobs / 24h across the whole platform. Checked atomically against `SELECT count(*) FROM supplier_discovery_jobs WHERE created_at > now() - interval '24 hours'`. Beyond → defer with `error_code = "PLATFORM_BUDGET"`.
- **Per-run cost cap:** if `total_cost_gbp_pence > 100` (£1 / run), stop mid-enrichment and mark `failed`. This is a belt-and-braces check; normal runs are ~25p.
- **Subscription-tier gating:** Explorer tier → no discovery (already has the `SUBSCRIPTION_PLANS.limits.maxOrders` pattern in `src/lib/billing/`). Starter → 5/month. Pro → 100/month. Enterprise → 500/month. Hook into the existing `getEffectiveLimitsForFoundry()` pattern so billing stays in one place.

### Auth gate

All discovery triggers go through `withAuth` (`src/lib/server-action-utils.ts`). This gives us `foundryId`, which:

- Enforces the foundry budget
- Writes into `supplier_discovery_jobs.foundry_id` for audit
- Blocks anonymous enumeration (critical — web_search is expensive)

`matchSuppliersForProject` itself already goes through `withAuth`, so the discovery trigger inherits the same guard.

### Rate-limit on the trigger endpoint

Add `checkRateLimit(foundryId, "supplier-discovery", { perMinute: 2, perHour: 10 })` at the top of the trigger action. Pattern already used in `src/actions/suppliers.ts`.

### Companies House rate limit

600 req/min. With 20 discoveries/foundry/day × 8 candidates each = 160 lookups, batched with 150ms sleeps, that's ~24s wall clock. Well within the ceiling.

---

## 10. Global directory write — arguing both ways

This is the load-bearing question. Tristan's prompt argues both sides. I owe both arguments, then a recommendation.

### Case FOR writing Tier B globally (Tristan's instinct in the original problem statement)

- **Network effect.** The directory grows with demand. Founder #1 asks for HVAC chillers; founders #2–#50 get instant hits.
- **Cost amortisation.** £0.23 per discovery is cheap once, catastrophic if repeated per founder.
- **Matches how the user described it.** "If somebody needs something which has HVAC chillers and refrigeration, at least then we'd have a bunch of those suppliers."
- **Unverified-ai-discovery is honestly labelled.** Founders know what they're looking at; the `UNVERIFIED` chip is not hidden.

### Case AGAINST (Disruptor's likely position)

- **Directory pollution risk.** Single-user discovery writes to global state. One malicious/broken founder triggers 20 bogus entries visible to everyone.
- **GDPR surface.** Persisting third-party company data in a multi-tenant directory you don't have consent for (see §Red Team Lawyer).
- **Quality erosion.** Marketplace has 651 curated rows → suddenly 5,000 auto-discovered rows with 50% confidence each. The whole signal/noise ratio of the directory tanks.
- **Easier rollback.** Per-project candidates are easy to delete (one foundry, one project). Global rows leak into other founders' searches the moment they're indexed.

### Recommendation: TIERED, with "two-witnesses" promotion

Tier A (per-project) is the default; Tier B (global) requires EITHER a second foundry independently discovering the same gap (automated promotion), OR admin blessing (manual promotion).

This gets the network effect Tristan wants (over time; not instantly) and avoids the worst failure modes of single-user-driven global writes. Specifically:

- **First founder** to ask for HVAC chillers in horticulture: 5 discovered candidates land in their shortlist only, tagged `unverified-ai-discovery`. Zero global impact.
- **Second founder** to ask for the same (inside 30d): the dedup check finds the existing `suppliers` rows (they were written to `suppliers` table but hidden from global search until second-witness event), flips them to `verification_status = "community-verified-by-demand"`, exposes to everyone.
- **Admin can also promote manually** at any time via `/admin/discovered-suppliers`.

This means Tier B rows exist in `suppliers` immediately (for dedup purposes) but are invisible to non-discovering foundries until promoted. The `matchCadLabModuleSuppliers` scorer gets a new filter clause:

```ts
.or(`verification_status.in.(verified,community-verified-by-demand),metadata->discovery->interested_project_ids.cs.{${currentProjectId}}`)
```

A founder sees a discovered row IF (a) it's been promoted, OR (b) their own project triggered it. No cross-tenant leakage, no global pollution.

---

## 11. Pitfalls — ordered by severity

1. **P0 — Directory pollution from hallucinations** (addressed by confidence ≥0.5 threshold, website reachability filter, two-witnesses rule for global visibility).
2. **P0 — GDPR risk persisting third-party company data globally** (addressed by lawful basis doc, public-website-only rule, right-to-erasure endpoint — see red team).
3. **P0 — Runaway cost from abusive triggers** (addressed by per-foundry + platform budgets, subscription-tier gating, rate limit).
4. **P1 — Companies House name-mismatch false positives** (fuzzy name match > 0.85 + postcode cross-check; we tolerate missed matches over wrong matches).
5. **P1 — Anthropic web_search quality degradation on niche UK queries** (fallback to Brave as a flagged decision if observed; not Day One).
6. **P1 — `after()` context teardown losing the chain** (same risk autopilot mitigates with explicit state writes per stage; copy the pattern exactly).
7. **P1 — Concurrent triggers on the same gap key racing to insert** (advisory lock on `hashtext(gap_key_hash)` around the job-create step).
8. **P2 — Seed-data "fake trust signals" leaking into discovered rows** (don't populate `used_by_count`, `community_rating` on discovered inserts; see `forgeos_fake_seed_data_audit.md`).
9. **P2 — Re-match loop triggering its own discovery** (gate re-match so it doesn't re-fire discovery under 14d idempotency).
10. **P2 — Discovered-supplier embedding missing** (they won't appear in semantic matches until `embedding` is populated; queue them for a batch embedding job, or inline embed during persist).

---

## 12. Red-Team Revised Section — addressing top-5 must-fixes

_See `SUPPLIER-DISCOVERY-REDTEAM.md`. Revisions here after running the red team._

### R1 — Global writes forbidden without two-witnesses OR admin promotion

Addressed in §10. All Tier B rows are written with `verification_status = "unverified-ai-discovery"` and are invisible to foundries other than the discoverer until promoted. No single-user-driven global pollution.

### R2 — Right-to-erasure endpoint is a launch requirement, not a follow-up

Add to Day One scope:
- New action `src/actions/admin-supplier-discovery.ts::eraseDiscoveredSupplier(id, reason)`. Deletes from `suppliers` where `metadata->discovery->>'verification_status' = 'unverified-ai-discovery'`, cascades to `forge_supplier_shortlist`, logs the reason to `audit_log`.
- Public-facing: `privacy@fractionalforge.com` already accepts erasure requests; the admin UI includes a "Erase" action. If a supplier emails us, we delete within 72h.
- Documented in `PRIVACY-POLICY.md` update: "We may persist publicly-available company information from your industry sector to help other founders find suppliers. To request erasure, contact privacy@fractionalforge.com."

### R3 — Hard cap on Anthropic cost per tenant

Addressed in §9 with per-foundry daily limit (20) + per-run hard cost cap (£1) + platform daily limit (200). Add to spec: if `total_cost_gbp_pence` ever hits 100, the job aborts mid-enrichment and alerts Sentry.

### R4 — No reliance on `used_by_count` / `community_rating` for discovered rows

Addressed in §11 P2. Discovered rows ship with NULL / 0 on those fields. Founders see "Discovered 3 days ago, 0 orders" — honest sparse data, not fake trust signals. Links directly to the existing audit `forgeos_fake_seed_data_audit.md` rule.

### R5 — Embeddings on insert, not deferred

Addressed in §11 P2 extended. During `persistBatch`, each new supplier row gets an `embedding` generated via existing `embedText()` helper (OpenAI 1536-d, already canonical on this path per MEMORY.md) BEFORE returning. Extra ~1s per candidate, worth it — otherwise discovered rows are invisible to the semantic scorer until a separate batch job runs.

---

## 13. 90-minute implementation checklist

**Sequenced. Do top-to-bottom. Each task is marked [S]mall / [M]edium / [L]arge.**

### Block A — Schema + plumbing (20 min)

1. **[S] 3 min** — Create migration file `supabase/migrations/20260424100000_supplier_discovery_jobs.sql` (SQL from §6). `npx supabase db push` + `npx supabase gen types typescript --linked > src/types/database.types.ts`. Commit: "feat: supplier_discovery_jobs table for demand-driven enrichment".
2. **[S] 2 min** — Add new types to `src/lib/supplier-discovery/types.ts` (create dir). `DiscoveredCandidate`, `DiscoveryJobStatus`, `DiscoveryStage`, `DiscoveryFailureCode`.
3. **[S] 3 min** — Add new stage label to `src/components/forge-v2/pipeline-run-chip.tsx` (`supplier.discovery` → "Chase sourcing"). No new rendering logic, just the label map.
4. **[M] 7 min** — Add hash + canonicalise helpers to `src/lib/supplier-discovery/gap-key.ts`: `canonicalizeGapKey()`, `hashGapKey()`, `findRecentJob(hash, sinceDays)`. Unit test alongside (stub table reads for now).
5. **[S] 5 min** — Add budget helpers in `src/lib/supplier-discovery/budget.ts`: `checkFoundryBudget()`, `checkPlatformBudget()`, `checkRunCostCap()`. Simple `SELECT count` + `SELECT sum(total_cost_gbp_pence)` queries against `supplier_discovery_jobs`.

### Block B — Discovery + enrichment workers (30 min)

6. **[M] 8 min** — Create `src/lib/supplier-discovery/prompt.ts` with the prompt template from §2. Export `buildDiscoveryPrompt(gap)` + a Zod schema for validation.
7. **[L] 12 min** — Create `src/actions/supplier-discovery/trigger.ts`. `"use server"`. Exports async `triggerSupplierDiscovery({ projectId, moduleId, gapKey })`. Auth-checks via `withAuth`. Inserts job row (status `discovering`), calls Anthropic Opus 4.7 with web_search tool (copy pattern from `buy-part-search.ts:622-661`), parses JSON via Zod, updates job row (`candidates_returned`, status `enriching`), `after()` schedules enrichment.
8. **[M] 7 min** — Create `src/lib/supplier-discovery/website-check.ts` + `website-scrape.ts`. HEAD check + cheerio-based homepage extract + Haiku summary call (model `claude-haiku-4-5`, ≤500 out, Zod-validated). Handles 404 / parked-domain / blank-content gracefully.
9. **[M] 6 min** — Create `src/lib/supplier-discovery/companies-house.ts`. TS adapter over the Companies House REST API. Reuses pattern from `scripts/enrich-companies-house.py` HTTP headers. Env: `COMPANIES_HOUSE_API_KEY`. Fuzzy name match (Levenshtein > 0.85).

### Block C — Persist + re-match (15 min)

10. **[M] 5 min** — Create `src/lib/supplier-discovery/confidence.ts`. Score function per §3 confidence rules.
11. **[M] 7 min** — Create `src/actions/supplier-discovery/persist-batch.ts`. Dedup by website_root. Tier A insert into `forge_supplier_shortlist`. Tier B insert into `suppliers` with `verification_status = "unverified-ai-discovery"` + metadata payload from §4. Generate embedding inline via `embedText()` + `.update()` back. Two-witnesses promotion check: if `gap_key_hash` appears in a second `supplier_discovery_jobs` row from a different foundry, flip existing Tier B rows to `community-verified-by-demand`.
12. **[S] 3 min** — Create `src/actions/supplier-discovery/re-match.ts`. Exports `reMatchProjectAfterDiscovery(projectId)`. Calls `matchSuppliersForProject(projectId)`. Writes a `pipeline_runs` row with `specialist_id = "chase"`, `stage = "supplier.discovery.re-match"`.

### Block D — Wire the trigger + UI (15 min)

13. **[M] 5 min** — Modify `src/actions/forge-v2-supplier-match.ts`: after the scoring loop, for each module with `< 3` matches, call `triggerSupplierDiscovery(...)`. Non-blocking (don't await — fire-and-forget via `after()`).
14. **[M] 5 min** — Modify `src/actions/cad-lab-supplier-match.ts`: the query clause to include discovered rows needs the tenant-aware filter from §10 (`verification_status.in.(verified,community-verified-by-demand)` OR `interested_project_ids.cs.{projectId}`).
15. **[S] 5 min** — Create `src/actions/supplier-discovery/status.ts`. `getDiscoveryStatusForProject(projectId)` — reads in-flight jobs. Consumed by the Suppliers-tab banner via client polling (10s interval).

### Block E — Admin UI + tests (10 min)

16. **[M] 6 min** — Create `src/app/(platform)/admin/discovered-suppliers/page.tsx` + `actions.ts`. Table + approve/reject/flag buttons. Admin-role check (existing pattern).
17. **[S] 4 min** — Add tests: `src/lib/supplier-discovery/__tests__/confidence.test.ts` (confidence scoring), `src/lib/supplier-discovery/__tests__/gap-key.test.ts` (canonicalisation + hashing). Run `npm run verify -- --static`.

### Handover / post-90-min

- **Deploy:** branch stays `feat/forge-v2-cutover`. Vercel preview auto-builds. Verify by walking the Container Farm CF-40 project (horticulture → should trigger discovery → populate shortlist). Watch `supplier_discovery_jobs` for the run.
- **Do NOT merge to main until:** (a) two-witnesses dedup is verified with a second seeded project, (b) admin erasure endpoint is tested end-to-end, (c) per-foundry + platform budgets confirmed firing on a synthetic over-limit test.
- **Next iteration:** add Brave fallback if Anthropic quality disappoints; OpenCorporates for non-UK enrichment; email-validation pass on any contact emails surfaced.

---

## 14. Completion checks (per CLAUDE.md)

| Item from prompt | Covered? |
|---|---|
| Trigger semantics with idempotency | §1 |
| Discovery step + provider comparison + prompt shape | §2 |
| Enrichment reusing existing scripts + adapters | §3 |
| Persistence + dedupe + metadata shape | §4 |
| Re-match | §5 |
| UI / UX states + pipeline_runs chip | §7 |
| Schema changes (single migration, JSONB-first) | §6 |
| Vercel-cap stage split | §8 |
| Cost + rate-limit + auth gate | §9 |
| Pitfalls list (8+, severity-ordered) | §11 |
| Global-vs-per-project argued both ways | §10 |
| Admin-verify flow | §4 |
| Revised plan addressing top-5 red-team must-fixes | §12 |
| 90-min implementation checklist | §13 |

All items covered.
