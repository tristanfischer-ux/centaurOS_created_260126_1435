# CO₂ Cost Audit Trail — Plan (Level 1 + Level 2)

_2026-06-05. The founder of the CO₂ business asked where the costings came from and wants **high-confidence numbers backed by a traceable methodology.** Tristan: do both levels. Grounded on the real run `out/release-co2_mineralisation-iter1`._

## 0. Read this first — the honest confidence ceiling

A founder staking his credibility deserves the real ceiling, not a comfortable one:

- **Traceable methodology — fully achievable.** Every £ can show its correlation/rate, inputs, source, factors, and date. No barrier.
- **"High confidence" — qualify it.** A correlation-based estimate for bespoke fabricated process equipment is an **AACE Class 4 estimate (≈ ±30%)**. Getting to Class 1 (±10%) requires **vendor quotes** for the big-ticket items. So the deliverable is: a defensible, fully-traceable Class-4 estimate **+ an RFQ pack** that tees up the handful of lines that should be quoted to firm them. **We will not present a ±30% estimate as if it were ±10%** — that mismatch is exactly the credibility failure to avoid.
- **Plant context.** 1 t/day CO₂ = 365 t/yr (demonstrator scale). Installed ASP £2,611,080 = **£7,150/(t·yr)** — high-but-in-band for amine capture at this tiny scale (no economies). Two flags: **(a)** already over the £1.9M brief ceiling; **(b)** installed is only ~2.6× the raw-materials BoM, vs a fluid-processing **Lang factor ~4.7×** — the current markup likely isn't a process-plant basis. The methodology surfaces the right factor, sourced.

## 1. Where the costs come from today (the gap)

| Tier | ~Count | Price source | Provenance today |
|---|---|---|---|
| Real catalogue price | **8** | live distributor + datasheet URL | ✅ price + URL |
| Identity-matched, price estimated | ~30 | part confirmed real (Tavily/corpus URL), £ is Engine-B estimate | ⚠️ identity only |
| Manufactured / bespoke | the rest | `estimate-missing-prices.tsx` component-class reference curve | ❌ none |

Only ~6% of lines carry a sourced price. The engine captures **part-identity** provenance (`source_url`, corpus match) but **zero cost-basis** provenance. Identity ≠ price.

## 2. Level 2 — defensible cost basis (fix the numbers)

Replace the class-anchor reference curve, for fabricated process equipment, with industry-standard methods:

- **Purchased-equipment cost correlations** (Towler & Sinnott *Chemical Engineering Design*; Coulson & Richardson Vol 6 / Turton): `C_e = a + b·S^n`, S = capacity/size (column volume, HX area, reactor volume, pump flow, blower duty). Each correlation cited, CEPCI-indexed to a stated year.
- **Installed cost via bare-module / Lang factors** appropriate to a **fluid-processing plant** (Lang ~4.7; or per-equipment Turton `F_BM`) — not a generic manufacturing markup.
- **Material take-off** (mass × £/kg + fabrication hours × £/hr) for the skid, structural steel, and bespoke vessels where mass is derivable from the design.
- **Catalogue/bought parts** keep distributor prices (already good); add vendor quotes where the founder can get them.
- A **sourced rate/correlation library**: reference costs, exponents, £/kg, factors — each entry carries a citation + date + currency + CEPCI index year.

## 3. Level 1 — the traceable trail (show the methodology)

Per-line `cost_basis` record, captured at the moment each price is set:

```
{ method,              // quote | catalogue | capacity_factored | material_takeoff | factored | class_reference
  inputs[],            // {name, value, unit, source}  e.g. column_volume 28 m³
  unit_rate,           // {value, unit, source, cepci_year}
  correlation_ref,     // e.g. "Towler & Sinnott Table 7.2, vertical vessel"
  factors[],           // {name, value, source}  e.g. bare-module 4.1; margin 0.15
  result_gbp,
  estimate_class,      // AACE 5..1
  confidence,          // low|moderate|high
  rfq_recommended }    // bool — flag the big lines to quote
```

Rendered as a **"Cost Basis & Assumptions"** section (mirrors the existing Brief Provenance / Appendix B pattern in `render-minimal-pdf.tsx`): per-line trail (esp. fabricated), per-module roll-up, and a headline block — methodology statement, overall estimate class, £/(t·yr) sanity, ceiling status, and the RFQ shortlist.

## 4. Universal (build once)

Process-equipment correlations cover every process class (CO₂, bioreactor, electrolyser, desal, VF nutrient skids…); material take-off + Lang/module factors are universal; the `cost_basis` model + rendered section are class-agnostic. This is not CO₂-only plumbing.

## 5. Sequencing — mockup-first

1. **Mockup** (static HTML): "Cost Basis & Assumptions" on the **real CO₂ flagship lines** (absorber + stripper columns, gypsum carbonation reactor, K₂SO₄ crystalliser, MEA recovery, skid/structure, key HX + pumps) with genuine correlation-based numbers + sources → Tristan + founder sign-off on format **and** the honesty framing.
2. `cost_basis` data model + capture hooks (Engine-B, distributor, macro, cost-repair each stamp a basis).
3. Process-equipment correlation library + estimator — **council-validated** (credibility-critical).
4. Render the section + headline + RFQ flags.
5. Gate/invariant: every priced line carries a `cost_basis`; estimate-class disclosed; £/(t·yr) sanity + ceiling status surfaced.
6. RFQ-pack generator: the big lines → a quote request the founder sends to fabricators (the Class-4 → Class-1 path).

## 6. Honest risks
- Correlation libraries are CEPCI-indexed — must state index year + currency, or the numbers drift.
- ±30% is the ceiling without quotes; the RFQ path is the route to high confidence — set that expectation with the founder explicitly.
- A correct process-plant factored estimate may push the total **over** the £1.9M ceiling; surface it, don't bury it. That conversation is more valuable to the founder than a comfortable wrong number.
