# PDF Engine v2 — RL Ladder Tracker (post-strict-adoption)

**Methodology:** in-pipeline growing-window RL (see `forgeos_in_pipeline_growing_window_rl_methodology.md` in mempalace).
**Driver:** `~/.claude/scripts/rl-driver.sh` (bash, zero LLM cost — pipeline runs cost OpenRouter only)
**Cost monitor:** `~/.claude/scripts/cost-monitor.sh` (bash, returns hard-stop when £200 ceiling exceeded)
**Started:** TBD (after migration Phase H lands)

---

## RL ladder

In execution order. Each round iterates the prompt for stage N until ≥8/10 across all 10 briefs, using curriculum learning (see below).

| Round | Target stage | Stages run before it (live, every iteration) | Phase | Status | Best mean score | Iterations | Frozen at |
|---|---|---|---|---|---|---|---|
| 1 | PA Stage 1 — Brief Parsing | (founder text only) | Phase 1: 0/8 iterations | ⬜ Pending (iter 1 REVERT — scorer mis-calibration fixed) | 2 | 1 | — |
| 2 | PA Stage 3 — Research Synthesis | Stage 1 | Phase 1: 0/8 iterations | ⬜ Pending | — | 0 | — |
| 3 | PA Stage 4 — Regulatory Extraction | Stages 1+3 | Phase 1: 0/8 iterations | ⬜ Pending | — | 0 | — |
| 4 | PA Stage 5 — Module Decomposition | Stages 1+3+4 | Phase 1: 0/8 iterations | ⬜ Pending | — | 0 | — |
| 5 | PA Stage 6 — BOM Generation | Stages 1+3+4+5 | Phase 1: 0/8 iterations | ⬜ Pending (gated on Phase E cut-over) | — | 0 | — |
| 6 | Post-pipeline Review (Risks) | All preceding (FULL_REPORT only) | Phase 1: 0/8 iterations | ⬜ Pending | — | 0 | — |

**Status legend:** ⬜ Pending · 🔄 RL in progress · ✅ Frozen (≥8/10 across 10) · ⏸ Max iterations hit (logged, moved on with current best) · ⚠️ Stalled (no improvement N rounds) · ❌ Failed

---

## Curriculum learning mechanic

Per Tristan's directive (2026-05-09):

**Phase 1 — fast loop on 3 diverse briefs:**
- Default briefs: `cgm`, `drone`, `bess` (biomedical / aerospace / energy storage — three different product class lineages, all known to produce full PDFs)
- Configurable via `RL_PHASE1_BRIEFS` env var (comma-separated slugs)
- Each iteration runs only these 3 briefs (~25 min wall vs ~70 min for 10-brief validation)
- Condition to advance: mean score across these 3 ≥8.0 AND held for 2 consecutive iterations

**Phase 2 — full validation (all 10 briefs):**
- Briefs: `cgm drone edge-ai heatpump ev-charger bioreactor farm auv bess haps`
- Single validation iteration
- If mean ≥8.0 across all 10 → PROMOTE round (✅ frozen), move to next round
- If mean <8.0 across all 10 → identify failing brief(s), ADD them to Phase 1 set, return to Phase 1 with expanded set

**Brief slug → filename mapping (for `--briefs` CLI arg):**
| Slug | File |
|---|---|
| cgm | 01-cgm-wearable.md |
| drone | 02-drone-prosumer.md |
| edge-ai | 03-edge-ai-server.md |
| heatpump | 04-heatpump-30kw.md |
| ev-charger | 05-dc-fast-ev-charger.md |
| bioreactor | 06-pharma-bioreactor.md |
| farm | 07-vertical-farm.md |
| auv | 08-auv-coastal.md |
| bess | 09-bess-container.md |
| haps | 10-haps-stratospheric.md |

## Promotion gate

Per Tristan's choice (option a, 2026-05-08 night) — now curriculum-gated:
- **Phase 1:** ≥8/10 mean across 3 fast-loop briefs for 2 consecutive iterations → advance to Phase 2
- **Phase 2:** ≥8/10 mean across all 10 baseline briefs on the production council scorer → PROMOTE
- THEN: stage promoted to ✅ Frozen, prompt committed, RL moves to next round

## Max-iterations escape hatch

