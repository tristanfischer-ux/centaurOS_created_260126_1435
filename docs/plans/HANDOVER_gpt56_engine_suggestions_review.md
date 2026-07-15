# Handover — GPT-5.6 Review of Engine Accuracy/Speed Suggestions

**For:** GPT-5.6  
**From:** Cursor session 2026-07-09  
**Owner:** Tristan  
**Mode:** Review only — **do not code**, do not run the design chain

---

## Your job

Adversarially review the suggestion pack:

**[`docs/plans/2026-07-09-engine-accuracy-speed-suggestions.md`](./2026-07-09-engine-accuracy-speed-suggestions.md)**

Produce structured verdicts exactly as that doc specifies under **“How GPT-5.6 should review this.”**

Do **not** implement anything. Do **not** soften CORE FIX / GATE INTENT / SIGHT / universal-fix rules to make suggestions easier.

---

## Required output shape

1. Per-suggestion table rows: Verdict, Accuracy impact, Speed impact, Goodhart risk, Universal?, Dependency, Cheaper alternative, One-line rewrite (if needed).  
2. Top 5 this month — **accuracy-first**.  
3. Top 5 this month — **speed-first** (no accuracy regression).  
4. Three **dangerous if naive** suggestions.  
5. What the pack **missed**.  
6. Accept or reject the author’s three-item bet at the end of that doc.

---

## Grounding (read if unsure)

| Priority | Path |
|----------|------|
| Must | The suggestion pack itself |
| If challenging universality | `CLAUDE.md` (CORE FIX, gates, DB-consumer) |
| If challenging SIGHT / enforce | `OPERATING-FRAME-2026-06.md` |
| If suggesting autonomous loops | `docs/DECISION-defer-autonomous-hill-climbing-loop-2026-06-24.md` |
| Recent product context (optional) | `briefs-loop/HANDOVER_residential_powerwall.md`, `AGENT_HANDOVER.md` (Codema Exec alias = instance of A1) |

---

## Constraints Tristan cares about

- Accuracy = engineering truth in **delivered** Excel/drawings, not prettier `state.json`  
- Speed = fewer wasted cold chains and LLM $, not skipped gates  
- Universal noun/unit/provenance fixes only — no `if (codema)` / `if (powerwall)`  
- Shadow gates that never fire are decoration  
- Live distributor APIs stay out of the chain  

---

## Done when

Tristan has a clear keep/defer/reject list he can hand to Fable or Cursor for implementation sequencing — still without you writing code in this review pass.
