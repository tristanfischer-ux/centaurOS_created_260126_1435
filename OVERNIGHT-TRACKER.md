# Overnight BESS L47→L50 Tracker — 2026-05-27

User directive: "push higher. do the fixes. then loop. then council. then fix then loop. do this 4 times. get the quality above 8 overall. think hard on how to do this. do autonomously. I am going to sleep."

## Trajectory baseline

| Iter | Exit | PC mean | Council mean | Notes |
|---|---|---|---|---|
| L43 | 18 | 8.8 | 4.90 | Schaltbau under-bill + over-deliver under-target |
| L44 | 23 | — | — | arc_flash_barrier sub_module gap |
| L45 | 0 | 8.4 | 3.50 | Council fixes surfaced AC pricing + compliance + cost basis bugs |
| L46 | 18 | 8.0 | **6.55** | First PASS on 6.5 gate; 3 new findings (slot smear, cover basis, naming/rating) |

## L46 → ≥8.0 strategy

Per-dimension gap to 8.0 at L46 mean: fidelity 8.00 ✓, plausibility 6.50, coherence 5.75, realism 6.25, presentation 6.25.

Council verdict consensus: 3/4 seats still "No" on investor-presentability. Gap to investor-ready dominated by:
- Slot-smear (DC parts in AC sub-modules)
- Cover-page basis mismatch (banner + £/kWh)
- Macro override stripping mfr/pn even when word has them
- Reviewer-merge word swap (L33-era architectural recurrence)
- BoM realism gaps (cables £8, busbar £40, fuse £613 over, pre-charge £9.67 under)
- Narrative-vs-BoM 15× C310K/500 naming/rating contradiction

## L47-L50 plan

| Iter | Theme | Fixes |
|---|---|---|
| **L47** | Architectural composition + reviewer guard + cover basis | (1) Sub-module domain-match guard (dc_* / ac_*); (2) Reviewer-merge ID-preservation guard; (3) Macro override mfr/pn preservation when word has them; (4) Cover banner uses costStack.oem_transfer_price_gbp; (5) Cover £/kWh card uses ex-works numerator; (6) Rename dc_main_contactor → dc_string_contactor |
| **L48** | BoM realism polish | DC HRC fuse re-price, pre-charge resistor re-price, busbar re-price, cable per-metre, address L47 surfaces |
| **L49** | Whatever L48 surfaces (iceberg) | Likely narrative-vs-BoM consistency, remaining slot fixes |
| **L50** | Final polish + verify ≥8.0 | Whatever L49 surfaces |

## Status

### L47 — done
- 3 commits: `2ded0f358` + `6d08ab455` + `fc9fa2fd0`
- Council mean **5.55** (REGRESSION -1.00 vs L46 6.55, FAIL ≥7.5)
- Architectural wins: ac_switchgear/dc_distribution slot smear gone, contactor renamed, mfr/PN preserved on macro override, cover/banner/£/kWh on ex-works basis
- Council root cause for regression: macro override mfr/PN fix EXPOSED the £0 emitter prices on cell_string + PCS + step_up_transformer + ac_grid_interconnect (4/4 seats). part_realism collapsed 6.25 → 3.75.

### L48 — chain landed exit 18 (gate 11 FP), council in flight
- 3 commits: `dabcf7336` + `b50915f16` + `f7721c56e`
- BoM raw materials: **£625k** (was £382k L47, £546k L46) — 4 high-value pins landed
- Physics Critic mean: **8.4** (9/7/8/9/9 — drop from L47 9.0 due to PCS-heat narrative misread, not real engineering bug)
- Council `a44874a8855768014` running against ≥7.5 gate

### L48 — council 7.07 (FAIL ≥7.5 by 0.43)
- BoM **£803k** raw / £1.5M ex-works / £1.8M installed (in premium band)
- All 7 L48 fixes landed cleanly; part_realism dimension 8.4 (highest)
- Single dominant blocker: BoM sub-total column wrap rendering as £-391k/£-150k (3/4 seats HIGH)
- DeepSeek 8.6 / Grok 6.52 / GLM 6.40 / GPT-5.5 6.74

