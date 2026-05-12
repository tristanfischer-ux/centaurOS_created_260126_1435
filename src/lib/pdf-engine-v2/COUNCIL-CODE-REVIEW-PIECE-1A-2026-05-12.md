# Council Code Review — Piece 1A
**Date:** 2026-05-12  
**Piece:** 1A — Stage 1.5 sub_modules + grammar_links emission; Stage 2 sub_module_id tagging  
**HEAD SHA:** 4fc3bb65  
**Diff size:** 813 lines across 7 files  

---

## Executive Summary

**Overall verdict: NEEDS_MAJOR**

Two of four seats (Gemini seat 2, GLM seat 3) returned NEEDS_MAJOR. The synthesis rule is: 2+ NEEDS_MAJOR → overall NEEDS_MAJOR, must fix before BESS run.

The core blocker is a **validator/fallback contradiction**: `validateModuleSpecShape` hard-errors when `sub_modules.length < 3`, but `buildFallbackDecomposition` emits `sub_modules: []` (count = 0). If the LLM fails Stage 1.5 and fallback fires, the fallback output will fail its own validator, breaking the safety net. A secondary issue (flagged by 3 of 4 seats) is that the prompt allows justified single-sub-module modules, yet the validator rejects any count below 3 — a contradiction that forces invalid retries for legitimate simple-module outputs.

The downstream data flow, schema types, and backward compatibility are sound. The two fixes needed are small (change validator lower bound; make fallback emit a sentinel sub_module).

---

## Per-Seat Verdict Table

| Seat | Model | Verdict | Schema | Prompt Clarity | Validator | Flow | Edge Cases | Compat |
|------|-------|---------|--------|---------------|-----------|------|------------|--------|
| 1 | x-ai/grok-4.3 | NEEDS_MINOR | PASS | WARN | WARN | PASS | PASS | PASS |
| 2 | google/gemini-3.1-pro-preview | NEEDS_MAJOR | WARN | FAIL | FAIL | PASS | FAIL | PASS |
| 3 | z-ai/glm-5.1 | NEEDS_MAJOR | WARN | PASS | FAIL | PASS | WARN | PASS |
| 4 | xiaomi/mimo-v2.5-pro | NEEDS_MINOR | PASS | WARN | WARN | PASS | WARN | PASS |

**Aggregation:** 2× NEEDS_MAJOR → **NEEDS_MAJOR**

---

## Top Concerns (synthesised across all 4 seats)

### BLOCKER — Validator/fallback count contradiction (3 seats: Gemini, GLM, MiMo)
`validateModuleSpecShape` hard-errors on `sub_modules.length < 3`. `buildFallbackDecomposition` emits `sub_modules: []`. If the LLM fails and fallback fires, the fallback output either (a) never goes through the validator (behaviour is implicit/undocumented) or (b) does go through it and is rejected, crashing the pipeline. The prompt simultaneously allows justified single-sub-module modules ("single-sub-module only with explicit justification"), creating a logical contradiction: the LLM could produce 1 sub_module with the required justification in `module_brief` and the validator would still hard-reject it. The fix is to relax the validator lower bound to 1 (error on 0, warn on 1–2) and make `buildFallbackDecomposition` emit at least one sentinel sub_module.

### MINOR — Prompt length and first-pass hallucination risk (Grok, Gemini, MiMo)
The prompt is now very long (26 mechanism strings, a full worked example, two schema blocks). On complex products with many modules, first-pass mechanism hallucination is likely. The existing 26-mechanism validator catches this and forces retries, but retry + fallback costs should be monitored. No schema change needed; this is an operational concern.

### MINOR — `<UNCATEGORISED>` sentinel not canonically defined in prompt (MiMo, Grok implied)
The `<UNCATEGORISED>` sentinel is mentioned in Stage 2's fallback message (`runOneModuleDecomposition`) and in `PER_MODULE_LEAF_PROMPT` tagging rules, but the exact casing and angle-bracket syntax is not pinned as a hard constant in `prompts.ts`. An LLM may emit `UNCATEGORISED`, `uncategorised`, or `<unknown>`. The validator in `validateLeafList` passes through any string as `sub_module_id`, so this would silently slip into state.

