# Plan: Fix Process Flow Diagram Missing Inputs/Outputs

## Root Cause

There are **two bugs** in `flow-edge-utils.ts` that drop valid connections:

### Bug 1: Deduplication key is too broad (both `buildEdges` and `buildEdgesFromContracts`)

The deduplication check uses `source.id + target.id + output label`:

```typescript
const isDuplicate = edges.some(
  (e) => e.from === source.id && e.to === target.id && e.label === output,
)
```

This is correct — it prevents the same output being matched to multiple inputs on the same target. But the **label is set to the output port name**, so if two *different* outputs from Module A both match inputs on Module B (e.g. "12V Power Supply" and "5V Power Supply" both matching "Power Input"), they create edges with different labels and both survive.

However, the real issue is in `buildEdgesFromContracts` (line 189): the label is `resolvedSource` (the resolved output port name). If two contracts map *different* contract port names to the **same resolved output port** (because `resolvePortName` fuzzy-matched both to the same module port), the second contract is dropped as a duplicate — even though it targets a different input port.

**Fix:** Change dedup key to include **both** source handle AND target handle. Two edges from the same output to different inputs on the same target are valid (e.g. one power port feeding both logic and motor on the same module).

### Bug 2: Keyword overlap threshold is too strict for 3-keyword labels

`hasKeywordOverlap` requires 2+ shared keywords for labels with >2 keywords. This means a 3-keyword output like "Temperature Control Output" only matches a 3-keyword input "Temperature Sensor Input" if they share 2 keywords — but they only share "temperature" (since "control"≠"sensor" and "output"≠"input"). The short-label fix only activates for ≤2 keywords.

Real-world port names commonly have 3 keywords where only 1 is the semantic core ("Temperature"), with the rest being structural words ("Control", "Output", "Input", "Module", "System", "Signal", "Assembly").

**Fix:** Expand the stop-word set to include common structural IO words that don't carry semantic meaning: "input", "output", "module", "system", "signal", "assembly", "unit", "interface", "port", "connector", "line", "bus", "link", "channel". After stripping these, most 3-keyword labels reduce to ≤2 keywords and the existing short-label fix kicks in naturally.

## Changes

### File 1: `src/lib/cad-lab/keyword-matching.ts`

Add IO structural words to `KEYWORD_STOP_WORDS`:
```
"input", "output", "module", "system", "signal", "assembly",
"unit", "interface", "port", "connector", "line", "bus", "link", "channel"
```

These words appear constantly in port names but carry no semantic matching value — "Temperature Control Output" and "Temperature Sensor Input" should match on "temperature" alone once "output" and "input" are stripped.

### File 2: `src/app/(platform)/the-forge/cad-lab/lib/flow-edge-utils.ts`

**In `buildEdges` (line 94):** Change dedup key to include both output AND input:
```typescript
const isDuplicate = edges.some(
  (e) => e.from === source.id && e.to === target.id
    && e.sourceHandle === output && e.targetHandle === input,
)
```

**In `buildEdgesFromContracts` (line 188):** Same fix — dedup on both handles:
```typescript
const isDuplicate = edges.some(
  (e) => e.from === contract.sourceModuleId && e.to === contract.targetModuleId
    && e.sourceHandle === resolvedSource && e.targetHandle === resolvedTarget,
)
```

### File 3: `src/lib/cad-lab/__tests__/keyword-matching.test.ts`

Add test cases for the new stop words:
- "Temperature Control Output" vs "Temperature Sensor Input" → true (only "temperature" after stripping)
- "Motor Power Output" vs "Motor Power Input" → true ("motor", "power" after stripping)
- "Signal" alone should still match "Signal" (single word, short-label fix)

Update the existing test "returns false when long labels share only 1 keyword" — the example uses "Motor control signal output" vs "Thermal control cooling system". After adding "signal" and "output" to stop words, the first label becomes ["motor", "control"] (2 keywords, short-label fix), so it would match on "control". Need to update the test example to use words that are genuinely different.

## Files Modified

1. `src/lib/cad-lab/keyword-matching.ts` — expand stop words
2. `src/app/(platform)/the-forge/cad-lab/lib/flow-edge-utils.ts` — fix dedup key in both builders
3. `src/lib/cad-lab/__tests__/keyword-matching.test.ts` — new test cases + update existing

## Verification

1. `npx tsc --noEmit` — zero type errors
2. `npx jest keyword-matching` — all tests pass
3. `npx jest process-flow` — all tests pass
4. `npm run lint` — no new issues