### L49 — BLOCKED: OpenRouter credits exhausted
- 2 commits READY: `d6e1d93ab` (PCS heat narrative) + `92f8f66e1` (sub-total wrap fix)
- Chain attempt failed at brief-parse stage:
  - `OpenRouter API 402: requested up to 65536 tokens, can only afford 48591`
  - Account: `user_3CnZPY2moKiUBwYYxYMgp8qyvjv`
  - Top-up URL: https://openrouter.ai/settings/credits
- **All L49 + L50 fix work is staged in git** — chain will run cleanly once credits are added
- No further chain runs possible until topped up

### L49 — chain ran (exit 21) after credit top-up
- Gate 11 (cross-page consistency) now PASSES — the recurring L46/L47/L48 blocker is GONE
- BUT: (a) sub-total wrap fix hit the WRONG renderer (line 7214 chunked path; active path is line 5763 per-sub-module block at width 49); (b) gate 21 FAIL on Siemens HMI panel £380 vs Mouser £1,958.87 (pre-existing, newly cached)
- `ce0427dab` — fixed BOTH: active sub-total renderer (width 49→78 + fmtGBP_subtotal) + HMI panel list_price £1,958.87

### L50 — chain ran (exit 21), wrap FIXED, deeper bug found
- Wrap CONFIRMED fixed (0 `£-` lines in PDF)
- Gate 21 FAIL on Wago 221-2401 £3.80 vs £0.64 (next-worst after HMI)
- ROOT CAUSE found: cost-repair was overriding emitter list_price pins. HMI state.json: distributor_price_gbp=£1958.87 + source=emitter_list_price, BUT cost_repair_corrected_price_gbp=£420 (renderer reads the corrected value). Cost-repair LLM "corrected" the £1959 pin down to 4× the £105 Engine B curve.
- `d2fcb23fc` — UNIVERSAL FIX: cost-repair skips distributor_price_source==='emitter_list_price' words (left_as_is). All pins now immune. + Wago £0.70 pin.

### L51 — chain in flight
- All fixes through `d2fcb23fc` baked in
- Chain task `bf2c4osqq` running
- Expectation: gate 21 PASS (Wago fixed + cost-repair no longer clamps any pin: HMI back to £1959, cells/PCS/transformer all hold) → council; target ≥8.0

## Final session summary

**Trajectory across 6 BESS chains tonight (2026-05-27 → 2026-05-28):**

| Iter | Exit | PC mean | Council mean | Notes |
|---|---|---|---|---|
| L43 | 18 | 8.8 | 4.90 | Schaltbau under-bill + over-deliver under-target |
| L44 | 23 | — | — | arc_flash_barrier sub_module gap |
| L45 | 0 | 8.4 | 3.50 | Council exposed AC pricing + compliance + cost basis |
| L46 | 18 | 8.0 | 6.55 | First PASS on 6.5 gate |
| L47 | 18 | 9.0 | 5.55 | Macro mask removal exposed £0 prices on 4 highest-value words |
| L48 | 18 | 8.4 | **7.07** | All 7 council fixes landed; sub-total wrap is sole blocker |
| L49 | — | — | — | Wrap fix staged, credits blocked execution |

**Council projection for L49 once chain runs:** 7.6-7.8 (PASS ≥7.5 gate). Target ≥8.0 likely needs 1-2 more iterations after L49 closes (cell-count vs MWh narrative + mass margin polish + residual cheap-tail prices).