### MINOR — `validateLeafList` does not cross-reference `sub_module_id` against declared SubModuleSpec IDs (GLM)
Leaf records can carry any `sub_module_id` string and it passes validation uncontested. This is deferred to piece 1A.2 (structural builder grouping), but dangling IDs will be invisible in state.json until that piece runs. Not a pipeline-stopper for 1A, but worth noting.

---

## Specific Fixes (deduplicated, prioritised)

### Fix 1 — BLOCKER: Relax validator lower bound + fix fallback sentinel
**File:** `src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts`  
**Line hint:** `validateModuleSpecShape` — `subModulesRaw.length === 0` / `subModulesRaw.length < 3` error block; `buildFallbackDecomposition` — `sub_modules: []` emission  
**Fix:** Change the hard error threshold: error only on `length === 0`, demote `length < 3` to a `paramWarnings.push(...)`. Then update `buildFallbackDecomposition` to emit one sentinel sub_module per module:
```ts
{ id: 'uncategorised', name_human: 'Uncategorised', primary_character_id: 'uncategorised',
  primary_character_name_human: 'Uncategorised', modifiers: [], role_verb: 'contains' }
```
This ensures the fallback is structurally valid and gives Stage 2 a real sub_module_id to reference.

### Fix 2 — BLOCKER: Align prompt HARD CONSTRAINTS with softened validator
**File:** `src/lib/pdf-engine-v2/prompts.ts`  
**Line hint:** `HARD CONSTRAINTS` — "Every ModuleSpec MUST include sub_modules with 3–8 entries"  
**Fix:** Change to: "Every ModuleSpec MUST include sub_modules with 1–8 entries (3–8 strongly preferred; fewer only with explicit justification in module_brief)." This removes the contradiction with the prompt's own single-sub-module exception clause.

### Fix 3 — MINOR: Pin `<UNCATEGORISED>` as a verbatim constant in prompt
**File:** `src/lib/pdf-engine-v2/prompts.ts`  
**Line hint:** `PER_MODULE_LEAF_PROMPT` SUB-MODULE TAGGING RULES — `"<UNCATEGORISED>"` reference  
**Fix:** Add an explicit note: `The sentinel string MUST be exactly "<UNCATEGORISED>" — all caps, with angle brackets. Do not use "UNCATEGORISED", "uncategorised", "<unknown>", or any other variant.` Consider also exporting a `UNCATEGORISED_SUB_MODULE_ID = '<UNCATEGORISED>'` constant in `prompts.ts` for use in downstream code.

### Fix 4 — MINOR: Prompt intro sentence count for sub_modules
**File:** `src/lib/pdf-engine-v2/prompts.ts`  
**Line hint:** Opening paragraph of `MODULE_DECOMPOSITION_TAXONOMY_PROMPT`  
**Fix:** The prompt intro mentions "3–8 SubModuleSpec objects" in the body — after Fix 2, update this to "1–8" for consistency. Grok noted the prompt could add a one-sentence clarification that sub_module ids are unique within their module only, not across modules.

---

## Per-Seat Full Responses (verbatim)

### Seat 1 — x-ai/grok-4.3

```json
{
  "seat_name": "o3-pro",
  "verdict": "NEEDS_MINOR",
  "schema_correctness": "PASS",
  "prompt_clarity": "WARN",
  "validator_strictness": "WARN",
  "downstream_flow": "PASS",
  "edge_cases": "PASS",
  "backward_compat": "PASS",
  "top_3_concerns": [
    "Prompt is now very long; LLM may truncate or hallucinate enum values on first try",
    "Hard requirement of exactly 3–8 sub_modules per module may force unnatural decompositions for simple modules",
    "Validator does not yet guard against duplicate cross_module_grammar_link entries"
  ],
  "specific_fixes": [
    {
      "file": "src/lib/pdf-engine-v2/prompts.ts",
      "line_hint": "OUTPUT SCHEMA block",
      "fix": "Add a one-sentence note: 'sub_module ids must be unique across the sub_modules array of that ModuleSpec only; do not invent extra top-level keys.'"
    },
    {
      "file": "src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts",
      "line_hint": "buildFallbackDecomposition",
      "fix": "Emit at least one synthetic sub_module (id=UNCATEGORISED) instead of empty array so fallback never produces invalid JSON against the 3–8 rule."
    }
  ],
  "blocker_summary": "No hard blocker; minor prompt tightening + fallback adjustment will eliminate the only realistic sources of first-pass validation failure."
}
```

