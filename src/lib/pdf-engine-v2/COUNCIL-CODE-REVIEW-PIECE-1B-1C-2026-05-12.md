# Council Code Review — Piece 1B + 1C (2026-05-12)

**Diff covers:** Three related changes committed together:
1. Piece 1B council aggregator fix (transport_failed field + quorum logic + 4096 max_tokens)
2. Piece 1B depth-strengthening (MODULE_DECOMPOSITION_TAXONOMY_PROMPT: 3–6 sub_modules, 2–4 words, grammar_links guidance)
3. Piece 1C grammar rule expansion 6 → 11 (Rules 7–11: IEC 62619, BMS CAN link, shunt, contactor, fuse)

**Diff size:** 2,617 lines (full), 1,215 lines (mechanically critical subset reviewed)

---

## Aggregate Verdict: NEEDS_MAJOR (BLOCK)

| Seat | Model | Verdict |
|------|-------|---------|
| 1 | grok-4.3 | NEEDS_MINOR |
| 2 | gemini-3.1-pro-preview | NEEDS_MAJOR |
| 3 | glm-5.1 | NEEDS_MAJOR |
| 4 | mimo-v2.5-pro | NEEDS_MAJOR |

3 of 4 seats = NEEDS_MAJOR. Per synthesis rule (2+ NEEDS_MAJOR → BLOCK): **BLOCK**.

Transport failures: 0. All seats delivered clean JSON on first attempt.
Estimated total cost: ~£0.037 (4 seats, condensed diff).

---

## Dimension Scores

| Dimension | Grok | Gemini | GLM | MiMo |
|-----------|------|--------|-----|------|
| council_fix_correctness | WARN | FAIL | WARN | PASS |
| depth_prompting_effectiveness | FAIL | FAIL | WARN | WARN |
| grammar_rule_correctness | WARN | FAIL | FAIL | FAIL |
| rule_precedence | PASS | WARN | WARN | WARN |
| fallback_edge_cases | WARN | WARN | WARN | WARN |
| test_coverage | PASS | PASS | WARN | WARN |
| worked_example_fidelity | FAIL | FAIL | WARN | FAIL |

---

## Top Blockers (3 seats or more flagging the same issue)

### BLOCKER 1 — Rule 10 (Contactor): hardness:"hard" + weight:Infinity but no BLOCK path
**Seats raising:** gemini, glm, mimo (3/4)

`CONTACTOR_CURRENT_RATING_VS_PACK_CURRENT` declares `weight: Infinity, hardness: "hard"` but its evaluate() function only returns `WARN` or `PASS` — there is no `BLOCK` path. With fallback defaults (1000 kW / 1000 V = 1000 A pack current, contactor default 300 A), the rule fires `WARN` on 3.33× undersizing.

**The contradiction:** The `hardness:"hard"` contract means the rule should emit BLOCK for structural violations. Returning WARN from a hard rule either (a) means hard rules can emit WARN (which the architecture needs to document), or (b) the WARN is silently dropped by the engine's hard-rule path. If (b), the critical 3.3× contactor undersizing **never surfaces in output** — a silent safety miss.

