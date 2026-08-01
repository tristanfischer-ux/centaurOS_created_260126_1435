# LLM advisory triad + physics ceiling (canonical)

**Date:** 2026-08-01  
**Source:** Tristan — CritPt / non-hallucination / cost analysis for Anvil · PHANTM · FE Front FPK  
**Codified in:** `.cursor/rules/multi-model-challenge-council.mdc` · `scripts/lib/council_models.py`

---

## The ceiling

- **CritPt** (research physics): world-best ≈ **32%**. Best model gets ~⅔ of research-level physics **wrong**.
- **GPQA Diamond**: saturated ~92–94% — **noise for model pick**. Do not use it.

**No LLM validates magnetics / EM.** LLMs propose and review method. **xfemm, solvers, gates, proveCatch, twin SIGHT** validate.

Physics skill and honesty are **anti-correlated**: GPT-5.6 Sol leads CritPt and is near-worst at admitting ignorance (~18% non-hallucination). That is the “confident sophisticated wrong” failure mode.

## Standing triad

| Role | Model | OpenRouter | Job |
|---|---|---|---|
| Default second opinion | **GLM-5.2** | `z-ai/glm-5.2` | First call — usable physics + high honesty, cheap |
| Hard physics escalation | **GPT-5.6 Sol** | `openai/gpt-5.6-sol` | Only when GLM out of depth; **never unchecked** |
| Checker | **MiniMax-M3** | see `council_models.py` `CHECKER_MODEL` | “Is this claim supported by the artefacts?” — not physics |

Long-context honesty: **Qwen3.7 Max** when MiniMax context is too short.  
Avoid **gpt-5.5-pro** as Sol substitute (≈6× cost, worse CritPt).  
**DeepSeek V4 Pro**: cheap voice only — weak physics *and* weak honesty; not the standing second opinion (prefer GLM).

## Formal council (milestones)

Still: **GLM + Sol + Kimi** (Kimi → Opus 5 fallback), then optional MiniMax audit of the merged punchlist.

## Routing cheat-sheet for Claude / Cursor

```
Load-bearing claim?     → MiniMax evidence check
Method / second opinion → GLM-5.2
Stuck / DEC freeze / EM disagreement → Sol escalate + solver re-run (Sol never closes)
HoT reject pack         → full GLM+Sol+Kimi council
```

## Related

- Model ID gotcha: `~/.claude/projects/-Users-tristanfischer/memory/model-ids-sol-is-gpt56-sol.md`
- FPK councils: `scripts/fe-front-redteam-council.py`, `scripts/lib/council_models.py`
