# NEW-001 — Brief-Feasibility Feedback Loop

**Status:** deferred per Tristan 2026-05-06: *"resolve later, not now"*
**Stub module:** `src/lib/pdf-engine-v2/stages/1.5-feasibility-advisor.ts`
**Delivery estimate:** v4 full = 15-20 hrs across 4-5 sessions; v4-MVP narrow = 5-7 hrs

---

## The problem

When a brief is physically impossible (e.g. *"10 MWh battery pack in a briefcase"*), today's pipeline runs:

```
Research → Decompose → Sizing (returns INFEASIBLE) → skip downstream → partial PDF with red banner
```

Founder sees only *"Sizing solver returned INFEASIBLE"*. No indication of **which constraint is the blocker**, **by how much**, or **what to change**. The brief stays broken.

Goal: before Sizing runs, compute the **relaxation frontier** — which constraint(s) to relax and by how much — and present 2-4 ranked options.

---

## v1 — original plan (deprecated)

- Hardcoded `lib/physical-limits.ts` per product class (BESS, heat pump, farm)
- Deterministic algorithm computes hard blockers + relaxation options
- Cheap LLM rephrases rationale, forbidden from changing numbers
- PDF section shows options
- **Terminal: pipeline short-circuits on infeasible** (skips decompose / sizing / BOM)

## v2 — after first council review (Grok 4.3 + GPT-5.5 + MiMo partial)

**Changes forced by review:**

1. **NOT terminal** — pipeline continues, advisor is advisory only. Both reviewers said: mis-extracted constraints would permanently block valid briefs.
2. **Stage moved from before Decompose → after Decompose** — module-level envelope gives better feasibility signal than abstract rules on raw brief text.
3. **Ranges + year + confidence grade per rule** instead of single-point values.
4. **Fixed BESS £/kWh** from £95 → £62 (Grok caught this; BNEF Q4 2024 has cells at ~$78/kWh ≈ £62/kWh).
5. **Fixed vertical-farm yield** from 0.7 → 0.10 m²/(kg/week) (Grok: was off by order of magnitude).
6. **R290 charge limit context-aware** — 500g was only for <20 m² rooms per EN 378-1 Annex A.
7. **LLM diff guard** — hash numbers before/after rephrasing, reject if changed.

**Still wrong in v2** (caught by v3 reviewer MiMo): farm energy floor 2.0 kWh/kg is 3-5× too low. First-principles DLI calculation: 17 mol/m²/day × 35 days / 3.2 µmol/J ≈ 12.9 kWh/kg lighting alone, plus HVAC. Published literature (Graamans, Kozai, Penn State, Benke & Tomkins) shows 5-30 kWh/kg typical. MiMo's recommended range: typical 8-12, range [3, 30].

## v3 — after Tristan's architectural concern

**Tristan flagged:** *"we need something that is universal for all products and not just specifically for batteries or vertical farms."*

**Fundamental reframe:** not per-product-class rules, but **universal physics**. Every brief has numeric dimensions (energy, power, mass, volume...). Feasibility = **ratio between dimensions** checked against fundamental physics ceilings (Carnot, Landauer, photosynthesis theoretical limit, material bond energies, etc.).

- *"10 MWh in briefcase"* fails because 36 GJ / 0.01 m³ = 3.6 TJ/m³ > Li-metal-air ceiling (~3.6 GJ/m³) by 1000×
- Works for BESS, heat pump, farm, **and** drone, ASIC, rocket, pharma — no product taxonomy needed
- Industry numbers (LFP at 225 Wh/L, farm at 10 kWh/kg) stay in `benchmarks.ts` as advisory bands, not blockers
- Short LLM call classifies regime (electrochemical vs mechanical vs thermal); if unclear, use most-permissive ceiling

## v4 — after 5-model council review of v3

**Council:** Grok 4.3 + MiMo V2.5-Pro + GLM-5.1 + DeepSeek V4-Pro + GPT-5.4, fired in parallel via direct OpenRouter curl. Total cost ~£0.023, turnaround 2 min 6 s.

### 11 BLOCKER findings (by seat agreement count)

| # | Finding | Seats | Fix in v4 |
|---|---|---|---|
| 1 | Regime classifier IS the gatekeeper not an advisor | 5 | Retire classifier. Unit-signature match per ceiling; emit per-hypothesis verdict; aggregate by tightness |
| 2 | 30 ceilings not enough; real MVP needs 80-180 | 5 | Expand library to 100-180 across 9 domains (add structural, thermal/fluid, biotech, quantum, materials synthesis, semiconductors, PV, comms, safety) |
| 3 | Software/non-physical briefs silently pass | 2 | Upstream `physicality` gate: physical / hybrid / informational; advisor skipped with explicit banner for informational |
| 4 | Compound products produce meaningless ratios | 4 | Dimension **provenance** tag — energy-in-storage ≠ energy-in-fuel; mass-of-turbomachinery ≠ mass-of-propellant. Ceilings apply per provenance |
| 5 | Pairwise passes ≠ overall feasibility | 5 | LP feasibility check on full claim vector against regime's Pareto envelope |
| 6 | Missing dimensions: T, P, V, I, velocity, ω | 3 | Expand canonical dimension list from 9 to ~18 |
| 7 | Signed / differential dimensions break model | 3 | `kindQualifier: intensive\|extensive\|differential` + `signed: true\|false` |
| 8 | Cost fires wrong ceilings on non-storage briefs | 2 | Provenance-aware cost dimension + regime-specific applicability |
| 9 | "Most-permissive" default biases to false negatives | 2 | Emit INDETERMINATE when regime can't be identified; never FEASIBLE-by-omission |
| 10 | Regulatory/supply-chain blockers = 40-60% of real infeasibility | 2 | Three parallel advisors: physics ∥ regulatory ∥ supply-chain. All can block |
| 11 | Compute ceiling is not just Landauer | 2 | Shannon + memory wall + bandwidth-delay + control fidelity + error-correction overhead |

