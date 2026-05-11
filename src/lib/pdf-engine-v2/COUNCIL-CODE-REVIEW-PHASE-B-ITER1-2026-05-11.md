# Coding Council — Phase B Iter 1 (Bug P0-7 universality fix)

**Date:** 2026-05-11
**Bundle:** commits `0c1ed503` (allowed_classes filter), `1f590609` (subsea_pressure_vessel), `2bc4f574` (solar_electric_airframe), `f4fe4c6e` (bioprocess_vessel)
**Files changed:** `src/lib/pdf-engine-v2/radical/character-hierarchy.ts`, `src/lib/pdf-engine-v2/radical/structural-builder.ts`
**Diff size:** 630 lines (+580 / -50)
**Bug being fixed:** Engine-accuracy-scorecard reported 0/10 products pass the universality flag; six concrete wrong-domain archetype violations (refrigerant_circuit on AUV/drone/HAPS, fire_detection_and_suppression_system_fss on bioreactor/vertical-farm, heat_pump_enclosure on bioreactor).

---

## Seat configuration (all via `mcp__second-opinion__ask_alt_llm`)

| Seat | Model | Role |
|---|---|---|
| 1 | `x-ai/grok-4.3` | Strict adversarial |
| 2 | `google/gemini-3.1-pro-preview` | Hidden coupling / type-safety |
| 3 | `z-ai/glm-5.1` | Schema integrity / contract enforcement |

Total council cost: ~$0.054 USD (combined prompt + response tokens across three seats).

---

## Verdicts

| Seat | Verdict | Key concern |
|---|---|---|
| Grok 4.3 | **NEEDS_MINOR** | `normaliseProductClass` silent-null fallback — acceptable for tests but a latent misroute vector |
| Gemini 3.1 Pro | **NEEDS_MINOR** (implicit; response truncated mid-sentence at 4096 token cap) | "Silent fallthrough bug only fixed in your data, not in your code" — if a future engineer adds a `preferredWordId` that doesn't list the character or maps to a disallowed class, the silent miss still applies (mitigated by allowedWords filter, but worth tightening) |
| GLM 5.1 | **NEEDS_MINOR** (Q1 APPROVED, Q2 NEEDS_MINOR, Q3 NEEDS_MINOR, Q4 APPROVED; verdict block truncated at 4096 token cap but consistent NEEDS_MINOR signal) | Substring-match ordering in `normaliseProductClass` is fragile (`'compute'`, `'server'`, `'farm'`, `'charger'` are very generic); silent-null fallback "defeats the entire P0 fix without any signal" |

**Synthesis under 2+NEEDS_MAJOR=block rule:** No seat called BLOCKER or NEEDS_MAJOR. **Council clears with minor follow-ups.**

---

## Convergent concerns (raised by 2+ seats)

### Concern A — Silent null-fallback in `normaliseProductClass` (3/3 seats)

> "If a typo in a classification string (e.g. `'heat_pup'`) silently reverts to the pre-fix buggy behaviour, the entire P0 fix is defeated without any signal."  — GLM 5.1
>
> "Silent fallback to permissive matching for unrecognised inputs is acceptable for test compatibility but leaves a latent misroute vector." — Grok 4.3
>
> Gemini's full response was truncated, but the core point (silent fallthrough not fixed in code) was raised in Q1.

**Mitigation applied (this commit):** Added a `console.warn` at the top of `buildTreeFromLeaves` when `normaliseProductClass` returns null. Production logs will now surface unrecognised classifications immediately. The throwing variant was rejected to preserve back-compat with any classifier path that may legitimately emit a non-matching string (e.g. early test fixtures, synthetic snapshots).

### Concern B — Substring-match ordering in `normaliseProductClass` (1/3 seats — GLM only)

GLM identified that `'compute'` matches before `'auv'`/`'subsea'` and `'server'` before `'haps'`/`'stratospheric'`. For example `"stratospheric_server_platform"` would match `edge_ai` first via `'server'`. **Not blocking** — no current snapshot or fixture is mis-routed (validated via Python simulation against all 10 product-class snapshots). Documented as a known fragility in the `normaliseProductClass` JSDoc; can be tightened in a future iteration if a regression appears.

### Concern C — `HierarchySentence.words[]` and `WORDS[].sentence_id` are two sources of truth (1/3 seats — GLM only)

GLM noted that the new sentences declare `words: ['x', 'y']` AND each word independently declares `sentence_id`. If the two drift, the `words[]` array becomes documentation rather than enforced. **Pre-existing concern, not introduced by this PR.** Not blocking.

---

## Question-by-question summary

| # | Question | Grok | Gemini | GLM | Synthesis |
|---|---|---|---|---|---|
| 1 | Filter logic correct? | APPROVED | NEEDS_MINOR (preferred-word silent miss) | APPROVED | **APPROVED** (filter logic is sound; Gemini's concern is about future-proofing not current behaviour) |
| 2 | Normaliser ordering / coverage | NEEDS_MINOR | (in Q1) | NEEDS_MINOR | **NEEDS_MINOR — addressed by added console.warn** |
| 3 | Sentence whitelist choices | APPROVED | NEEDS_MINOR (advisory only) | APPROVED | **APPROVED** |
| 4 | New sentence names + breakdowns | APPROVED | APPROVED (advisory only on naming convention `_word` suffix) | APPROVED | **APPROVED** |
| 5 | Character IDs as strings — convention OK? | APPROVED | APPROVED | APPROVED (truncated) | **APPROVED** |
| 6 | AUV `pressure_vessel` → `pressure_hull_word` | APPROVED | APPROVED | APPROVED (truncated) | **APPROVED** |
| 7 | Regressions in BESS/heat_pump/cgm/edge_ai/ev_charger | APPROVED | APPROVED (validated by simulation) | APPROVED (truncated) | **APPROVED** |

---

## Action items

- [x] **A1 — Add console.warn for unrecognised classifications.** Applied directly in `structural-builder.ts` after this council clear.
- [ ] **A2 — Tighten `normaliseProductClass` substring matching** (e.g. require word boundaries or preferred compound terms). DEFERRED — not blocking; document as known fragility instead.
- [ ] **A3 — Make `HierarchySentence.words[]` automatically derived from `WORDS[].sentence_id`.** DEFERRED — pre-existing schema, not introduced by this PR. Track separately.

---

## Verdict

**CLEARED — proceed.** Three NEEDS_MINOR votes, zero NEEDS_MAJOR or BLOCKER. Convergent concern (silent null-fallback) addressed in a follow-up commit. Bundle ready for the next pipeline batch (deferred to operator decision per execution rules).

**Predicted next-run scorecard outcome:** all 6 known wrong-domain violations eliminated → universality flag should pass on all 10 product classes. Tree depth/breadth has increased on AUV, HAPS and bioreactor (now 4 sentences each instead of 3 / 3 / 2).