The worked example §5 shows contactor as WARN intentionally (it's a warning with remediation options, not an abort). That is correct UX. The fix is therefore to change `hardness: "hard"` to `hardness: "soft"` (matching weight:Infinity is also inconsistent for a soft rule — consider weight: 10 or weight: 12). Alternatively, add explicit documentation that hard rules may return WARN (soft outcome from hard classification is an intentional design choice).

**Fix:**
```
File: src/lib/pdf-engine-v2/radical/grammar.ts
Line: CONTACTOR_CURRENT_RATING_VS_PACK_CURRENT definition
Fix: Change hardness: "hard" to hardness: "soft" and lower weight to e.g. 10 (matching severity of the WARN intent), OR add a BLOCK path for extreme undersizing (e.g. >5× factor) and keep hardness:"hard" for that path.
```

---

### BLOCKER 2 — Prompt contradiction: HARD CONSTRAINTS claims 6 sub_modules but JSON example shows 4
**Seats raising:** grok, gemini, glm, mimo (4/4)

The HARD CONSTRAINTS section states:
> "The worked-example BESS energy_storage_source module has 6 sub_modules (cell_string, rack_structure, bms_slave, bms_master, dc_distribution, pack_instrumentation)"

But the JSON worked example was edited to show only 4 sub_modules — `dc_distribution` and `pack_instrumentation` were removed. The grammar_links in the example also changed (now only references bms_master→bms_slave and cell_string→bms_slave), where the HARD CONSTRAINTS text still says "5 intra-module grammar_links (cell_string↔rack_structure via mechanical_mount; bms_slave↔bms_master via can_bus; bms_master→dc_distribution via contactor_command; cell_string↔dc_distribution via dc_busbar; bms_slave→pack_instrumentation via sensor_feedback)."

This 6-vs-4 contradiction is a direct few-shot poisoning issue: the LLM will see conflicting ground truth in the same prompt and produce inconsistent output. The depth-strengthening goal (getting 3–6 sub_modules instead of 1) is undermined by an example that contradicts its own stated depth.

Additionally, `bms_master` in the worked example has exactly 1 word (`bms_master_word`), while the HARD CONSTRAINT says "Every sub_module MUST have 2–4 words." This is a second contradiction between the example and its own constraints.

**Fix:**
```
File: src/lib/pdf-engine-v2/prompts.ts
Line: WORKED EXAMPLE — BESS energy_storage_source section
Fix: Either (a) add dc_distribution and pack_instrumentation back to the JSON example with words[] shape, OR (b) change the HARD CONSTRAINTS text from "has 6 sub_modules" to "has 4 sub_modules" and update the grammar_links count. Option (a) is strongly preferred — the original 6-sub-module example is what the depth-strengthening is trying to teach toward. Also add a second word to the bms_master sub_module in the example, or relax the "2-4 words" constraint to "1-4 words (2+ typical)" since single-word control modules are legitimate.
```

---

### BLOCKER 3 — Rule 8 (BMS CAN link): guaranteed false-positive BLOCK on all module-level BESS models
**Seats raising:** glm, mimo (2/4 at NEEDS_MAJOR, grok/gemini as WARN-level)

`BMS_MASTER_TO_SLAVE_CAN_LINK` fires BLOCK if both `bms_master` and `bms_slave` are present but `can_transceiver` is absent from archetypeIds AND environment, or `bms_to_slave_can_harness` is absent. At the module decomposition level (Stage 1.5 output feeding Stage 4d), harness BoM entries are never in the composition — they appear in Stage 2 leaf output, which runs after Stage 4d. This means Rule 8 will fire BLOCK on **every valid BESS model** at Stage 4d time, because the composition does not yet contain CAN transceiver or harness entries.

This makes the grammar pipeline a false-positive generator for BESS: every run gets a hard BLOCK from Rule 8 regardless of engineering correctness.

**Fix:**
```
File: src/lib/pdf-engine-v2/radical/grammar.ts
Line: BMS_MASTER_TO_SLAVE_CAN_LINK evaluate()
Fix: Change BLOCK to WARN ("BMS CAN link components expected — can_transceiver and bms_to_slave_can_harness not yet in composition. Add to BoM in Stage 2."). OR add environment tag awareness: only fire BLOCK when a "bom_complete" tag is present in environment, so Stage 4d (pre-BoM) runs get WARN, post-BoM validation gets BLOCK.
```

---

## Additional Concerns (2 seats)

### Council aggregator quorum ordering
**Seats raising:** grok, gemini

The quorum check (`failedCount >= 2 → NEEDS_MINOR`) fires **before** the `majorCount` check. Scenario: 2 seats transport-fail, 2 seats vote NEEDS_MAJOR → result is NEEDS_MINOR (quorum short-circuit) instead of NEEDS_MAJOR. This allows genuine blocking issues to be downgraded when transport noise co-occurs.

**Recommended fix:** Move the `majorCount >= 2 → NEEDS_MAJOR` check above the quorum check, so active NEEDS_MAJOR votes from speaking seats are never masked by transport failures:
```
// Check MAJOR votes first — they cannot be masked by transport failures
const majorCount = speaking.filter(s => s.verdict === 'NEEDS_MAJOR').length
if (majorCount >= 2) return 'NEEDS_MAJOR'
// Then quorum check — insufficient quorum degrades to NEEDS_MINOR
if (failedCount >= 2) return 'NEEDS_MINOR'
```

### Shunt precedence tier mismatch
**Seat raising:** glm, mimo

Rule 9 (shunt) is mapped to `'efficiency'` tier in RULE_PRECEDENCE but has a BLOCK path (`shuntA < packCurrentA → BLOCK`). A BLOCK from an efficiency-tier rule will lose precedence resolution against a conflicting safety-tier PASS. Either upgrade shunt to `'safety'` tier, or remove the BLOCK path and cap shunt at WARN (consistent with efficiency intent). Current 300A fallback + 1000A pack current also guarantees a spurious WARN on every BESS brief without explicit env tags — consider documenting this as expected behaviour or raising the fallback.

---

## Commit Decision

**DO NOT MERGE** until the following are resolved (in priority order):

1. **Rule 10 contactor hardness/verdict mismatch** — change hardness:"hard" to hardness:"soft" (or add BLOCK path for extreme undersizing).
2. **Prompt 6-vs-4 sub_module contradiction** — either restore dc_distribution + pack_instrumentation to the worked example JSON, or change the HARD CONSTRAINTS text to match 4.
3. **Rule 8 BMS CAN link false-positive BLOCK** — downgrade to WARN for Stage 4d context (pre-BoM), or add bom_complete environment guard.

Issues 4 (aggregator quorum ordering) and 5 (shunt tier) are NEEDS_MINOR — can fix in same commit or follow-up.

The three BLOCKER fixes are all minor code changes (< 20 lines each). No architectural rework needed.

---

## Reference

Prior council on Piece 1B: `src/lib/pdf-engine-v2/COUNCIL-CODE-REVIEW-PIECE-1B-2026-05-12.md`
