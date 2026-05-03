# Stage Judge Panels — Implementation Brief

> **Context:** This brief was prepared by a parallel Claude Code session after Tristan reviewed the full Artificial Analysis Intelligence Index (May 2026) benchmark data across Intelligence, Coding, Agentic, Speed, Price, and all 15 sub-evaluations. The goal: add multi-model judge panels to evaluate output quality after each pipeline stage, and route coding fixes to the right models.

## Why This Matters

The current pipeline has specialists *producing* work but no independent *judges* evaluating it. The benchmark data reveals a critical split: the smartest models (GPT-5.5, Gemini 3.1 Pro) hallucinate 86% of the time on factual questions, while the most honest models (MiMo 75%, Grok 75%, GLM 71%) are mid-pack on intelligence. **Judges must be honest first, smart second.** A brilliant judge that fabricates findings is worse than no judge at all.

### The Honest Trio (anchor every judge panel with at least one)
- **MiMo-V2.5-Pro** — 75% non-hallucination, 80% instruction following, 73% long-context retrieval, $1.50/M
- **Grok 4.3** — 75% non-hallucination, 81% instruction following (#1), 98% tool-use (#1), 203 tok/s (#1 speed), $1.60/M
- **GLM-5.1** — 71% non-hallucination, 98% tool-use (#1 tied), best schema/contract enforcement, $2.00/M

### The Smart Depth Seats (add for reasoning quality, always cross-checked by honest anchor)
- **Gemini 3.1 Pro** — Intelligence 57, SciCode 59% (#1), HLE 45% (#1), MMMU-Pro 82% (#1 multimodal), but only 14% non-hallucination. Brilliant but fabricates freely. Never trust alone.
- **Kimi K2.6** — Intelligence 54, MMMU-Pro 79%, SciCode 54%, 61% non-hallucination. Good multimodal. Moderate honesty.

### Critical Finding: DeepSeek V4 Pro Omniscience = -10
DeepSeek V4 Pro currently runs Finn (finance). Its AA-Omniscience Index is -10 (more incorrect than correct on factual questions). It remains a good *structured reasoner* for producing financial analysis, but its factual claims MUST be independently judged. This is the highest-priority addition.

---

## Role 1: Stage Judge Panels

**Formula: 1-2 honest anchors + 1 smart depth seat + different lineage from the specialist that produced the work.**

**Consensus rule: findings agreed by 2+ judges from different lineages = BLOCKER. Single-judge findings = WARNING.**

All judge calls should be fired in parallel with `max_tokens=16000`. Use `ask_alt_llm` via the second-opinion MCP server, or direct OpenRouter API calls.

### High-Risk Stages (3 judges each)

#### Chase Output (supply chain research)
- **Specialist producing:** Chase (Gemini 3.1 Pro)
- **Judge 1 — Honest anchor:** `xiaomi/mimo-v2.5-pro` — reads the full research output, checks for phantom sources, verifies claims don't contradict each other. Best long-context retrieval (73%).
- **Judge 2 — Honest adversary:** `x-ai/grok-4.3` — asks "what's missing? what's fabricated? what would a procurement engineer challenge?" Fastest responder (203 tok/s).
- **Judge 3 — Depth seat:** `google/gemini-3.1-pro-preview` — DIFFERENT INSTANCE from Chase. Evaluates scientific/technical depth. Cross-checked by Judges 1-2.
- **Cost per run:** ~$0.07

#### Max Output (module decomposition)
- **Specialist producing:** Max (DeepSeek V4-Flash)
- **Judge 1 — Honest adversary:** `x-ai/grok-4.3` — "what breaks? what's over-engineered? what modules are missing?"
- **Judge 2 — Schema enforcer:** `z-ai/glm-5.1` — validates structural integrity, checks module tree is complete and consistent, no orphan dependencies.
- **Judge 3 — Depth seat:** `google/gemini-3.1-pro-preview` — stress-tests the engineering logic, checks decomposition against the brief. HLE 45% = best at genuinely hard reasoning.
- **Cost per run:** ~$0.08

#### Bill of Materials
- **Specialist producing:** (generated from modules)
- **Judge 1 — Schema enforcer:** `z-ai/glm-5.1` — validates every part has required fields, no phantom components, schema compliance. 98% tool-use means it reads structured data precisely.
- **Judge 2 — Honest anchor:** `x-ai/grok-4.3` — catches hallucinated components, checks quantities are plausible, flags anything that doesn't match the module specs.
- **Judge 3 — Honest anchor:** `xiaomi/mimo-v2.5-pro` — cross-references BOM against the full module tree (long-context strength), catches parts listed for modules that don't exist.
- **Cost per run:** ~$0.07
- **Note:** ALL THREE from the honest trio. BOM is purely factual — you cannot afford a single hallucinated component.

#### Finn Output (finance / cost modelling)
- **Specialist producing:** Finn (DeepSeek V4-Pro) — **HIGHEST PRIORITY ADDITION.** V4-Pro Omniscience = -10.
- **Judge 1 — Honest adversary:** `x-ai/grok-4.3` — challenges cost assumptions, flags unrealistic margins, asks "would an investor believe this number?"
- **Judge 2 — Honest anchor:** `xiaomi/mimo-v2.5-pro` — reads the full financial model honestly, checks internal consistency (do the parts costs sum to the total? do margins match the market?)
- **Judge 3 — Depth seat:** `google/gemini-3.1-pro-preview` — Omniscience Index 33 (#1), best factual accuracy when it engages. Evaluates whether the financial model is coherent. Cross-checked by Judges 1-2.
- **Cost per run:** ~$0.10

#### Fang Reviews (manufacturing / design for manufacturing)
- **Specialist producing:** Fang (Qwen 3 235B-A22B)
- **Judge 1 — Depth seat:** `google/gemini-3.1-pro-preview` — best engineering reasoning (HLE 45%), evaluates DFM feasibility.
- **Judge 2 — Honest adversary:** `x-ai/grok-4.3` — adversarial feasibility check: "can this actually be manufactured? what tolerances are unrealistic?"
- **Judge 3 — Multimodal specialist:** `moonshotai/kimi-k2.6` — MMMU-Pro 79%, strong multimodal. Can review visual DFM diagrams if available. 61% non-hallucination (moderate).
- **Cost per run:** ~$0.10
- **Lineage diversity:** Google + xAI + Moonshot (all different from Qwen/Alibaba)

### Medium-Risk Stages (2 judges each)

#### Supplier Matching
- **Judge 1:** `x-ai/grok-4.3` — fastest (203 tok/s), honest (75%), checks URL validity and category fit against BOM. Won't phantom-invent suppliers.
- **Judge 2:** `xiaomi/mimo-v2.5-pro` — cross-references supplier categories against the actual BOM rows (long-context strength). Catches category mismatches (e.g. Finance rows appearing in manufacturing BOM — the existing `.in("category", ["Products","Services"])` bug).
- **Cost per run:** ~$0.05

#### Proofreading
- **Judge 1:** `xiaomi/mimo-v2.5-pro` — best long-context retrieval (73%), reads the entire document honestly. Catches contradictions between sections, missing cross-references, broken numbering.
- **Judge 2:** `x-ai/grok-4.3` — 81% instruction following (#1). Checks the document against the original brief spec. Catches where the proofreader missed deviations from requirements.
- **Cost per run:** ~$0.05

### Low-Risk Stages

#### Sizing / Layout
- **No LLM judge.** Deterministic hard-gate validators only. Per Tristan's rule: LLM judges score these randomly, causing infinite retry-reset loops.

#### PDF (visual check)
- **Judge 1:** `google/gemini-3.1-pro-preview` — MMMU-Pro 82% (#1 multimodal). Reviews the rendered PDF for layout bugs, black-rect SVG, table cut-offs, page-break artefacts.
- **Cost per run:** ~$0.04

#### Illustration
- **No judge** or optional quick Gemini vision check. Cosmetic, low cascade risk.

---

## Role 3: Coding Model Routing

When judges identify issues, the fixes need to be implemented. Different fix types need different models — optimised for coding ability vs instruction following vs cost.

### Routing Table

| Fix Complexity | Model | OpenRouter ID | Coding Index | IFBench | Cost/M | When to Use |
|---|---|---|---|---|---|---|
| **Complex multi-file refactor** | Gemini 3.1 Pro | `google/gemini-3.1-pro-preview` | 56 | 77% | $4.50 | Cross-file type changes, architectural fixes, schema changes. Best value: strong coder + strong reasoner + fast (122 tok/s). |
| **Standard single-file fix** | Sonnet 4.6 (via Claude Code) | `anthropic/claude-sonnet-4.6` | 51 | 57% | $6.50 | The existing Claude Code flow. Use when the agent already has context and tool access. |
| **Spec-precise targeted edit** | Grok 4.3 | `x-ai/grok-4.3` | 41 | **81%** | $1.60 | Coding score is weak but IFBench is #1. Best for "change exactly this line to exactly this value, nothing else." Follows instructions to the letter. |
| **Bulk / mechanical** | DeepSeek V4-Flash | `deepseek/deepseek-v4-flash` | 39 | — | $0.07 | Template changes, config updates, repetitive edits across many files. Cheapest option. |
| **High-stakes (auth/schema/migration)** | GPT-5.5 | `openai/gpt-5.5` | **59** | 75% | $11.30 | Best coder by far. Use for security-critical or irreversible changes. **ALWAYS cross-check output with an honest model (Grok or MiMo) before merging** — GPT-5.5 non-hallucination is only 14%. |

### Implementation Notes

- Judge findings should include a `suggested_fix` field with file path, line range, and proposed change.
- The coding model receives the judge finding + the relevant file context, implements the fix, and returns the diff.
- For fixes flagged by 3/3 judges (unanimous), auto-apply with the appropriate coding model.
- For fixes flagged by 2/3 judges, apply but flag for human review in the next loop critique.
- For fixes flagged by 1/3 judges only (warnings), log but don't auto-apply.

---

## Total Cost Per Full Pipeline Run (5 projects)

- 5 high-risk stages x 3 judges x 5 projects = 75 calls
- 2 medium-risk x 2 judges x 5 projects = 20 calls  
- 1 low-risk x 1 judge x 5 projects = 5 calls
- **~100 judge calls total = $3-5 per full pipeline run**

This is less than a single Opus debug loop on the main thread.

---

## Benchmark Source

All data from the Artificial Analysis Intelligence Index v4.0 (May 2026), incorporating 10 evaluations: GDPval-AA, τ²-Bench Telecom, Terminal-Bench Hard, SciCode, AA-LCR, AA-Omniscience, IFBench, Humanity's Last Exam, GPQA Diamond, CritPt. Filtered to 15 Frontier Reasoning Models.

Charts reviewed directly by Tristan on 2026-05-01.
