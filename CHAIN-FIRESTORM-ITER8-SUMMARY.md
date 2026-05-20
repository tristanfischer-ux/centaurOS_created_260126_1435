# Chain Firestorm — Iter 8 Final Summary

**Period:** 2026-05-20 (single day)
**Outcome:** 11 production commits, every iter-7 visual finding addressed at root cause + 2 new PDF sections + framing decision locked in.

## Commits landed on `origin/main`

| Commit | What it closes |
|---|---|
| `5e2fb892d` iter-6 | Arithmetic gates trigger/verify on 7 gates · physics-critic blocking promotion · cover DO-NOT-PROCURE banner · unit-aware brief reader on 7 class metric_computes |
| `cb3feb843` iter-7 | Per-m² VF price band · hero + module image suppression when brief envelope > 8 m³ |
| `05d2b8fcd` | Performance Characteristics card (Section 0.5) — class-aware spec sheet with brief-vs-derived cross-check |
| `5fee388cb` | Compliance regulation canonicalisation (de-dup MD 2006/42/EC ↔ 2006/42/EC) · cover title sentence-boundary derivation |
| `aa394cef8` | K10 cross-class bleed — VF class-connections fix + universal guard that skips required-edges referencing modules absent from the actual design |
| `7a8565b6d` | Universal Power Balance arithmetic gate (closes LED 10× driver mismatch class) · Universal Pressure Balance gate (closes RO pump 6× shortfall class) |
| `349751e9d` | Engine B universal class-floor clamp (20 component classes) + vertical-farm overrides expansion from 4 → 12 classes |
| `decdcdfa6` | Design Trade-offs section (Section 1.5) — CAPEX/OPEX/Reliability framing chosen by council vote, Tristan-confirmed |
| `c50bfb933` | Naming-collision fix (DesignTradeOffsPage vs legacy Section 4 DesignDecisionsPage) |
| `1f8a938f4` | BoM duplicate line detection (manufacturer + role within sub-module) · render-time supplier name-URL reconciliation |
| `0c2a1c873` | Fan static-pressure feasibility arithmetic gate (closes AHU axial-fan-stall class) · description-as-SKU pattern strip pre-pass |

## Iter-7 visual findings → root-cause fix map

Every finding catalogued in the visual PDF read of efe55422 has a corresponding commit:

| # | Severity | Finding | Universal fix commit |
|---|---|---|---|
| A | CRITICAL | Engine B BoM catastrophic under-pricing (1000× off on container, LED, insulation) | `349751e9d` |
| B | HIGH | LED 10× driver/panel power mismatch (Module 4) | `7a8565b6d` |
| C | HIGH | AHU axial fan static-pressure stall (300mm @ 150 Pa) | `0c2a1c873` |
| D | HIGH | RO pump 6× pressure mismatch (2.5 bar vs 15 bar required) | `7a8565b6d` |
| E | CRITICAL | G5 fake-part rate 46% (Generator SKU hallucination) | `0c2a1c873` (light) — full RAG = iter-9 |
| F | HIGH | Supplier URL/name misattribution (GrowUp → cambridge-hok) | `1f8a938f4` |
| G | MED | Cover title truncation mid-word | `5fee388cb` |
| H | MED | Duplicate LED Driver line items in BoM | `1f8a938f4` |
| I | HIGH | K10 cross-class bleed (Energy Storage Source on VF) | `aa394cef8` |
| J | LOW | Compliance regulation duplicates (MD 2006/42/EC × 2) | `5fee388cb` |

## What every PDF now does that it didn't before

**New sections every PDF gets** (Sections 0.5 and 1.5):
- **Performance Characteristics** — class-aware spec sheet (canopy m², PPFD, kW heat removal, RH range, CO2 target, voltage, etc.) with brief-vs-derived cross-check + delta flagging
- **Design Trade-offs** — every chain choice with alternative + CAPEX↓/OPEX↓/Reliability↑ trade chips + APPLIED/FLAGGED/BLOCKED status

