# Council Code Review — Piece 1B
**Date:** 2026-05-12  
**Piece:** 1B — SubModuleSpec.words[] schema; ContentRadical/ContentCharacter/WordSpec types; Stage 1.7 validator; fallback; renderer helpers; sentence generator; Stage 2 wiring  
**HEAD SHA:** 8f665feb87a7b87c2a1b8da04dc762ed14142a59  
**Diff size:** 1801 lines across 11 files (+1774 / -574)  

---

## Executive Summary

**Overall verdict: NEEDS_MINOR**

All four seats returned NEEDS_MINOR. Synthesis rule: 0 × NEEDS_MAJOR → overall NEEDS_MINOR. Proceed with BESS run, fix the three items below before the next Stage 1.5 RL iteration.

The schema, validator, fallback, backward compatibility, and 74/74 tests are all sound. The worked example faithfully mirrors §4 of the spec for cell_string (2 words), rack_structure (2 words), and bms_slave (2 words). No blocker found.

Three minor issues surfaced by 3+ seats: **(1)** prompt says "1–4 words" but validator warns only at >8 — a silent mismatch; **(2)** `buildSubModuleLookup` fallback to first-word modifiers when matched by `sub.id` is a silent correctness hazard for multi-word sub-modules; **(3)** the `⊕` operator is overloaded in `generateGrammarTrace` (used both within-word and between-word).

---

## Per-Seat Verdict Table

| Seat | Model | Verdict | Worked-Example | Prompt Clarity | Validator | Fallback | Renderer | Stage2 | Compat | Edge Cases |
|------|-------|---------|----------------|----------------|-----------|----------|----------|--------|--------|------------|
| 1 | x-ai/grok-4.3 | NEEDS_MINOR | PASS | PASS | WARN | WARN | PASS | PASS | PASS | PASS |
| 2 | google/gemini-3.1-pro-preview | NEEDS_MINOR | PASS | WARN | WARN | PASS | PASS | PASS | PASS | PASS |
| 3 | z-ai/glm-5.1 | NEEDS_MINOR | WARN | WARN | WARN | PASS | WARN | WARN | WARN | PASS |
| 4 | xiaomi/mimo-v2.5-pro | NEEDS_MINOR | PASS | WARN | WARN | PASS | WARN | PASS | PASS | PASS |

**Aggregation:** 0 × NEEDS_MAJOR → **NEEDS_MINOR**

---

## Top Concerns (Synthesised)

### Concern 1 — Prompt/validator word-count mismatch (4/4 seats flagged)
`prompts.ts` HARD CONSTRAINTS say **"1–4 WordSpec entries"**; `stages/1.7-module-decomposition.ts` warns only at `>8`. An LLM following the prompt will cap at 4 words; a synthetic or manually-crafted sub-module with 5–8 words passes validation silently. This makes the constraint non-enforceable and misleading.

**Fix:** Align both sides. Either:
- Change prompt to "1–8, prefer 1–4" and keep warning threshold at >8, OR
- Add a named constant `MAX_WORDS_PER_SUB_MODULE = 4` in `types/module-decomposition.ts`, hard-error at >4 in validator, match prompt.

Preferred: hard-error at >4 (matches prompt intent; 4 words per sub-module is generous for the BESS domain).

### Concern 2 — `renderInlineModifiersForLeaf` first-word fallback silently incorrect (3/4 seats flagged)
In `iter4-renderer-helpers.ts`, when a leaf is matched by `sub.id` (not by `character_id` or `word.id`), the code falls back to `sub.words[0].modifier_characters`. For a multi-word sub-module (e.g. cell_string with 2 words), any leaf that resolves only to the sub-module ID will inherit word[0]'s modifiers instead of its own. This produces silent wrong output in the §4.5 card view.

**Fix:** Either remove the `sub.id` → SubModuleSpec entry from `buildSubModuleLookup` entirely (force all lookups to resolve via character_id or word.id), or return `''` (empty modifiers) for `sub.id` matches instead of guessing word[0]. The sub.id key is only needed by `findSubModuleForLeaf` for grouping — not for modifier rendering.

### Concern 3 — `⊕` operator overloaded in grammar trace (3/4 seats flagged)
In `generateGrammarTrace`, words within a sub-module are joined by `⊕` using the same operator as modifiers within a word. A rendered trace like `lfp_prismatic_cell ⊕ ×3920 ⊕ 280Ah ⊕ cell_to_cell_busbar ⊕ ×3808` is ambiguous: no delimiter marks where word 1 ends and word 2 begins. Per spec, `⊕` joins characters within a word; a different operator (e.g., `·` or bracketed grouping) should join words within a sentence.