- **8 iterations per stage maximum.** If after 8 iterations the stage hasn't hit ≥8/10, log the best-so-far prompt as "current best" (committed), mark ⏸, move to next round.
- Stalled detection: if 3 consecutive iterations show ≤0.2 score improvement, log ⚠️ and skip to next round.

## Cost ceiling

- Hard stop: £200 (set by Tristan 2026-05-08 night)
- Warn at: £150 — driver continues but logs warning per iteration
- Tracker: `~/.forge-rl/cost-tracker.json`
- Monitor: `~/.claude/scripts/cost-monitor.sh` returns exit 2 on hard stop → driver kills itself + writes handover

## Council usage

Per Tristan's directive ("make use of the council extensively"):
- Each iteration that produces a non-trivial prompt diff (>20 lines changed) → fire 6-LLM council on the diff before committing
- Council BLOCKERs (≥2 seats) → revert iteration, log, retry with adjusted prompt
- Council cost: ~£0.06/round, tracked in `cost-tracker.json` `council_rounds`

---

## Per-iteration log

Each iteration appends to this section. Format:

```
## Round N · Iteration K · 2026-05-NN HH:MM:SS
- Stage: <name>
- Prompt diff size: <lines>
- Council fired: yes/no
- Council BLOCKERs: <count>
- Mean score (10 briefs): <X.X>/10
- Per-brief: cgm=<X> drone=<X> edge_ai=<X> heatpump=<X> ev_charger=<X> bioreactor=<X> farm=<X> auv=<X> bess=<X> haps=<X>
- Decision: PROMOTE / ITERATE / GIVE-UP / REVERT
- Commit: <SHA> (if PROMOTE or ITERATE)
- Cost ticked: pipeline_runs += 10
```

---

## Baseline against PA pipeline (post-migration)

**Run:** `pa-baseline-4a18538f` (after PA Stage 3 newline parser fix)
**Wall time:** ~4h with 4-way parallel
**Result:** mixed — 4 full pipelines, 4 short-form (router decision), 2 truncated mid-Stage-1

| Brief | Status | PDF | Notes |
|---|---|---|---|
| r1-cgm | ✅ full | 101 KB | 21 min, all gates passed |
| r1-drone | ✅ full | 127 KB | 33 min |
| r1-auv | ✅ full | 116 KB | 28 min |
| r1-bess | ✅ full | 111 KB | 33 min |
| r1-edge-ai | ⚠️ short | 31 KB | router → BRIEF_INCOMPLETE (PA Stage 1 LOW confidence) |
| r1-ev-charger | ⚠️ short | 31 KB | router → BRIEF_INCOMPLETE |
| r1-haps | ⚠️ short | 33 KB | router → BRIEF_INCOMPLETE |
| r1-heatpump | ⚠️ short | 30 KB | router → BRIEF_INCOMPLETE |
| r1-bioreactor | ❌ truncated | — | PA Stage 1 hit max_tokens mid-string ("Unterminated string at position 580") |
| r1-farm | ❌ truncated (likely) | — | same root cause |

**Action:** PA Stage 1 max_tokens bump in flight (sonnet `ad513a69a2e35816e`). After landing, re-run bioreactor + farm.

**For RL Round 1:** the 4 short-form briefs ARE the test cases — Round 1 (PA Stage 1 prompt RL) targets lifting those LOW-confidence verdicts to HIGH so the router doesn't shorten them.

---

## Missing-only recap (for watchdog)

- 🔄 PA Stage 1 max_tokens fix in flight (sonnet `ad513a69a2e35816e`)
- ⬜ Re-run r1-bioreactor + r1-farm after fix lands (mechanical retry)
- ⬜ Round 1: PA Stage 1 Brief Parsing — start when fix verified
- ⬜ Rounds 2-6 pending (per ladder above)
- ⬜ Driver not yet launched

## Round 1 · Iteration 1 · 2026-05-09 05:10:22
- Stage: brief_parsing
- Prompt diff size: 29 lines
- Council fired: true
- Council BLOCKERs: 6
- Mean score (10 briefs): 2/10
- Per-brief: cgm-wearable=2 drone-prosumer=2 edge-ai-server=2 heatpump-30kw=2 dc-fast-ev-charger=3 pharma-bioreactor=2 vertical-farm=1 auv-coastal=2 bess-container=2 haps-stratospheric=2
- Decision: REVERT
- Commit: 1df636a5
- Cost ticked: pipeline_runs += 10