### v4 architectural changes vs v3

| v3 | v4 | Driver |
|---|---|---|
| Regime classifier LLM call | Unit-signature match per ceiling + multi-hypothesis emit | #1 |
| ~30 ceilings | 100-180 across 9 domains | #2 |
| Implicit physicality | Explicit `physicality` gate; advisor skipped if informational | #3 |
| `ClaimDimension = { kind, value, unit, si }` | + `provenance` + `kindQualifier` + `signed` | #4, #6, #7 |
| Pairwise ratio check | Pairwise + LP on Pareto envelope | #5 |
| Most-permissive when ambiguous | INDETERMINATE when ambiguous | #9 |
| Physics advisor only | Physics ∥ regulatory ∥ supply-chain, co-equal | #10 |
| Single compute ceiling | Compute/comms library with 5+ entries | #11 |

### v4 scope

```
lib/
  claim-dimensions.ts       — extract + SI-normalise dimensions from any brief
  physics-ceilings.ts        — 100+ first-principles ceilings
  regime-signatures.ts       — unit-algebra ceiling matching
  pareto-envelopes.ts        — LP feasibility solver per regime
  physicality-gate.ts        — physical / hybrid / informational classifier

stages/
  1.5-feasibility-advisor.ts       — physics advisor (implements this stub)
  1.6-regulatory-advisor.ts        — parallel regulatory check
  1.7-supply-chain-advisor.ts      — parallel supply-chain check

Total: 8 new modules, ~2000 lines of code + physics data + tests
```

### v4 delivery estimates

- **v4 full:** 15-20 hrs across 4-5 sessions. Ships all 11 council findings addressed. Right-sized for the actual scope uncovered.
- **v4-MVP narrow:** 5-7 hrs. Physical products only, 30 highest-leverage ceilings, unit-signature matching, LP deferred. Software / biotech / quantum briefs get "advisor unavailable for this domain" banner. Gets ~70% of value in original budget.

### Council cost accounting (for future reference)

| Round | Models | Tokens | Cost |
|---|---|---|---|
| v2 review | Grok 4.3 + GPT-5.5 (truncated) | ~3k | £0.30 |
| v3 review | MiMo V2.5-Pro (via direct curl, MCP timed out) | 6k cap | £0.015 |
| v4 review | 5-model parallel: Grok, MiMo, GLM, DeepSeek V4-Pro, GPT-5.4 | ~13k | £0.023 |
| **Total** | | | **~£0.34** |

---

## What was learned that we want to keep

1. **Physics ceilings don't age.** Carnot's limit, photosynthesis theoretical max, material bond energies, speed of light — these don't drift. Industry state-of-the-art numbers DO drift and belong elsewhere (`benchmarks.ts`).
2. **Applicability is the hardest problem.** Not "what's the ceiling" but "does this ceiling apply to this brief". Unit-signature matching + required-evidence tags is the cleanest approach; single-label regime classification is fatally brittle.
3. **Advisor must be advisory, not terminal.** Research-stage mis-extractions can fabricate constraints. A valid brief should never be permanently blocked by the advisor.
4. **Provenance ≠ value.** A number without context (energy-of-what? mass-of-what?) generates meaningless ratios when paired with other numbers. Extractor must tag every number with its subsystem.
5. **Regulatory / supply-chain blockers are peers.** Treating them as footnotes to physics advisor was a v3 mistake. 40-60% of real infeasibility is non-physical.
6. **6-model consensus beats 2-model consensus.** The v4 review caught 11 findings that v2/v3 reviews missed. GPT-5.5 truncation + Gemini timeouts meant some rounds were undersampled. Going direct-curl via OpenRouter with 5 parallel models + 170s timeout is a reliable pattern for future deep reviews.

---

## References

- `src/lib/pdf-engine-v2/stages/1.5-feasibility-advisor.ts` — stub module with locked type signatures
- `src/lib/pdf-engine-v2/TRACKER.md` — session-level work tracker (NEW-001 row points here)
- Raw council outputs for v4: `/tmp/council-{grok,mimo,glm,dsp,gpt}.json` (ephemeral — re-run if needed)