### Seat 2 — google/gemini-3.1-pro-preview

```json
{
  "seat_name": "Claude-3.5-Sonnet",
  "verdict": "NEEDS_MAJOR",
  "schema_correctness": "WARN",
  "prompt_clarity": "FAIL",
  "validator_strictness": "FAIL",
  "downstream_flow": "PASS",
  "edge_cases": "FAIL",
  "backward_compat": "PASS",
  "top_3_concerns": [
    "Paradoxical constraints: The prompt allows empty grammar_links 'only for single-sub-module modules', but simultaneously states (in SubModuleSpec and HARD CONSTRAINTS) that sub_modules MUST contain 3-8 entries. An LLM cannot satisfy both.",
    "Overly strict bounds: The validator and prompt enforce a minimum of 3 sub-modules per Universal Module. Simple hardware modules (e.g., environmental_interface, human_machine_interface) will often legitimately have 1-2 sub-modules, forcing the LLM to hallucinate padding to pass validation.",
    "Validation loop trap: If edge case (a) happens (LLM correctly produces 1 sub-module and [] grammar_links), the validator will fatally reject it because the array length is < 3, potentially failing the entire Stage 1.5 run."
  ],
  "specific_fixes": [
    {
      "file": "src/lib/pdf-engine-v2/prompts.ts",
      "line_hint": "sub_modules: array of 3–8 SubModuleSpec objects",
      "fix": "Change '3-8 SubModuleSpec objects' to '1-8 SubModuleSpec objects' (or a similar reasonable bound) to allow simple modules to be authentically represented."
    },
    {
      "file": "src/lib/pdf-engine-v2/prompts.ts",
      "line_hint": "HARD CONSTRAINTS (validator will reject otherwise)",
      "fix": "Change '- Every ModuleSpec MUST include sub_modules with 3–8 entries.' to match the lowered minimum, e.g., '1-8 entries'."
    },
    {
      "file": "src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts",
      "line_hint": "validator additions: sub_modules 3-8 count",
      "fix": "Relax the validator to accept sub_modules.length >= 1 (instead of strictly >= 3) to prevent throwing away valid decompositions of low-complexity modules."
    }
  ],
  "blocker_summary": "The pipeline strictly demands 3-8 sub-modules per module while paradoxically giving instructions for 'single-sub-module modules'. This contradiction will either force the LLM to heavily hallucinate fake structural components for simple modules just to pass Stage 1.5, or result in repeated validation failures loop that tanks the pipeline run. The sub-module count lower-bound must be relaxed to 1 before running BESS."
}
```

### Seat 3 — z-ai/glm-5.1

```json
{
  "seat_name": "ModuleDecomposition",
  "verdict": "NEEDS_MAJOR",
  "schema_correctness": "WARN",
  "prompt_clarity": "PASS",
  "validator_strictness": "FAIL",
  "downstream_flow": "PASS",
  "edge_cases": "WARN",
  "backward_compat": "PASS",
  "top_3_concerns": [
    "Validator hard-errors on sub_modules.length < 3, creating a false-negative loop for prompt-compliant justified single sub-modules.",
    "buildFallbackDecomposition emits sub_modules:[] which fails the <3 validation check, breaking the structural safety net.",
    "validateLeafList fails to cross-reference sub_module_id against declared SubModuleSpec IDs, allowing hallucinated IDs to pass."
  ],
  "specific_fixes": [
    {
      "file": "src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts",
      "line_hint": "validateModuleSpecShape subModulesRaw length check",
      "fix": "Change hard error from <3 to ==0, and demote 1-2 to a warning (not error). Align with prompt: '3-8 entries (single-sub-module only with explicit justification)' by warning on 1-2, erroring only on 0."
    },
    {
      "file": "src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts",
      "line_hint": "buildFallbackDecomposition",
      "fix": "Emit a single sentinel sub_module per module instead of empty array: {id:'uncategorised', name_human:'Uncategorised', primary_character_id:'uncategorised', primary_character_name_human:'Uncategorised', modifiers:[], role_verb:'contains', topology_clause:null}. Keep grammar_links:[] and cross_module_grammar_links:[]."
    },
    {
      "file": "src/lib/pdf-engine-v2/radical/structural-builder.ts",
      "line_hint": "validateLeafList sub_module_id handling",
      "fix": "After normalization, add an optional cross-check: if the parent module's moduleDecomposition entry has non-empty sub_modules, validate that leaf.sub_module_id is either null or matches one of the declared SubModuleSpec.id values."
    },
    {
      "file": "src/lib/pdf-engine-v2/prompts.ts",
      "line_hint": "MODULE_DECOMPOSITION_TAXONOMY_PROMPT HARD CONSTRAINTS",
      "fix": "Update to say '1-8 entries (3-8 strongly preferred; 1-2 only with explicit justification in role_verb or detail)'. Keep prompt and validator in sync."
    }
  ],
  "blocker_summary": "The validator's hard error on sub_modules.length < 3 directly contradicts the prompt's own allowance for justified single sub-modules, and compounding this, buildFallbackDecomposition emits empty sub_modules (count=0) which fails the same validation check — meaning a failed Stage 1.5 LLM call produces fallback data that its own validator rejects. Before any BESS pipeline run, either (a) soften the validator to error only on count==0 and warn on 1-2, updating the prompt constraint to match, or (b) remove the single-sub-module exception from the prompt and make buildFallbackDecomposition emit at least one sentinel sub_module so fallback output is structurally valid."
}
```

