# Supplier DB Enrichment — Autonomous Tracker

**Started:** 2026-04-18 overnight (Tristan asleep)
**Goal:** Execute items 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20 from the 20-point enhancement list to turn `marketplace_listings` from a good-bones-thin-flesh directory into a genuine decision-grade supplier intelligence layer.
**Mode:** Fully autonomous. Commit + push frequently. No test user creation (reuse existing).

---

## Scope reminder (from conversation)

Items requested (19 of 20; only #4 deduplication-of-Finance excluded):

1. ISO-code normalisation at ingest
2. Domain-based email inference
3. "Data freshness" column
5. Merge split-format geography (UK → GB)
6. Website-scrape enrichment (MOQ, lead time, equipment)
7. Google Business Profile ingest
8. Companies House / D&B cross-reference
9. LinkedIn decision-maker lookup
10. Certifications with expiry
11. Process/material/tolerance capability matrix
12. Interview-pack response ingestion
13. Post-project supplier rating
14. Founder-contributed corrections
15. Supplier relationship graph
16. RFQ response library
17. Sub-tier risk propagation
18. Sanctions/export-controls screening
19. Sustainability/ESG signals
20. AI-generated supplier briefs

---

## Execution plan — 5 phases

### Phase A: Schema foundation (migrations + backfill SQL)
Everything else depends on these columns + tables existing. Runs first.

- [ ] A1. Migration: add `country_iso`, `last_enriched_at`, `enrichment_sources` to marketplace_listings (items #1, #3)
- [ ] A2. One-off SQL: backfill `country_iso` from the ISO2_TO_NAME map used in supply-risk.ts, merge "United Kingdom" → "GB" (items #1, #5)
- [ ] A3. Migration: new table `supplier_certifications` with `{listing_id, cert_code, issuer, issued_at, expires_at, evidence_url, verified}` (item #10)
- [ ] A4. Migration: new table `supplier_capabilities` structured tuples `{listing_id, process_category, materials[], tolerance_min_mm, tolerance_max_mm, batch_min, batch_max, evidence}` (item #11)
- [ ] A5. Migration: new table `supplier_relationships` (graph edges) `{parent_listing_id, child_listing_id, relationship_type, source, evidence}` (item #15)
- [ ] A6. Migration: new table `supplier_sanctions_flags` `{listing_id, list_name, reason, checked_at, active}` (item #18)
- [ ] A7. Migration: columns for sustainability flags on marketplace_listings — `iso_14001`, `carbon_disclosed`, `recycled_content_percent`, `ecovadis_score` (item #19)
- [ ] A8. Migration: new table `supplier_ratings` `{listing_id, foundry_id, project_id, on_time, quality, responsiveness, commercial_fairness, notes, created_at}` (item #13)
- [ ] A9. Migration: new table `supplier_interview_responses` (parsed interview-pack replies) (item #12)
- [ ] A10. Migration: new table `supplier_corrections` (crowdsourced fixes) (item #14)
- [ ] A11. Migration: new table `supplier_ai_briefs` (AI-generated summary cache) (item #20)
- [ ] A12. Regenerate types + `tsc --noEmit` clean

### Phase B: In-app features + server actions
Ship the user-facing surfaces that write to the new tables.

- [ ] B1. Post-project supplier rating (#13) — prompt shown after a project's manufacturing orders complete; simple 4-axis 1-5 rating + notes; action writes to `supplier_ratings`
- [ ] B2. Founder-contributed correction button on every supplier card (#14) — "Wrong email / name / country?" opens dialog, writes to `supplier_corrections` with proposed_value, current_value
- [ ] B3. Interview response ingestion (#12) — paste-a-reply UI on supplier detail, LLM parses it into structured columns, writes to `supplier_interview_responses` + updates `supplier_capabilities`
- [ ] B4. AI supplier brief (#20) — server action that reads all structured data for a supplier and generates a 3-paragraph "who/great at/watch-for" brief; cached in `supplier_ai_briefs` for 30d
- [ ] B5. RFQ response library (#16) — server action that aggregates historical `rfq_responses` into per-category benchmarks; show on supplier detail as "typical lead / price range"
- [ ] B6. Sub-tier risk propagation (#17) — extend Supply Risk Radar to traverse `supplier_relationships` one hop and flag indirect exposure

### Phase C: Data migrations + one-off SQL
Runs against production data now that schema exists.

- [ ] C1. Backfill `country_iso` for all 13,420 geocoded rows (item #1 execution)
- [ ] C2. Migrate flat `certifications` JSONB into `supplier_certifications` rows (item #10 execution)
- [ ] C3. Migrate flat `process_capabilities` JSONB into `supplier_capabilities` rows (item #11 execution)
- [ ] C4. Dedup country format — collapse "United Kingdom" variants into "GB" (item #5 execution)

### Phase D: Ingestion pipelines (scripts)
Self-runnable scripts in `scripts/supplier-enrichment/`. Some require API keys; those produce stubs with clear activation instructions.

- [ ] D1. `domain-email-infer.ts` — for rows with website but no email, probe common aliases (sales@, info@, enquiries@, hello@) + MX record check (item #2)
- [ ] D2. `website-enrich.ts` — for a batch of supplier URLs, fetch home + /about + /capabilities, LLM-extract MOQ / lead time / employee count / equipment (item #6)
- [ ] D3. `companies-house-sync.ts` — for UK rows (GB country), look up Companies House by name, enrich founded_year / employee_count / registered address / financial signals (item #8)
- [ ] D4. `sanctions-screen.ts` — weekly cron; download OFAC SDN + BIS Entity List + UK FCDO consolidated list; fuzzy-match supplier names; flag matches in `supplier_sanctions_flags` (item #18)
- [ ] D5. `google-places-lookup.ts` — scaffold with activation flag (needs GOOGLE_PLACES_API_KEY). Stub returns informative error message (item #7)
- [ ] D6. `linkedin-decision-maker-lookup.ts` — scaffold with activation flag (needs APOLLO_API_KEY or HUNTER_API_KEY). Stub ditto (item #9)

### Phase E: Verification + commit + handover
- [ ] E1. `tsc --noEmit` clean
- [ ] E2. eslint clean on new files
- [ ] E3. Vercel Ready on final push
- [ ] E4. agent-browser smoke test (login + navigate to Source supplier detail, confirm no runtime errors)
- [ ] E5. Update MEMORY.md + MemPalace with decisions, gotchas, coverage stats
- [ ] E6. Handover summary for Tristan — what shipped, what's scaffolded pending API keys, activation instructions for each external pipeline

---

## Success criteria

- [ ] All 19 items either shipped live OR scaffolded with clear activation doc
- [ ] Zero new design-token violations
- [ ] Zero new TypeScript errors
- [ ] Migrations apply cleanly against prod Supabase
- [ ] No data loss on existing rows — all new columns default to NULL/false/[]
- [ ] Each commit passes pre-push hooks
- [ ] Rollback path documented for each migration

---

## Rules of engagement

- **Don't break existing code.** All columns added with defaults; all tables created with RLS.
- **RLS on every new table** per ForgeOS multi-tenant rule; use foundry-scoping where the data is tenant-specific (ratings, corrections, interview responses), leave marketplace-wide tables (sanctions flags, capabilities) read-everyone.
- **Log coverage stats** after every backfill so Tristan can see the lift.
- **Commit per phase** (or per 2-3 items if phase is long) so progress is visible in git history.
- **NEVER** hard-code secrets; external-API scripts look for env vars and skip with a clear message if missing.
- **No test user creation** — reuse claude-test@forgeos.test.

---

## Score card (updated as phases complete)

| Phase | Items | Status | Notes |
|---|---|---|---|
| A. Schema | 11 migrations + types | ⏳ | |
| B. In-app features | 6 surfaces | ⏳ | |
| C. Data migrations | 4 one-off SQL | ⏳ | |
| D. Ingestion pipelines | 6 scripts | ⏳ | D5/D6 scaffolded only (need keys) |
| E. Verify + handover | 6 checks | ⏳ | |

**Overall:** 0 / 19 items shipped.

---

## Session log (dated entries as work proceeds)

(appended as each commit lands)