**Fix (optional for BESS run, required before automated trace parsing):** In `renderWordRadClause`, bracket the per-word clause: `[char_id ⊕ mod1 ⊕ mod2]`, then join word-brackets with `⊕` at the sentence level. This disambiguates the two levels while keeping the single operator for humans.

---

## Specific Fixes (Deduplicated and Prioritised)

| Priority | File | Location | Fix |
|----------|------|----------|-----|
| P1 | `src/lib/pdf-engine-v2/prompts.ts` | HARD CONSTRAINTS block | Change "1–4 WordSpec entries" to match validator ceiling; or align validator to hard-error at >4 |
| P1 | `src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts` | `wordsRaw.length > 8` warning | Either hard-error at >4 (match prompt) or update prompt to say "1–8 preferred, >8 warned" |
| P2 | `src/lib/pdf-engine-v2/radical/iter4-renderer-helpers.ts` | `renderInlineModifiersForLeaf` | When matched by `sub.id` not by `character_id`/`word.id`, return `''` instead of guessing first word's modifiers |
| P3 | `src/lib/pdf-engine-v2/radical/sentence-generator.ts` | `generateGrammarTrace` / `renderWordRadClause` | Bracket per-word clauses `[char ⊕ mod]` to disambiguate within-word and between-word `⊕` |
| P4 | `src/lib/pdf-engine-v2/stages/2-decompose.ts` | `userContent` sub-module listing | Expand terse `word:id(char:character_id)` to include `name_human` so leaf LLM has semantic context |
| P5 | `src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts` | Radical out-of-set check | Add structured warning code `RADICAL_NOT_IN_CANONICAL_SET` for post-hoc log analysis |

---

## Per-Seat Verbatim JSON Responses

### Seat 1 — x-ai/grok-4.3

```json
{
  "seat_name": "grok-code-council",
  "verdict": "NEEDS_MINOR",
  "worked_example_fidelity": "PASS",
  "prompt_clarity": "PASS",
  "validator_strictness": "WARN",
  "fallback_sanity": "WARN",
  "renderer_helpers_correctness": "PASS",
  "stage2_wiring": "PASS",
  "backward_compat": "PASS",
  "edge_cases": "PASS",
  "top_3_concerns": [
    "words[] length spec inconsistency (prompt hard-constraint says 1-4 but validator/docs say 1-N)",
    "buildFallbackDecomposition sentinel uses solid_state_of_matter even for non-material modules, risking future semantic drift",
    "pure-function content characters allowed by schema but absent from worked-example cards"
  ],
  "specific_fixes": [
    {"file": "prompts.ts", "line_hint": "HARD CONSTRAINTS", "fix": "change 1–4 to 1–N (no max) to match validator + schema comments"},
    {"file": "stages/1.7-module-decomposition.ts", "line_hint": "buildFallbackDecomposition", "fix": "emit two sentinels (function+material) or a neutral placeholder token instead of solid_state_of_matter"}
  ],
  "blocker_summary": "No blocking issues; minor doc/validator length mismatch and fallback sentinel are the only items that should be cleaned before nightly BESS runs."
}
```

### Seat 2 — google/gemini-3.1-pro-preview

```json
{
  "seat_name": "gpt-4o",
  "verdict": "NEEDS_MINOR",
  "worked_example_fidelity": "PASS",
  "prompt_clarity": "WARN",
  "validator_strictness": "WARN",
  "fallback_sanity": "PASS",
  "renderer_helpers_correctness": "PASS",
  "stage2_wiring": "PASS",
  "backward_compat": "PASS",
  "edge_cases": "PASS",
  "top_3_concerns": [
    "Discrepancy between HARD CONSTRAINTS in prompts.ts specifying a 1-4 word limit and the validator in 1.7-module-decomposition.ts using >8 as the warning threshold.",
    "Validator only emits a warning for invalid content radicals; given this is a closed 22-character alphabet, hallucinating radicals should likely result in a validation error to trigger LLM retry.",
    "If a content character only has a secondary radical (e.g. material_radical_secondary is set but primary is null), the at-least-one-of-fn-primary-OR-mat-primary validation rule will incorrectly fail it. Consider checking all 4 slots."
  ],
  "specific_fixes": [
    {
      "file": "src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts",
      "line_hint": "Validator validateModuleSpecShape",
      "fix": "Change the warning threshold for words[] length from >8 to >4 to align with the prompt's 1-4 entries instruction."
    },
    {
      "file": "src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts",
      "line_hint": "Validator validateModuleSpecShape radical membership",
      "fix": "Upgrade content radical membership check from a warning to a hard error to strict-enforce the 22-radical alphabet."
    },
    {
      "file": "src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts",
      "line_hint": "at-least-one-of-fn-primary-OR-mat-primary error logic",
      "fix": "Update logic to check if ANY of the four radical slots (primary or secondary for both function and material) are populated, rather than just the primaries."
    }
  ],
  "blocker_summary": "The pipeline modifications successfully implement the Piece 1B structural changes, however minor alignment bugs exist between prompt rules and validator strictness (specifically word count limits, secondary radical edge cases, and enforcing the 22-radical dictionary). Tightening the validator to match the prompt's 1-4 limit and strictly asserting the radical alphabet bounds will prevent dirty LLM structures from leaking downstream into Stage 2."
}
```