**New behaviours that block bad output**:
- DO-NOT-PROCURE banner on cover when physics critic ≤ 3/10
- Hero + module images suppressed when brief envelope > static-hero scale (cabinet PNG no longer shown for 40ft container brief)
- Engine B class-floor clamp prevents 1000× under-priced lines
- 9 universal arithmetic gates fire incomplete-fail (not silent skip) on partial fields:
  - capacity (cells × Ah × V), module cell count, series stack voltage, usable energy closure, COP, refrigerant mass flow, LED PPFD/area, irrigation flow, **power balance (new)**, **pressure balance (new)**, **fan static-pressure (new)**

**New defensive guards**:
- K10 cross-class bleed: gate skips required-edges referencing modules absent from the design
- Compliance code canonicalisation: dedup across formatting variants
- Supplier name-URL reconciliation at render time (DB-sourced too, not just LLM-sourced)
- BoM duplicate group detection (flag for manual review, conservative — don't auto-merge)
- Pattern-based SKU strip (catches "200 W, 0.9 PF" descriptions used as part numbers)
- Title derivation finds sentence boundary instead of slicing mid-word

## Framing decision (council + Tristan)

**CAPEX / OPEX / Reliability** is the trade-off triangle for engineering PDF audiences. NOT speed/cost/quality.

Council vote: 2 of 3 (Grok 4.3 + Gemini 3.5 Flash) rejected speed/cost/quality as "a software/startup framing that misleads engineering readers". Tristan confirmed "capex opex reliability is much better".

Locked into `src/lib/pdf-engine-v2/design-decisions-review.ts` as the `TradeAxis` type. Future trade-off features default to this triangle.

## Structural items deferred to iter-9

Council found one finding STRUCTURALLY not fixable in current architecture:

- **SKU verification via verified catalogue (RAG with Octopart/Mouser API)** — full closure of the G5 46% fake-rate. The pattern-strip light version (commit 0c2a1c873) catches description-as-SKU strings; full closure needs decoupled "Retrieval-Augmented Generation + Database Verification" architecture per Gemini council. Estimated effort: 1+ days.

Also worth doing soon but not done this iteration:
- Per-brief image generation (replace static `public/heroes/*-cover.png` with diffusion-model per-chain output reading brief envelope dims). Until done, the envelope-mismatch suppression (cb3feb843) is the honest fallback.
- Class registry validation at deploy time (load-time check that every class-connections.ts module name appears in that class's expected module list). Currently caught at runtime via the universal guard.

## Council reliability profile (for future audits)

Tested this session for long-prompt (>3K char) engineering audits:

| Model | First-attempt landed | Notes |
|---|---|---|
| Grok 4.3 | 100% (4 of 4) | Content-first, honest, 6-8 findings per audit, ~$0.05 |
| Gemini 3.5 Flash @ 16K | 100% (3 of 3) | Rich findings, ~$0.18, multimodal-capable |
| Opus 4.7 | 75% (3 of 4) | One empty content in design-framing council; usually lands ~$0.70-0.85 |
| GPT-5.5 | 50% (2 of 4) | Highest yield when it lands; SSE-keepalive timeout failure mode |
| Avoid for image input: GLM-5.1, MiMo (silent image drop per saved gotcha) |

## Verification path

Every commit IS in the production chain path (`website → /api/pdf-engine-v2/submit → pdf_engine_runs → Mac Studio worker → spawn('tsx', 'scripts/serial-design-chain-v2.tsx')`).

The Mac Studio worker is currently idle and on `origin/main` HEAD `0c2a1c873`. The next brief submission picks up every fix.

To verify end-to-end: submit a fresh VF brief (or any brief) through the website. The resulting PDF should:
- Have Section 0.5 Performance Characteristics
- Have Section 1.5 Design Trade-offs
- Show DO-NOT-PROCURE banner IF physics critic returns ≤ 3/10
- Show no hero image if envelope > 8 m³ (until iter-9 per-brief image gen)
- Have BoM total roughly 5-10× higher than iter-7 (£40-80k for VF) — Engine B floors now in place
- Have no "Energy Storage Source" Design Decision on a VF
- Have no duplicate compliance entries
- Have no description-as-SKU values in BoM
