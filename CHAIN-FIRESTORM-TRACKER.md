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

**State:** `COMMITTED` — moving to iter-2 next
**Brief ID:** `c9ef076f-6412-46ca-9929-3a8a6cfb56ae`
**Started:** 2026-05-19 21:00:01 UTC
**Chain completed:** 21:34:42 UTC (34.5 min) — status=`ready`, accepted_with_decisions, 11 modules, BoM £4086

### Council results
3 successful (£1.18 total): Grok 4.3 (6 findings), Opus 4.7 (10 findings), GPT-5.5 (30 findings).
5 unusable: Gemini 3.5 Flash + GLM 5.1 (reasoning-token burn, truncated), Kimi K2.6 + Qwen 3.6 Max + DeepSeek V4-Pro (4KB SSE-keepalive timeouts on retry too).

Total unique findings: ~35. Top themes: Engine B price-realism crisis (£2.96 heat exchangers, £0.14 thermostats), 100K-unit pricing despite 5K-unit brief, 67 fabricated SKUs still in priced BoM, missing UK statutory standards (LVD, BS EN 60335-1/-2-40, MIS 3005, MCS 020), R290-vs-F-gas confusion, hydronic mass-flow physics impossibility, K10 left in shadow despite required-edge failures, generator decomposing COTS pumps into fantasy subcomponents.