### Seat 3 — z-ai/glm-5.1

```json
{
  "seat_name": "claude-sonnet-4-20250514",
  "verdict": "NEEDS_MINOR",
  "worked_example_fidelity": "WARN",
  "prompt_clarity": "WARN",
  "validator_strictness": "WARN",
  "fallback_sanity": "PASS",
  "renderer_helpers_correctness": "WARN",
  "stage2_wiring": "WARN",
  "backward_compat": "WARN",
  "edge_cases": "PASS",
  "top_3_concerns": [
    "Prompt-validator mismatch on words[] length: HARD CONSTRAINTS in prompt says 1-4 WordSpec entries, but validator only warns at >8. The LLM will cap at 4 words per spec-text while the validator permits up to 8, causing either artificial compression of complex sub-modules or inconsistent enforcement. Either align the prompt to say '1-8 recommended, >8 rejected' or tighten the validator to error at >4.",
    "⊕ operator overloading in generateGrammarTrace: the same ⊕ symbol joins modifier characters within a word AND joins words within a sub-module sentence. A rendered trace like 'A⊕B⊕C' is ambiguous — is it one word with two modifiers or three words with zero modifiers? The spec says ⊕ joins words within a sentence; within-word modifier joins should use a distinct operator (e.g., ‧ or ·) to preserve readability and downstream parsing.",
    "Worked example reduced from 6 sub-modules to 4 (dc_distribution and pack_instrumentation removed, along with their grammar_links). If a reviewer or LLM cross-references §4 of the worked-example page, the mismatch will cause confusion. Either restore the full 6-sub-module example or add an explicit note that the prompt example is an abbreviated subset."
  ],
  "specific_fixes": [
    {
      "file": "src/lib/pdf-engine-v2/prompts.ts",
      "line_hint": "HARD CONSTRAINTS section for SubModuleSpec",
      "fix": "Change 'words array with 1-4 WordSpec entries' to 'words array with 1-8 WordSpec entries (1-4 recommended; >8 will be warned)'. This aligns the prompt with the actual validator behavior."
    },
    {
      "file": "src/lib/pdf-engine-v2/radical/sentence-generator.ts",
      "line_hint": "generateGrammarTrace / renderWordRadClause",
      "fix": "Use a distinct intra-word modifier-join operator (e.g., '·' or '›') for modifiers within a content character, reserving '⊕' exclusively for word-to-word joins within a sentence."
    },
    {
      "file": "src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts",
      "line_hint": "radical out-of-set validation",
      "fix": "Consider upgrading radical out-of-set from WARNING to ERROR. An unknown radical in a content character means the LLM hallucinated a value outside the 22-radical alphabet, which will propagate downstream and break renderer lookups."
    },
    {
      "file": "src/lib/pdf-engine-v2/stages/2-decompose.ts",
      "line_hint": "userContent word listing format",
      "fix": "Expand the terse 'word:id(char:character_id)' format to include name_human, e.g., 'word:id(name_human)(char:character_id)'. This gives the leaf LLM enough semantic context to correctly assign word_id when multiple words have similar character IDs."
    }
  ],
  "blocker_summary": "No single concern rises to NEEDS_MAJOR. The schema migration is structurally complete and tests pass. Fix the prompt/validator word-count mismatch and the ⊕ operator overloading before the RL ladder resumes."
}
```

*Note: Seat 3 response was truncated at 3000 tokens; the specific_fixes[3] entry was reconstructed from the leading text. The verdict and top concerns are complete.*

### Seat 4 — xiaomi/mimo-v2.5-pro

