# Shadow-Mode Phase 5 Aggregator Report

**Generated:** 2026-05-10T17:43:09.956Z
**Evidence directory:** `/Users/tristanfischer/Downloads/engine-evidence/radical-shadow-20260510T1643`
**Runs processed:** 8 (8 succeeded, 0 failed)

## Cutover-Readiness Verdict

### ✅ READY

**Notes:**
- Cost delta: no data (no runs with both radical and legacy cost summaries).

## Overall Aggregated Metrics

| Metric | Value | Criterion | Pass? |
|--------|-------|-----------|-------|
| Cost delta — % runs within ±2% | N/A | >99.5% | ❌ |
| Cost delta — median | N/A | — | — |
| Cost delta — p95 (abs) | N/A | ±2% | ✅ |
| Cost delta — p99 (abs) | N/A | — | — |
| Pipeline success rate | 100.0% | >99.9% | ✅ |
| Both-PDF write success rate | 100.0% | >99.9% | ✅ |
| Latency ratio — median | 22% | ≤120% | — |
| Latency ratio — p95 | 27% | ≤120% | ✅ |
| Latency ratio — max | 27% | — | — |
| Grammar firing rate (≥1 WARN/BLOCK) | 12.5% | >10% | ✅ |
| Avg verified-MPN% | 18.9% | informational | — |
| Avg data-gap% | 52.2% | informational | — |

## Per-Class Breakdown

| Class | n | Cost Δ median | Cost Δ p95 | Success | Both PDFs | Grammar | Verified% | Data-gap% |
|-------|---|--------------|------------|---------|-----------|---------|-----------|-----------|
| auv | 1 | N/A | N/A | 100.0% | 100.0% | 100.0% | 25.0% | 50.0% |
| bioreactor | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 12.5% | 37.5% |
| wearable_medical | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 33.3% | 66.7% |
| drone | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 14.3% | 71.4% |
| edge_ai_server | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 16.7% | 66.7% |
| ev_charger | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 17.6% | 41.2% |
| vertical_farm | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 18.8% | 37.5% |
| thermal_system | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 13.3% | 46.7% |

## Per-Run Detail

| Slug | Class | OK | Cost Δ | Both PDFs | Latency ratio | Grammar | Verified | DataGap | Error |
|------|-------|----|--------|-----------|---------------|---------|----------|---------|-------|
| rs-auv | auv | ✅ | N/A | ✅ | 18% | ✅ FIRED | 25.0% | 50.0% | — |
| rs-bioreactor | bioreactor | ✅ | N/A | ✅ | 27% | — | 12.5% | 37.5% | — |
| rs-cgm | wearable_medical | ✅ | N/A | ✅ | 14% | — | 33.3% | 66.7% | — |
| rs-drone | drone | ✅ | N/A | ✅ | 17% | — | 14.3% | 71.4% | — |
| rs-edge-ai | edge_ai_server | ✅ | N/A | ✅ | 19% | — | 16.7% | 66.7% | — |
| rs-ev-charger | ev_charger | ✅ | N/A | ✅ | 26% | — | 17.6% | 41.2% | — |
| rs-farm | vertical_farm | ✅ | N/A | ✅ | 27% | — | 18.8% | 37.5% | — |
| rs-heatpump | thermal_system | ✅ | N/A | ✅ | 25% | — | 13.3% | 46.7% | — |

## Cutover Readiness Ranking

Classes sorted by cost delta p95 ascending (lowest divergence = most ready first):

1. **auv** — cost p95=N/A, within±2%=N/A, status=NOT READY
2. **bioreactor** — cost p95=N/A, within±2%=N/A, status=NOT READY
3. **wearable_medical** — cost p95=N/A, within±2%=N/A, status=NOT READY
4. **drone** — cost p95=N/A, within±2%=N/A, status=NOT READY
5. **edge_ai_server** — cost p95=N/A, within±2%=N/A, status=NOT READY
6. **ev_charger** — cost p95=N/A, within±2%=N/A, status=NOT READY
7. **vertical_farm** — cost p95=N/A, within±2%=N/A, status=NOT READY
8. **thermal_system** — cost p95=N/A, within±2%=N/A, status=NOT READY

## Methodology

- **Cost delta** = `(radicalCostSummary.bomTotal - legacyCostBomTotal) / legacyCostBomTotal`
- **Pipeline success rate** = % runs where `.done` sentinel was written and `ok=true`
- **Both-PDF rate** = % successful runs where both `report.pdf` and `radical.pdf` exist with size >0
- **Latency ratio** = Phase 5 render time / primary PDF render time (from run-manifest.json)
- **Grammar firing rate** = % runs where ≥1 WARN or BLOCK verdict fires
- **Verified-MPN%** = `verified_by_distributor / total_leaves` from resolution_meta.stats
- **Data-gap%** = `data_gap / total_leaves` from resolution_meta.stats

All data sourced from `run-manifest.json` + `state.json` per run directory.
Latency data is only available when the batch runner writes timing into `run-manifest.json`.