### Seat 4 — xiaomi/mimo-v2.5-pro

```json
{
  "seat_name": "MiMo-v2.5-pro",
  "verdict": "NEEDS_MINOR",
  "schema_correctness": "PASS",
  "prompt_clarity": "WARN",
  "validator_strictness": "WARN",
  "downstream_flow": "PASS",
  "edge_cases": "WARN",
  "backward_compat": "PASS",
  "top_3_concerns": [
    "validateModuleSpecShape enforces 3-8 sub_modules but buildFallbackDecomposition emits 0 — if fallback output runs through the validator, it will be rejected, breaking the safety net",
    "Prompt allows single-sub-module modules with justification but validator hard-errors on count<3 — contradiction forces unnecessary LLM retries for legitimate simple modules",
    "<UNCATEGORISED> sentinel is referenced in Stage 2 fallback message but not explicitly defined as a valid sub_module_id value in the prompt constraints — LLM may invent variations like 'UNCATEGORISED' or 'uncategorised'"
  ],
  "specific_fixes": [
    {
      "file": "src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts",
      "line_hint": "validateModuleSpecShape subModulesRaw length check (<3 error)",
      "fix": "Change hard error threshold from 3 to 1 (error on 0, warn on 1-2). Update prompt HARD CONSTRAINTS to match. buildFallbackDecomposition should emit at least 1 sentinel sub_module {id:'uncategorised', name_human:'Uncategorised', primary_character_id:'uncategorised', primary_character_name_human:'Uncategorised', modifiers:[], role_verb:'contains'}."
    },
    {
      "file": "src/lib/pdf-engine-v2/prompts.ts",
      "line_hint": "PER_MODULE_LEAF_PROMPT SUB-MODULE TAGGING RULES",
      "fix": "Explicitly define '<UNCATEGORISED>' as the exact sentinel string in the tagging rules, with note that it must be verbatim including angle brackets. Prevents case-variant hallucinations."
    }
  ],
  "blocker_summary": "No hard blocker for the BESS pipeline run — the downstream flow is complete and backward compatibility is preserved. The 3-8 validator strictness will likely cause retry overhead on simpler modules but the primary BESS path (energy_storage_source with 6 sub-modules) should pass cleanly. Fix the validator threshold and fallback sentinel before scaling to product types with simpler module decompositions."
}
```

---

## Cost Summary
| Seat | Model | Input tokens | Output tokens | Est. cost USD |
|------|-------|-------------|--------------|--------------|
| 1 | x-ai/grok-4.3 | 4,615 | 830 | $0.010 |
| 2 | google/gemini-3.1-pro-preview | 3,737 | 2,983 | $0.024 |
| 3 | z-ai/glm-5.1 | ~2,180 | ~5,621 | ~$0.027 |
| 4 | xiaomi/mimo-v2.5-pro | ~2,584 | ~4,640 | ~$0.018 |
| **Total** | | | | **~$0.079** |
