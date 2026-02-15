# Forge Design → Drawings → RFQ Rollout Checklist

This checklist defines the release gates for the Design-to-Quote flow and maps directly to the quality outcomes in the plan.

## 1) Release Success Criteria

Ship only when all of the following are true:

- Golden benchmark suite passes (`5/5` benchmark cases).
- RFQ regression suite passes with attachment, scorecard, and blocker metadata checks.
- No known blocker that prevents a user from creating an RFQ from generated CAD output.
- Procurement handoff includes:
  - STEP, STL, and manifest coverage for at least one quote-ready module.
  - Design brief + assumptions in RFQ payload metadata.
  - Readability of supplier-facing RFQ description.

## 2) Required Automated Test Commands

Run these before each release candidate:

```bash
npm run test:forge-rfq:contracts
npm run test:forge-rfq
npm run test:forge-rfq:e2e-smoke
npm run verify:forge-rfq-release
```

Treat `npm run verify:forge-rfq-release` as the final one-command gate for release readiness evidence.

Database migration prerequisite (profiles RLS stabilization) must be applied either via authenticated Supabase CLI (`npx supabase db push`) or via manual SQL execution in Supabase dashboard when CLI auth tokens are unavailable.

## 3) Rollout Phases

### Phase A — Internal Alpha

- Audience: internal product + engineering.
- Gate:
  - Execute full benchmark suite.
  - Manually validate one full run from Research → Build → Review → Procurement.
  - Verify RFQ record appears in Marketplace and can be opened from Forge.
- Telemetry review:
  - RFQ creation success ratio.
  - Quote-ready module ratio.
  - Attachment count distribution per RFQ.

### Instrumentation events to verify during alpha

The following activity events should appear for at least one internal demo run:

- `cad_lab_rfq_create_attempt`
- `cad_lab_rfq_created`
- `cad_lab_rfq_create_failed` (only when testing failure paths)
- `cad_lab_rfq_rebroadcast_attempt`
- `cad_lab_rfq_rebroadcasted`
- `cad_lab_package_manifest_downloaded`
- `cad_lab_supplier_packet_downloaded`
- `cad_lab_module_bom_downloaded`
- `cad_lab_manifest_opened`

### Phase B — Design Partner Beta

- Audience: selected pilot customers with supplier workflows.
- Gate:
  - Zero P0/P1 defects in alpha backlog.
  - At least `80%` of beta projects reach RFQ created state without support intervention.
- Telemetry review:
  - Supplier response count within 7 days.
  - Clarification-loop rate (RFQ comments requesting missing CAD info).
  - Re-broadcast usage and incremental supplier reach.

### Phase C — Gradual Public Release

- Audience: percentage-based rollout to Forge users.
- Gate:
  - Beta metrics stable over a 2-week window.
  - No regression in CAD generation success rate.
- Monitoring:
  - End-to-end conversion: design start → RFQ created.
  - Stage-level drop-off (Research, Build, Review, Procurement).
  - Quality scorecard distribution over time.

## 4) Rollback Triggers

Rollback rollout level if any trigger is detected:

- RFQ creation failure rate increases by >10% absolute from baseline.
- Quote-ready module count falls below baseline for 3 consecutive days.
- Marketplace RFQ attachments missing/invalid in production incidents.

## 5) Operational Ownership

- Engineering owner: Forge platform team (generation + procurement integration).
- Product owner: Forge PM (flow adoption + quality outcomes).
- Weekly review packet should include:
  - benchmark suite results
  - RFQ conversion metrics
  - supplier response quality notes
  - latest manual product-pass results artifact status
