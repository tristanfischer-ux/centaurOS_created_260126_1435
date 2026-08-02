# LLM advisory triad + physics ceiling (canonical)

**Date:** 2026-08-01 (revised afternoon — in-anger record)  
**Source:** Tristan CritPt brief + FE front MGU council return rates  
**Codified in:** `.cursor/rules/multi-model-challenge-council.mdc` · `scripts/lib/model_routing.py` · `scripts/lib/council_models.py` (facade)

---

## The ceiling

- **CritPt** (research physics): world-best ≈ **32%**. Best model gets ~⅔ of research-level physics **wrong**.
- **GPQA Diamond**: saturated ~92–94% — **noise for model pick**. Do not use it.

**No LLM validates magnetics / EM.** LLMs propose and review method. **xfemm, solvers, gates, proveCatch, twin SIGHT** validate.

Physics skill and honesty are **anti-correlated**: GPT-5.6 Sol leads CritPt and is near-worst at admitting ignorance (~18% non-hallucination).

## Standing triad (revised from session record)

| Role | Model | OpenRouter | Job |
|---|---|---|---|
| Standing diagnose | **Grok 4.5** | `x-ai/grok-4.5` | Default second opinion — 3/3 returned; named the defining excitation fault |
| Code review / propose | **GPT-5.6 Sol** | `openai/gpt-5.6-sol` | Diffs + hard escalation; **never unchecked** domain advice |
| Checker | **MiniMax-M3** | `minimax/minimax-m3` | “Is this claim supported by the artefacts?” — not physics |
| Backup voice | **DeepSeek V4 Flash 0731** | `deepseek/deepseek-v4-flash-0731` | Always-on cheap fourth lineage; **never** auditor |

Long-context honesty: **Qwen3.7 Max**.  
**Demoted:** GLM-5.2 (2/4 return) — optional corroborator only.  
**Dropped:** Kimi K3 (1/3 return, token-cap deaths).  
**Avoid:** gpt-5.5-pro as Sol substitute.

## Formal council (milestones)

**Grok + Sol + MiniMax** (MiniMax → Opus 5 fallback), optional DeepSeek Flash backup voice.

## Routing cheat-sheet

```
Load-bearing claim?     → MiniMax evidence check
Method / second opinion → Grok 4.5
Pre-commit / diff       → Sol code review + MiniMax audit (+ DeepSeek backup)
Stuck / DEC / EM fight  → Sol escalate + solver re-run (Sol never closes)
HoT reject pack         → full Grok+Sol+MiniMax council
```

## Wiring status

| Module | Role |
|---|---|
| `scripts/lib/model_routing.py` | Authority — seats, `seats_for()`, CritPt disclaimer, `--selftest` |
| `scripts/lib/council_models.py` | Facade — `COUNCIL_MODELS` / `ADVISORY_TRIAD`; must match routing |
| `scripts/lib/council_precommit_review.py` | Uses routing directly |
| `scripts/fe-front-*-council.py` | Import facade (no hardcoded GLM/Kimi map) |

## Related

- Model ID gotcha: `~/.claude/projects/-Users-tristanfischer/memory/model-ids-sol-is-gpt56-sol.md`
- FPK councils: `scripts/fe-front-redteam-council.py`, etc.
- Engine catalogue wiring: `docs/plans/FE-FRONT-FPK-ENGINE-CATALOGUE-WIRING-STATUS-2026-08-01.md`