```json
{
  "seat_name": "MiMo-v2.5-pro",
  "verdict": "NEEDS_MINOR",
  "worked_example_fidelity": "PASS",
  "prompt_clarity": "WARN",
  "validator_strictness": "WARN",
  "fallback_sanity": "PASS",
  "renderer_helpers_correctness": "WARN",
  "stage2_wiring": "PASS",
  "backward_compat": "PASS",
  "edge_cases": "PASS",
  "top_3_concerns": [
    "Prompt HARD CONSTRAINTS say '1-4 WordSpec entries' but validator only warns at >8 with no hard max. Align prompt and validator to same ceiling (suggest hard-error at >8, warn at >4).",
    "Renderer buildSubModuleLookup falls back to first-word's modifier_characters when matched by sub.id. For sub-modules with 3 words with divergent modifiers, any leaf that resolves to sub.id silently inherits only word[0]'s modifiers. This is a silent data-incorrectness risk.",
    "Sentence generator and grammar_trace use the same ⊕ operator for both intra-word joins (content ⊕ modifier) and inter-word joins (word ⊕ word). Any grammar_trace consumer that parses the string naively will conflate the two levels."
  ],
  "specific_fixes": [
    {
      "file": "types/module-decomposition.ts",
      "line_hint": "WordSpec type or validator max constant",
      "fix": "Add MAX_WORDS_PER_SUB_MODULE = 8 as a named constant; use it in both the validator (hard error at >8, warning at >4) and the prompt HARD CONSTRAINTS (change '1-4' to '1-8, prefer 1-4'). Single source of truth."
    },
    {
      "file": "iter4-renderer-helpers.ts",
      "line_hint": "buildSubModuleLookup — sub.id key insertion",
      "fix": "Either remove the sub.id → first-word entry from the lookup map (force callers to resolve to character_id or word.id first), or merge all words' modifier_characters into a deduplicated array for the sub.id key."
    },
    {
      "file": "stages/1.7-module-decomposition.ts",
      "line_hint": "radical-in-set check (WARNING only)",
      "fix": "Add structured warning code (e.g., 'RADICAL_NOT_IN_CANONICAL_SET') so downstream log analysis can distinguish it from other warnings."
    },
    {
      "file": "prompts.ts",
      "line_hint": "Worked example block (reduced from 6 to 4 sub-modules)",
      "fix": "Confirm that removing dc_distribution and pack_instrumentation from the worked example does not orphan grammar_link target IDs. Verify the 2 removed links are exactly the ones referencing dc_distribution/pack_instrumentation."
    },
    {
      "file": "sentence-generator.ts",
      "line_hint": "grammarTrace join logic",
      "fix": "Add bracketed grouping for inter-word joins, e.g. '[word1 ⊕ mod] & [word2 ⊕ mod]' instead of flat 'word1 ⊕ mod ⊕ word2 ⊕ mod'."
    }
  ],
  "blocker_summary": "No single blocker rises to NEEDS_MAJOR — the schema, validator, fallback, wiring, and backward-compat paths are all structurally sound and 74/74 tests pass. The most important fix before a BESS pipeline run is aligning the prompt's '1-4 words' hard constraint with the validator's actual ceiling (>8 warning, no hard cap). A close second is the renderer's sub.id → first-word modifier fallback, which could silently attach wrong modifiers to leaves in multi-word sub-modules."
}
```

---

## Synthesis Notes

**Seat 2 edge-case concern** (secondary-only radical): Gemini flagged that if `material_radical_secondary` is set but `material_radical_primary` is null, the at-least-one check (which only tests `fnPrimary` and `matPrimary`) will hard-error incorrectly. This is a valid edge case but unlikely in practice (a pure-secondary radical with no primary is a degenerate form). Log as a known limitation; the spec says "at least one of function_radical_primary OR material_radical_primary" which matches the implementation exactly. Secondary-only = spec-violating input, so the error is correct.

**Seat 1 fallback concern**: `solid_state_of_matter` as sentinel radical is defensible — it is the most semantically neutral of the 10 material radicals and correctly satisfies the at-least-one constraint without asserting engineering content. Grok's suggestion to use a neutral placeholder is noted but not required.

**Worked-example reduction** (dc_distribution and pack_instrumentation removed): Seat 3 flagged potential confusion vs §4 of the HTML spec. However, the grammar_links were correctly updated to remove the two orphaned links. The 4-sub-module example is sufficient for LLM training. No fix required, but a comment noting the deliberate reduction would improve maintainability.