**Architectural wins this session:**
- Gate 29 (sub-module domain guard, exit 29) — universal dc/ac coherence enforcement
- Reviewer-merge ID-preservation guard — closes L33 X hole (word.id + character_id locked)
- ex-works basis unification — cover banner + £/kWh + compliance row all source `costStack.oem_transfer_price_gbp`
- Compliance table kind-aware PASS/FAIL — floor metrics PASS on over-delivery
- Gate 25 multi-file scan — extends beyond deterministic-emitter.ts
- selectContainerHvacFor — universal hardware selector for cabinet/container HVAC
- Macro override mfr/pn preservation — emitter-pinned modifiers always win
- fmtGBP_subtotal + widened column — prevents £-NEGATIVE-from-wrap on aggregate sub-totals

**Mempalace drawers saved overnight (5 new):**
- `meta_decisions_4b7b45c37c568652` — Physics Critic vs council divergence
- `forgeos_gotchas_9b797ffaf297746b` — Gate 23 emitter-completeness recurrence pattern
- `forgeos_gotchas_215696cd10514bba` — Gate 25 scan-list extension
- `forgeos_gotchas_c1c3c16ef4357206` — macro_assembly_prices shadows emitter modifiers
- `forgeos_gotchas_dbfc26d33ac8e30b` — industry bands are ex-works basis (not installed ASP)
- `forgeos_gotchas_7bd9c9f9b5b5411f` — mask removal surfaces underlying gaps
- `forgeos_gotchas_e8556496201c54b5` — reviewer-merge ID-preservation is HALF of modifier-preservation

**Commits landed: 13 total**
- L43: `3a0a18e5f`
- L44: `3d8d484db`
- L45: `2fc2317a2`, `2531e26a3`
- L46: `206639a98`
- L47: `2ded0f358` (main), `6d08ab455` (gate 29), `fc9fa2fd0` (reviewer-merge guard)
- L48: `dabcf7336`, `b50915f16`, `f7721c56e`
- L49: `d6e1d93ab` (HVAC narrative), `92f8f66e1` (wrap fix)

**Total council cost ~$2.50 across 4 dispatches (L43, L45, L46, L47, L48).**

### L51 / L52 — iceberg gates closing (post credit top-up)
- L51: gate 11 + 21 PASS; gate 19 caught UL 62275 (stochastic LLM citation) → `c2fee78bb` UL→EN/IEC dual-published map
- L52: gate 19 + 21 PASS; gate 11 caught LEM LV 25-P 500V vs 912.5V bus (under-rated part, LLM wrote "mismatch") → `09d7779a6` emitter now owns pack_voltage_sensor with LEM LV 25-1000 (1000V, covers bus)
- L52 BoM raw materials £787,374; PDF fully rendered → council dispatched (task ac34e515633137908) on L52 PDF for actual ≥8.0 score
- Commits since credit top-up: ce0427dab, d2fcb23fc, c2fee78bb, 09d7779a6
- Holding L53 launch until L52 council returns (bundle findings + LEM fix)

### ★ L54 — ≥8.0 TARGET ACHIEVED — council 8.49 (dual-PASS ≥8.0 + ≥7.5)
- Grok 8.34 / GLM 8.42 / DeepSeek 9.30 / GPT 7.90 — all complete, no truncation. Δ +1.50 vs L52.
- internal_coherence 5.80 → 9.50 (PCS conflict + banner contradiction both fixed)
- Banner contradiction (Tristan-spotted) FIXED + confirmed by council
- Fixes in L54: banner band 8b8a55018, PCS macro £75k 3bede036b, LEM LV 25-1000 09d7779a6
- Remaining lever: part_realism 6.88 (M5 PCS cheap-tail: TDK cap £0.35, Schaffner inductor, ABB arrester)
- Gate-11 2.5/2.69 FP fixed post-L54 at gate level (176731a3c role split) → L55 should be first clean exit-0
- Flag: rendered raw BoM £900,978 vs stated £793,026 (~£108k gap; internally reconciles, not score-affecting — investigate)

### Engineering tools (validated, committed, NOT yet wired)
- protection_coordination.py 241f633d6, arc_flash_ieee1584.py 7e25614ab, g99_dynamic_compliance.py 169120c5b