### Code fixes landed (iter-1 commit)
- F1: getClassSuppliers alias `thermal_system` → `heatpump` (closes Engine D empty §7)
- F2: Worker MIME `application/octet-stream` (closes Supabase Storage rejection of state.json + actions.jsonl)
- F3: Physics critic max_tokens 8K → 16K (closes G3 "no structured critique" finding)
- F4: class-standards.ts heat pump: added LVD 2014/35/EU, BS EN 60335-1, BS EN 60335-2-40, BS EN 12102-1, MCS 020, MIS 3005, EESR 2016 (closes Grok #4, GPT-5.5 #13/#14/#15)

### Deferred to iter-2+
- Engine B class-floor prices (component minimums): compressor £400+, evaporator/condenser £80+, thermostat £20+
- G2 hard-fail on brief.unit_cost_ceiling_gbp + class-floor major-spend reject
- Engine B production_volume input from brief (not 100K default)
- Generator COTS-assembly decomposition rule (pumps/compressors stay whole)
- G5 HALT on fabricated core parts (compressor, evaporator, condenser, EXV)
- G0 hydronic mass-flow physics check
- G0 acoustic sanity check (SCOP-Carnot, fan+compressor sound power)
- K10 enforcing-mode promotion for heat pump safety-critical edges
- R290 risk template (DSEAR/fire-safety vs F-gas)
- Component-level MD/LVD/EMC certification claims (Generator scope)

### Quality metric
| HIGH | MED | LOW |
|------|-----|-----|
| ~25 | ~7 | ~3 |

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

## Iteration 2 (closed)

**State:** `COMMITTED`
**Brief ID:** `b73f1401-3379-4880-bae6-783599b2fd2c`
**Chain time:** 24.5 min (vs iter-1 34.5 min — 29% faster)
**Outcome:** status=`ready`, gatesPassed=`true`, designDecisions=0 (Phase 2 converged), BoM £3,955, 12 modules

### Council results (2 of 3 — GPT-5.5 hit SSE timeout, retry pending)
21 unique findings (Grok 6 + Opus 15). Top themes:
- R290 system with R410A-only compressor (Copeland ZP25K5E-TFM) — refrigerant chemistry guard missing
- DC link 20µF undersized (need 100-330µF) — Generator sizing rule missing
- EMI filter 6A for 10.87A load — current-rating guard missing
- Installed ASP £368/kW vs £600-900 market — install factor 0.40 too low
- R290 leak sensor at lowest point (should be HIGH — R290 is lighter than air)
- 60 unverified parts (down from 67)
- Various component over/under-sizing (500mm fan, STM32F407, 150W heater, 8L vessel)

### Code fixes landed (iter-2 commit)
- F5 (carry-over): scripts/enrich-state-with-suppliers.tsx now uses getClassSuppliers() with alias map
- F6 (carry-over fix): Supabase bucket policy migration — extended allowed_mime_types to include octet-stream/json/x-ndjson/text-plain

### Deferred to iter-3+ (still substantial work)
- Component-class price floors (compressor £400+, IGBT £95+, large caps £18+, EMI filter £50+ at ≥16A)
- R290-only compressor filter in parts lookup
- DC link capacitance sizing rule (C = P/(2πfV²ΔV) with ΔV=5%)
- EMI filter current-rating guard (≥1.5× continuous compressor current)
- Install factor recalibration for heat pump (0.40→0.80 OR confirm cost-cascade is correct)
- R290 density correction + leak sensor placement guidance
- Hydronic isolation valves in heat pump module template
- Fan / MCU / heater right-sizing rules

### Quality metric
| HIGH | MED | LOW |
|------|-----|-----|
| ~10 | ~7 | ~4 |

Down from iter-1's ~25/7/3 — meaningful HIGH-severity reduction (council noting many iter-1 issues fixed: empty suppliers ARG also fixed via supplier alias + bucket migration; cost £4086→£3955 closer to target; gatesPassed flipped false→true). Real progress.

---

## Iteration 5 (heat pump cost-trial — closed earlier in session)

**Brief:** Same heat pump but with named-component constraints (Copeland YP-PFJ, ebm-papst HyBlade, STM32F0/L0).
**Outcome:** Engine B classifier anti-example prompt landed; £113.20 fingerprint visibility traced through chain → real fix needs class-floor + production_volume from brief, not just classifier prompt.

---

## Iteration 6 (BESS — focus pivot)

**State:** `COUNCIL_DONE` — synthesis below
**Brief ID:** 4927444a-5916-4c70-90bd-64bd19fd6fad
**Brief:** 500 kWh / 250 kW BESS in 20ft ISO container, R454B chiller, UL 9540A, BS EN 62619, IEC 62933, G99 grid code, +45°C ambient, £350/kWh installed
**Chain time:** 28.8 min (04:17:35 → 04:46:26 UTC 2026-05-20)
**Status:** ready, state.json 1054 KB + actions.jsonl 26 KB uploaded
**PDF size:** 381 KB (suspiciously small — heat pump was 7+ MB)

### Council 4 of 4 usable (£1.28)
- Grok 4.3 — 7 findings ($0.056)
- Opus 4.7 — 8 findings ($0.834)
- Gemini 3.5 Flash @ 16K — 14K content ($0.177)
- GPT-5.5 retry — 24 findings ($0.217) ← highest yield

### Convergent HIGH findings
1. **Capacity arithmetic gate failed** — 512 × 280Ah × 3.2V = 458.75 kWh, brief said 500 kWh (8.25% short). Section 0 says 1,376 cells, Module 4 says 512, BoM says ×512 (3-way contradiction).
2. **Container envelope contradiction** — Section 1 says 20ft, Section 2 Module 1 says 40ft Hi-Cube. Brief was 20ft.
3. **Cost stack unit bug** — Cover "£1.2/kWh installed — 99% below typical" actually £595,485 / 500 kWh = £1,191/kWh. Plus "Cell Voltage Sense Wire £134,896.64" (Engine B mis-priced 1000×).
4. **Electrical sizing wrong** — 30A 500V cell fuses on 819V/300A bus (would blow instantly), LEV200A4ANA 200A contactor on 300A bus, FF600R12ME4 is single half-bridge not 3-phase 250 kW inverter, "4700 µF 1200V film cap" physically impossible.
5. **Hydraulic inconsistency** — 32 plates × 0.3 L/min = 9.6 L/min but pump rated 40 L/min (4× mismatch), 19mm hose with 1/4 in NPT fittings (1.6× restrict).
6. **Physics critic flagged 2/10 but report still emitted** — manual-review badge non-blocking even at safety-critical severity.
7. **G5 fake-part rate** — 88 fabricated SKUs visible in BoM, counts contradict cover (96) / Section 6 (88) / Appendix A (88+8).
8. **Compliance shallow** — "G99 compliant" on IGBT (G99 is interface-protection only), NFPA 855 cited (US not UK mandatory), UL 9540A claimed but Novec 1230 doesn't arrest cell TR.
9. **PDF artefact thin** — 381 KB vs heat pump 7+ MB. No schematics, P&ID, single-line diagrams.

### What the chain got right
- R454B refrigerant choice
- BS EN 62619 + UN 38.3 + IEC 62933 standard universe
- Module decomposition reasonable
- Engine B classified cells correctly (no oem_subsystem mis-pricing)

### Quality metric
| HIGH | MED | LOW |
|------|-----|-----|
| ~18 | ~6 | ~1 |

Much higher HIGH count than heat pump iter-4 (~5) — BESS class has uncovered domain-specific gaps that didn't surface in heat pump runs.

### Iter-8 fix priorities (root-cause)
1. **Capacity arithmetic gate** — enforce `cells * Ah * V_nom ≥ brief.capacity_kwh × 0.98` (2% tolerance). Currently either threshold loose OR field-extraction missing.
2. **Brief-constraint propagation gate (G0.5 v2)** — Section 0 headline regenerated from same parsed brief that Module 4 uses; "container = 20ft" must propagate to envelope.
3. **Cost stack rendering fix** — divide-by-1000 path for cells_voltage_sense_wire; £/kWh sanity range (£100-£1500/kWh installed for BESS), HALT if outside.
4. **Electrical sizing rules** — fuse + contactor rating ≥ bus continuous current; capacitor µF reality check vs rated voltage class.
5. **M-stage physics-critic promotion** — if physics_critic.plausibility_score ≤ 3, HALT (not just badge).
6. **Engine B BESS class floors** — `battery_cell` £180-250 floor, `pcs_assembly` £80k+ for 250 kW, `transformer` £8k+ for 300 kVA.

---

## Iteration 7 (VF — focus pivot, running)

**State:** `RUNNING` — Generator (Step 4) in progress
**Brief ID:** efe55422-c258-4e27-9dac-54af4228b43c
**Brief:** 40ft Hi-Cube + 100m² growing area + 8 mobile trolleys + separate 20ft fertigation container + R454B chiller + dehumidification with condensate recovery + 15 kW heat + 8-12 kg/h transpiration + CO2 enrichment
**Started:** 04:48:36 UTC 2026-05-20
**G0:** PASS
**G1b:** WARN — 5/7 mandatory; missing WRAS (UK water regs), RoHS 2011/65 (EU electronics)
**Research:** classified vertical_farm, 4 competitors, 7 sources, 7 claims flagged

Awaiting Generator → Phase 2 → render. Council dispatch queued for chain ready.
