# Chain Engine Firestorm — Autonomous 4-Iteration Hardening Tracker

**Started:** 2026-05-19 21:00 UTC
**Mandate:** Tristan — "Get all of the LLMs we typically use to review each PDF that is produced in fine detail by reading each page and find errors and suggest permanent universal fixes. The task is to find errors and inconsistencies in the PDF and then review the code to see why the errors are there and then make/fortify the engine. Do this iteration 4 times."

**Test brief (constant across iterations):** UK residential 8 kW air-source heat pump, R290, SCOP 3.5, MCS-certified, £1,800 OEM, 5,000 units/year. Same brief used every iteration so we measure GENUINE improvement vs prior PDF.

**Convergence target:** zero HIGH-severity council findings, ≤5 MED findings.

---

## State machine

Each iteration is a 4-step state machine:

```
QUEUED  →  RUNNING  →  COUNCIL  →  SYNTH  →  FIXING  →  COMMITTED  →  NEXT_ITER
```

| State | Action | Trigger to next |
|---|---|---|
| `QUEUED` | INSERT pdf_engine_runs row | Worker claims (status='running') |
| `RUNNING` | Chain produces state.json + chain-v2.pdf | Worker stamps status='ready' or 'failed' |
| `COUNCIL` | pdftotext PDF → dispatch full council via OpenRouter | All council responses land |
| `SYNTH` | Aggregate findings, deduplicate, severity-rank, trace each to chain code | Findings list ready |
| `FIXING` | Apply code fixes for root causes (not surface patches), tsc check, commit | Push lands on origin/main |
| `COMMITTED` | Worker restart (picks up new chain code) | Restart confirmed |
| `NEXT_ITER` | Increment iteration counter, loop back to `QUEUED` (unless iteration > 4) | Iteration ≥ 5 → write final summary |

---

## Council roster (per iteration)

8 LLMs in parallel — different lineages for diverse failure-mode detection. Per `meta/gotchas/c7a7479ceed0ba73`, reasoning models need higher max_tokens.

| Model | OpenRouter ID | max_tokens | Cost expected | Notes |
|---|---|---|---|---|
| GPT-5.5 | `openai/gpt-5.5` | 12000 | ~$0.40 | Most thorough — 20+ findings typical |
| Opus 4.7 | `anthropic/claude-opus-4` | 8000 | ~$0.30 | Tristan's "Opus 4.7" — verify ID via probe |
| Gemini 3.5 Flash | `google/gemini-3.5-flash` | 10000 | ~$0.10 | Reasoning-first, needs ≥6K — sweet spot for short structured prompts |
| GLM 5.1 | `z-ai/glm-5.1` | 6000 | ~$0.07 | Highest yield at 6K; goes empty above 8K |
| Kimi K2.6 | `moonshotai/kimi-k2.6` | 16000 | ~$0.08 | Reasoning model — needs 16K minimum |
| Grok 4.3 | `x-ai/grok-4.3` | 8000 | ~$0.05 | Honest adversary; ALWAYS content-first |
| Qwen 3.6 Max | `qwen/qwen3.6-max-preview` | 8000 | ~$0.06 | 1M context, decent |
| DeepSeek V4-Pro | `deepseek/deepseek-v4-pro` | 12000 | ~$0.05 | Structured reasoner; check reasoning_tokens |

Expected council cost per iteration: ~$1.10. Plus chain compute ~$2. Total per iteration ~$3.10. 4 iterations: ~$12.40 + audit overhead.

MiMo (`xiaomi/mimo-v2.5-pro`): SKIP — saved drawer `meta/gotchas/2273c16c80d24d31` documents it as unusable for content tasks (100% reasoning, empty content).

---

## Iteration 1

**State:** `RUNNING`
**Brief ID:** `c9ef076f-6412-46ca-9929-3a8a6cfb56ae`
**Started:** 2026-05-19 21:00:01 UTC
**Worker PID:** 25879 (chain code at HEAD `048a04428` — includes G0.5 + v5.2 Gemini 3.5 Flash swap)

### Pre-iter code state
- HEAD `048a04428` (firestorm G0.5 commit)
- Active gates: G0 physics ledger, G1b compliance, G0.5 brief-target-reconciliation (new), Phase 2 28 universal gates, G2 cost-reality, G3 review-completeness, G4 grammar, G5 parts
- v5.2 Gemini 3.5 Flash on: physics critic, plausibility critic
- Engine D suppliers wired
- 41 dead files archived
- knip clean

### Awaiting
- Chain completion (~22:00-22:30 UTC estimated based on prior heatpump run timings)
- Then trigger COUNCIL state

### History (filled as iteration progresses)
- (pending)

---

## Iteration 2

**State:** `PENDING`
(Triggered when iter 1 reaches `NEXT_ITER`)

---

## Iteration 3

**State:** `PENDING`

---

## Iteration 4

**State:** `PENDING`

---

## Quality metric tracking

To measure improvement across iterations:

| Iter | HIGH findings | MED findings | LOW findings | Distinct root causes | Code fixes landed | Chain wall-clock |
|---|---|---|---|---|---|---|
| 0 (baseline 92cdda58 — pre-firestorm, pre-v5) | 8 | 4 | 0 | TBD | n/a | 93 min |
| 1 | — | — | — | — | — | — |
| 2 | — | — | — | — | — | — |
| 3 | — | — | — | — | — | — |
| 4 | — | — | — | — | — | — |

---

## Operating rules (autonomous)

1. **Resume rule**: at every turn-start, `cat CHAIN-FIRESTORM-TRACKER.md` + check current iteration state. Don't restart finished steps.
2. **Chain-hang recovery**: if a chain is `running` for >120 min OR chain process shows <10 sec CPU over 30+ min wall-clock, SIGTERM the chain process tree. Worker marks failed; re-queue the brief into a NEW row, increment retry counter on the iteration history.
3. **Council failure recovery**: if a council model returns empty (reasoning-token burn) OR streaming-truncated (4KB whitespace), retry ONCE with adjusted max_tokens. If still failing, drop from the iteration's panel (note in history). Don't block on a single model.
4. **Cost ceiling per iteration**: £4. Hard stop if council + chain cost exceeds this — emit warning + check tracker before continuing.
5. **HALT verdict**: if G0.5 HALTs the chain (scale mismatch), the iteration is BLOCKED at that point. Don't loop the same brief expecting a different result. Either fix the Generator's brief comprehension OR file the iteration as "blocked, need Generator improvement" + move to next.
6. **Code fix scope**: prefer ROOT CAUSE fixes (chain code change) over RENDERER patches. If a council finding is rendering-only (e.g. broken table layout), fix the renderer. If it's content-level (e.g. wrong-scale design), fix the chain.
7. **Commit per iteration**: every iteration produces exactly ONE commit. Use message format `feat(chain firestorm iter-N): <one-line summary> + N findings closed`.
8. **Mermaid update**: only on iter 4 — final mermaid reflects fully hardened chain.

---

## Reference

- Baseline morning PDF: `~/.pdf-engine-worker/runs/92cdda58-28df-4244-9f1c-f0d3d2c14686/chain-v2.pdf`
- Council finding catalogue (baseline): `CHAIN-ENGINE-AUDIT-2026-05-19.md`, `CHAIN-ENGINE-AUDIT-V5-{GROK,GPT55}.json`
- Latest mermaid: `CHAIN-ENGINE-DIAGRAM-V5-FINAL.html`
- Chain code: `scripts/serial-design-chain-v2.tsx` + `src/lib/pdf-engine-v2/stages/*`
- Worker code: `scripts/pdf-engine-worker.mjs`
