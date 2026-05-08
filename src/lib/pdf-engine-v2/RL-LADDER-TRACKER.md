# PDF Engine v2 — RL Ladder Tracker (post-strict-adoption)

**Methodology:** in-pipeline growing-window RL (see `forgeos_in_pipeline_growing_window_rl_methodology.md` in mempalace).
**Driver:** `~/.claude/scripts/rl-driver.sh` (bash, zero LLM cost — pipeline runs cost OpenRouter only)
**Cost monitor:** `~/.claude/scripts/cost-monitor.sh` (bash, returns hard-stop when £200 ceiling exceeded)
**Started:** TBD (after migration Phase H lands)

---

## RL ladder

In execution order. Each round runs 10 baseline briefs through stages 0..N (PA architecture), scores stage N's output via the production council (commit `52bc2e61` scorer), iterates the prompt for stage N until ≥8/10 across all 10 briefs.

| Round | Target stage | Stages run before it (live, every iteration) | Status | Best mean score | Iterations | Frozen at |
|---|---|---|---|---|---|---|
| 1 | PA Stage 1 — Brief Parsing | (founder text only) | ⬜ Pending | — | 0 | — |
| 2 | PA Stage 3 — Research Synthesis | Stage 1 | ⬜ Pending | — | 0 | — |
| 3 | PA Stage 4 — Regulatory Extraction | Stages 1+3 | ⬜ Pending | — | 0 | — |
| 4 | PA Stage 5 — Module Decomposition | Stages 1+3+4 | ⬜ Pending | — | 0 | — |
| 5 | PA Stage 6 — BOM Generation | Stages 1+3+4+5 | ⬜ Pending (gated on Phase E cut-over) | — | 0 | — |
| 6 | Post-pipeline Review (Risks) | All preceding (FULL_REPORT only) | ⬜ Pending | — | 0 | — |

**Status legend:** ⬜ Pending · 🔄 RL in progress · ✅ Frozen (≥8/10 across 10) · ⏸ Max iterations hit (logged, moved on with current best) · ⚠️ Stalled (no improvement N rounds) · ❌ Failed

---

## Promotion gate

Per Tristan's choice (option a, 2026-05-08 night):
- **≥8/10 mean across all 10 baseline briefs** on the production council scorer
- **AND best score has held for at least 2 consecutive iterations** (avoids a noise-driven false positive)
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

## Missing-only recap (for watchdog)

- ❌ All 6 rounds pending
- ❌ Driver not yet launched (waiting on migration Phase H to land)
- ❌ Baseline against PA pipeline not yet run
