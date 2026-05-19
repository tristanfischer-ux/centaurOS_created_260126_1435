# Shadow-Mode Phase 5 Aggregator Report

**Generated:** 2026-05-10T20:16:30.864Z
**Evidence directory:** `/Users/tristanfischer/Downloads/engine-evidence/radical-shadow-20260510T1918`
**Runs processed:** 10 (10 succeeded, 0 failed)

## Cutover-Readiness Verdict

### ⚠️ NEEDS CALIBRATION

**Blockers:**
- Cost delta: 0.0% of runs within ±2% (criterion: >99.5%). Likely vendor catalog or Grade D calibration needed.

## Overall Aggregated Metrics

| Metric | Value | Criterion | Pass? |
|--------|-------|-----------|-------|
| Cost delta — % runs within ±2% | 0.0% | >99.5% | ❌ |
| Cost delta — median | +55.64% | — | — |
| Cost delta — p95 (abs) | 66.93% | ±2% | ❌ |
| Cost delta — p99 (abs) | 67.93% | — | — |
| Pipeline success rate | 100.0% | >99.9% | ✅ |
| Both-PDF write success rate | 100.0% | >99.9% | ✅ |
| Latency ratio — median | 22% | ≤120% | — |
| Latency ratio — p95 | 32% | ≤120% | ✅ |
| Latency ratio — max | 37% | — | — |
| Grammar firing rate (≥1 WARN/BLOCK) | 30.0% | >10% | ✅ |
| Avg verified-MPN% | 31.5% | informational | — |
| Avg data-gap% | 0.0% | informational | — |

## Per-Class Breakdown

| Class | n | Cost Δ median | Cost Δ p95 | Success | Both PDFs | Grammar | Verified% | Data-gap% |
|-------|---|--------------|------------|---------|-----------|---------|-----------|-----------|
| energy_storage | 1 | +43.09% | 43.09% | 100.0% | 100.0% | 100.0% | 25.0% | 0.0% |
| haps | 1 | +68.18% | 68.18% | 100.0% | 100.0% | 0.0% | 22.2% | 0.0% |
| auv | 1 | N/A | N/A | 100.0% | 100.0% | 100.0% | 28.6% | 0.0% |
| bioreactor | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 40.0% | 0.0% |
| wearable_medical | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 33.3% | 0.0% |
| drone | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 50.0% | 0.0% |
| edge_ai_server | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 37.5% | 0.0% |
| ev_charger | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 33.3% | 0.0% |
| vertical_farm | 1 | N/A | N/A | 100.0% | 100.0% | 0.0% | 23.1% | 0.0% |
| thermal_system | 1 | N/A | N/A | 100.0% | 100.0% | 100.0% | 22.2% | 0.0% |

## Per-Run Detail

| Slug | Class | OK | Cost Δ | Both PDFs | Latency ratio | Grammar | Verified | DataGap | Error |
|------|-------|----|--------|-----------|---------------|---------|----------|---------|-------|
| rs-auv | auv | ✅ | N/A | ✅ | 16% | ✅ FIRED | 28.6% | 0.0% | — |
| rs-bess | energy_storage | ✅ | +43.09% | ✅ | 37% | ✅ FIRED | 25.0% | 0.0% | — |
| rs-bioreactor | bioreactor | ✅ | N/A | ✅ | 24% | — | 40.0% | 0.0% | — |
| rs-cgm | wearable_medical | ✅ | N/A | ✅ | 14% | — | 33.3% | 0.0% | — |
| rs-drone | drone | ✅ | N/A | ✅ | 20% | — | 50.0% | 0.0% | — |
| rs-edge-ai | edge_ai_server | ✅ | N/A | ✅ | 19% | — | 37.5% | 0.0% | — |
| rs-ev-charger | ev_charger | ✅ | N/A | ✅ | 25% | — | 33.3% | 0.0% | — |
| rs-farm | vertical_farm | ✅ | N/A | ✅ | 27% | — | 23.1% | 0.0% | — |
| rs-haps | haps | ✅ | +68.18% | ✅ | 19% | — | 22.2% | 0.0% | — |
| rs-heatpump | thermal_system | ✅ | N/A | ✅ | 27% | ✅ FIRED | 22.2% | 0.0% | — |

## Cutover Readiness Ranking

Classes sorted by cost delta p95 ascending (lowest divergence = most ready first):

1. **energy_storage** — cost p95=43.09%, within±2%=0.0%, status=NOT READY
2. **haps** — cost p95=68.18%, within±2%=0.0%, status=NOT READY
3. **auv** — cost p95=N/A, within±2%=N/A, status=NOT READY
4. **bioreactor** — cost p95=N/A, within±2%=N/A, status=NOT READY
5. **wearable_medical** — cost p95=N/A, within±2%=N/A, status=NOT READY
6. **drone** — cost p95=N/A, within±2%=N/A, status=NOT READY
7. **edge_ai_server** — cost p95=N/A, within±2%=N/A, status=NOT READY
8. **ev_charger** — cost p95=N/A, within±2%=N/A, status=NOT READY
9. **vertical_farm** — cost p95=N/A, within±2%=N/A, status=NOT READY
10. **thermal_system** — cost p95=N/A, within±2%=N/A, status=NOT READY

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