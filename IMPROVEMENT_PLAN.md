# IMPROVEMENT_PLAN — Prioritised fixes ranked by user-facing impact (2026-05-23)

Based on 5-seat audit (Seats A-E). 114 findings, 18 HIGH severity, 6 RED cross-cuts. This doc ranks the fixes by **impact × cost ratio** so the most-leverage work goes first. Every entry cites file:line.

**Ranking dimensions:**
- **User impact** — does the bug ship to founders as a wrong number / broken layout / missing content?
- **Effort** — code lines to change + risk
- **Universality** — does fixing one place fix the bug class everywhere?

---

## P0 — Ship-blocker (do FIRST, before any more chains)

### P0-1. Move Stage 32 (deriveHeadlineFromModules) before Stage 18

**Bug:** Every reviewer + critic + repair stage receives `keyMetrics=null` because Stage 32 populates AFTER. The cover-page headline numbers don't exist when R1/R4/specialist/critic make decisions.

**Fix:** Reorder `scripts/serial-design-chain-v2.tsx`: move lines 3076-3094 to between line 2434 and 2506. Stage 32's inputs (`design.modules + parsedResult.data + productClass + currentBriefText`) are all available by line 2435. Optionally re-run after Phase 2 (line 2928) to refresh post-mutation.

**Effort:** ~20 minutes. Move 20 lines + re-test one chain.

**Impact:** Universal quality drain affecting EVERY chain run. Reviewers gain the cover-page reality anchor.

**Cite:** WIRING_GAPS #10, METRICS_CONSISTENCY.md (keyMetrics section).

---

### P0-2. Add Stage 48.5: post-render PDF integrity check

**Bug:** No check that `chain-v2.pdf` exists, is non-zero size, starts with `%PDF-` header, or has > 0 pages. A 0-byte file or JSON-as-PDF can ship as `status='ready'` and the founder downloads garbage.

**Fix:** In `scripts/serial-design-chain-v2.tsx` between line 4040 (render) and line 4054 (final log), add:
```ts
const pdfStat = statSync(pdfPath)
if (pdfStat.size < 1024) throw new Error(`PDF too small: ${pdfStat.size} bytes`)
const header = readFileSync(pdfPath, { encoding: 'utf-8', length: 8 })
if (!header.startsWith('%PDF-')) throw new Error(`PDF header missing: ${header.slice(0,8)}`)
// optional: pdftotext check page count, but adds dependency
```

**Effort:** 15 minutes.

**Impact:** Catches catastrophic render failures before the founder ever sees them.

**Cite:** AUDIT_TRACE.md (Stage 48.5), Seat E Q8.

---

### P0-3. Fix the heat-pump wrong-key bug

**Bug:** `engineering-contract.ts:1138-1139` reads `brief.constraints.min_ambient_c.value` and `max_ambient_c.value`. These keys DON'T EXIST in the StructuredBriefJSON schema (schema is `operating_environment.temp_min_c` / `temp_max_c`). Brief's stated operating envelope is ALWAYS DISCARDED for heat pumps.

**Fix:** Change lines 1138-1139:
```ts
// WAS:
const minAmbientC = q(Number(brief?.constraints?.min_ambient_c?.value ?? -20), ...)
const maxAmbientC = q(Number(brief?.constraints?.max_ambient_c?.value ?? 35), ...)
// SHOULD BE:
const minAmbientC = q(Number(brief?.constraints?.operating_environment?.temp_min_c ?? -20), ...)
const maxAmbientC = q(Number(brief?.constraints?.operating_environment?.temp_max_c ?? 35), ...)
```

**Effort:** 5 minutes + heat-pump chain re-run.

**Impact:** Cold-climate heat-pump briefs (Scotland, Scandinavia, Canada) currently silently produce designs sized for -20°C ambient regardless of brief's -25°C / -30°C target.

**Cite:** HARDCODED_INVENTORY (Heat pump section), Seat A Q5.

---

### P0-4. Fix h2-electrolyser.ts:143 anti-pattern

**Bug:** `scripts/lib/orchestrator/emitters/h2-electrolyser.ts:143` calls `q({ quantities: {} } as any, 'rectifier_efficiency_pct', 97)` — passes an empty quantities object, so `97` is the only possible value. Paste error that defeats the entire `q()` pattern.

**Fix:** Replace with `q(contract, 'rectifier_efficiency_pct', 97)` (use the real contract, not a literal).

**Effort:** 2 minutes.

**Impact:** Minor today (rectifier_efficiency_pct is rarely brief-derived) but the pattern smells; future paste errors would propagate.

**Cite:** Seat B Q3.

---

### P0-5. Wire `audit-pdf-run.ts` into chain post-render

**Bug:** The 5-axis audit script I wrote today (`scripts/audit-pdf-run.ts`) catches density, fidelity, brief-vs-contract, visual overlap, cost-benchmark issues — but isn't invoked from the chain. Operators don't know to run it.

**Fix:** Add to `serial-design-chain-v2.tsx` between Stage 48 (render) and Stage 49 (open):
```ts
try {
  execFileSync('npx', ['tsx', resolve(__dirname, 'audit-pdf-run.ts'), outDir], { stdio: 'inherit', cwd: resolve(__dirname, '..') })
} catch (err) { console.error(`[chain] audit-pdf-run exit code != 0; check AUDIT.md`) }
```

**Effort:** 10 minutes.

**Impact:** Every chain run now self-audits before declaring success. Catches the regressions the user has been flagging manually.

**Cite:** AUDIT_TRACE.md, this session's audit script commits.

---

## P1 — High impact, moderate effort (do this week)

### P1-1. ARCHITECTURAL: Brief parser emits `metrics: Array<...>` not single `target_performance`

**Bug:** Root cause of cross-cuts 3 + 5 + 7 + 8 simultaneously. Schema at `src/lib/pdf-engine-v2/types.ts:26-31` declares one metric. Real briefs have multiple. Parser picks ONE, downstream layers all guess.

**Fix (3-step):**

1. **Extend schema** at `src/lib/pdf-engine-v2/types.ts`:
```ts
export interface StructuredBriefMetric {
  key_metric: string
  value: number
  unit: string
  category: 'scale' | 'performance' | 'efficiency' | 'durability' | 'cost'
  source: BriefSourceTag
}
export interface StructuredBriefPerformance {
  // Back-compat: also keep target_performance for stages that haven't migrated
  metrics: StructuredBriefMetric[]
  primary?: StructuredBriefMetric  // alias for target_performance — first scale metric
}
```

2. **Update parser prompt** at `src/lib/pdf-engine-v2/prompts.ts:27` to instruct Gemini 3.1 Pro to extract EVERY quantitative metric and categorise each.

3. **Update consumers** to read from `metrics[]` array, filtering by category:
   - `scripts/lib/orchestrator/envelope.ts` (35 detectors)
   - `scripts/lib/engineering-contract.ts` (35 archetypes)
   - `scripts/lib/orchestrator/constraint-normaliser.ts` (helper already exists)

**Effort:** 3-5 hours (schema + prompt + 70 consumer files).

**Impact:** Eliminates the entire unit-family bug class. 4 RED cross-cuts collapse simultaneously. **Highest leverage architectural change in the codebase.**

**Cite:** WIRING_GAPS #7, mempalace drawer 2026-05-23.

---

### P1-2. Fix the 7 archetypes still with fallthrough-to-assume-unit pattern

**Bug:** solar_inverter, wind_turbine, ups_inverter, cnc_machine, e_bike, pemfc, smr use ternary `Number(tp.value ?? FALLBACK)` that silently treats unknown units as the class default unit.

**Fix:** Apply the same IIFE pattern as bess/bioreactor/h2_electrolyser/heat_pump/ssb. Template (per archetype):
```ts
const ratedKw = (() => {
  // 1. Try desc regex FIRST (most reliable for the canonical metric)
  const descPower = desc.match(/(?:rated|nominal|output)\s+(?:power|capacity)[\s:]{0,8}(\d+...)\s*(kw|mw|w)\b/i) ?? ...
  if (descPower) { /* convert + return */ }
  // 2. Accept target_performance ONLY if unit in expected family
  if (briefValue > 0) {
    if (briefUnit === 'mw') return briefValue * 1000
    if (briefUnit === 'kw') return briefValue
    if (briefUnit === 'w') return briefValue / 1000
    // Wrong unit → fall to class default below
  }
  // 3. Class default
  return CLASS_DEFAULT_KW
})()
```

**Effort:** 30-45 minutes per archetype × 7 = ~5 hours.

**Impact:** Prevents the wrong-metric-as-kW silent disaster (the 5 MW electrolyser → 0.09 MW pattern).

**Cite:** HARDCODED_INVENTORY (7 unsafe archetypes), Seat A Q4.

---

### P1-3. Refactor remaining 26 envelope detectors to use `findScaleMetric`

**Bug:** Only 10/36 detectors use the Normaliser (Task #66 claimed completed but 28% done). 26 still embed direct `c.target_performance` reads or `c.max_mass_kg.value` only.

**Fix:** Pattern is identical to today's `bessScaleTier` / `bioreactorScaleTier` refactors. For each of the 26 detectors in `scripts/lib/orchestrator/envelope.ts`:
- Replace direct `c.target_performance` read with `findScaleMetric(c, family, descRegexes)`
- Reuse existing unit families from `constraint-normaliser.ts`

**Effort:** ~15-20 minutes per detector × 26 = 5-7 hours.

**Impact:** Closes the brittle-regex / single-field-read bug class universally.

**Cite:** WIRING_GAPS #5, Seat B Q2.

---

### P1-4. Fix the 6 critical VF emitter scale-fallbacks

**Bug:** `scripts/lib/orchestrator/emitters/vertical_farm.ts` has at least 6 scale-determining hardcoded fallbacks (trolley_count, led_power_kw, annual_yield_kg, total_electrical_kw, total_system_mass_kg, recommended_container_count). When the orchestrator's tool plan doesn't populate contract.quantities, these silently ship.

**Fix:** For each fallback, verify the orchestrator's class plan populates the key, OR add a defensive log when the fallback fires.

**Effort:** 1-2 hours (audit + minor patches).

**Impact:** VF reports stop silently shipping 25 t/yr / 30 kW / 18 t designs when brief asks for something else.

**Cite:** HARDCODED_INVENTORY (VF section), Seat B Q3.

---

### P1-5. Add price-band entries for wind / solar / h2 / ups / pemfc / smr / dac / ssb / evtol / etc.

**Bug:** `src/lib/pdf-engine-v2/class-price-bands.ts` has 37 entries but ZERO for wind_turbine (confirmed by grep). Likely MOST minimal-archetype classes are missing. G2 band check skipped → cover-page badge null → cost-stack defaults to wrong archetype (`ARCH_MID_VOLUME_PROFESSIONAL` with 0.20 install ratio vs wind's 0.50-0.70).

**Fix:** Per the INSTALLED_ASP_BENCHMARKS table I added to `audit-pdf-run.ts:11-22`, add corresponding entries in `class-price-bands.ts`:
- wind_turbine: £800-1500 per kW
- solar_inverter: £80-250 per kW
- h2_electrolyser: £800-2500 per kW
- ups_inverter: £400-1200 per kW
- pemfc: £1500-4000 per kW
- smr: £4M-8M per MW (use MW not kW)
- dac: £400-1500 per tonne CO2/yr
- ssb: £400-1500 per kWh (vs BESS £200-550)

**Effort:** 1-2 hours (build the table + verify install ratios match each class's typical civils).

**Impact:** Cost-stack stops defaulting to wrong archetype. wind turbines stop reporting £73k for 6 MW units.

**Cite:** Seat C Q6, HARDCODED_INVENTORY (Cost-stack section).

---

### P1-6. Migrate remaining 17 `wrap={false}` to `minPresenceAhead`

**Bug:** Today's fix patched 2 sites (BoM table + sub-module title). 17 more `wrap={false}` blocks remain in `render-minimal-pdf.tsx`, including 3 HIGH-RISK (sub-module wrapper :2532, supplier card :5260, Tools-Used card :5942).

**Fix:** Apply the same pattern as today's sub-module-title fix. For each `wrap={false}` block:
- If content is small (<100pt typical): leave as-is
- If content is medium-tall (100-300pt): replace `wrap={false}` with `minPresenceAhead={N}` where N is the typical content height
- If content is large + variable (>300pt): drop wrap entirely, let react-pdf flow naturally

**Effort:** ~10 minutes per site × 17 sites = 3 hours.

**Impact:** Eliminates the wind-turbine-page-18 visual-overlap bug class universally.

**Cite:** WIRING_GAPS #6, Seat C Q5.

---

### P1-7. Promote convergence-not-reached to a visible failure

**Bug:** `scripts/lib/orchestrator/executor.ts:88-98` — when the fixed-point loop exhausts `max_iterations`, it pushes a WARNING and continues with iter-N state. Orchestrator returns `ok=true` and chain logs nothing visible. A divergent VF/HAPS design ships as if converged.

**Fix:** Either:
- (a) Return `ok=false` with a "non-converged" failure type that the orchestrator's loud-failure machinery surfaces
- (b) Add a `(design as any).__nonConverged = true` flag that the cover-page renderer reads and prints a banner
- (c) Both

**Effort:** 30-60 minutes.

**Impact:** Catches a class of bug today's audit script can't detect (state.json shows "ok" but design is wrong).

**Cite:** Seat B Q1 (Additional silent path).

---

## P2 — Useful, lower urgency (do this month)

### P2-1. Tool narrative fields — write `what_it_does` / `results_interpretation` / `usage_pattern` for 229 Python wrappers

**Bug:** Cross-cut 1 — 0/229 have these 3 fields. The Tools-Used PDF appendix shows only `reference_paper` + `underlying_math` + `source` for ~95% of tools (CoolProp is the exception because someone hand-wrote it).

**Fix:** Add the 3 fields to each Python wrapper's `_provenance` block. Could be:
- (a) Hand-written per tool (~5 min each × 229 = 19 hours)
- (b) Generated by an LLM from each tool's existing docstring (1-2 hours batch run with verification)
- (c) Skip the universal claim and update Task #33 status to "partial — 6/229"

Recommendation: **(b)** — LLM batch generation reading each wrapper's docstring + python source + sample output, producing the 3 narrative strings as a JSON patch. Verify by sampling.

**Effort:** 2-4 hours.

**Impact:** Tools-Used appendix becomes uniformly rich. Reviewer LLMs reading tool outputs gain structured capability metadata.

**Cite:** WIRING_GAPS #1.

---

### P2-2. Centralise LLM temperature/top-p/seed config

**Bug:** Cross-cut 16 — 13+ call sites use different temperatures (0, 0.1, 0.2, 0.3, 0.4, scaling). Same brief produces different reviewers/cost-stack/PDF across runs. SCORER-AUDIT.md flags this as a B3 bug.

**Fix:** Create `src/lib/pdf-engine-v2/llm-config.ts` with named constants:
```ts
export const LLM_CONFIG = {
  brief_parser: { temperature: 0, seed: 42 },
  reviewer: { temperature: 0.1, seed: null },
  generator: { temperature: 0.2, seed: null, diversity_scan: 0.4 },
  scorer: { temperature: 0, seed: 42 },  // greedy for reproducibility
  ...
}
```

Then every call site imports from this single file.

**Effort:** 2-3 hours.

**Impact:** Reproducibility. Council scorer becomes a stable reward signal.

**Cite:** WIRING_GAPS #16.

---

### P2-3. Surface silent-filter exclusions in the BoM table

**Bug:** Cross-cut 9 — rows flagged `cost_repair_excluded_from_subtotal` display the line total but don't sum. Reader sees "96 + 8 = 0". 5 wired sites + multiple cert-word filter + TBD silent exclusions.

**Fix:** Either:
- (a) UI fix: render excluded rows with strikethrough + "(excluded)" tag
- (b) Math fix: still sum into a "review subtotal" sibling, show both numbers
- (c) Combine: the sub-total label changes to "Sub-total (excl. X items pending review)"

Recommendation: **(c)** — single number with a clear footnote.

**Effort:** 1-2 hours.

**Impact:** Math always reconciles visually. Reader trust.

**Cite:** WIRING_GAPS #9, Seat C Q2.

---

### P2-4. Fix `stripWordSuffixFromDesign` no-op + the 6 high-risk `as any` casts

**Bug:** Cross-cut 11 (no-op) + Cross-cut 15 (33 `as any` casts in chain).

**Fix:**
- Line 3499: change `(state as any).design` to `state.moduleDecomposition` (the actual field)
- Audit the 7 cast-to-any state-mutation sites (lines 2887, 3043, 3056, 3324, 3489-3490, 3499) and add proper typed extensions to the state type

**Effort:** 1 hour.

**Impact:** Removes a quiet correctness bug + makes future cast-to-any drift harder.

**Cite:** WIRING_GAPS #11, #15.

---

### P2-5. Disambiguate exit codes

**Bug:** Cross-cut 18 — code 1 used both for brief-refinement halt AND main() catch-all. Autopilot retries blindly.

**Fix:** Assign a unique exit code to each failure mode:
- 0 success
- 1 unexpected error (catch-all)
- 2 brief refinement halt
- 3 G0.5 reconciliation halt
- 4 brief-rewrite unfixable
- 5 render failed (after P0-2)
- 6 PDF integrity check failed (after P0-2)

Document in CLAUDE.md + worker script.

**Effort:** 30 minutes.

**Impact:** Worker / cron / autopilot can make smart retry decisions.

---

### P2-6. Cross-source dedup macros (orchestrator + engineering contracts)

**Bug:** Cross-cut 2 — today's macro-append fix concatenates `orchestratorContract.macros + engineeringContract.macros` without dedup BETWEEN the sources. If both contracts list the same macro name AND neither matches a design word, double-count.

**Fix:** Build the `unmatchedMacros` set as a Map keyed by `name.toLowerCase()`, accumulating the max(total) when names collide.

**Effort:** 15 minutes.

**Impact:** Insurance against future double-count when minimal-archetype classes start populating both contracts.

**Cite:** WIRING_GAPS #2.

---

### P2-7. Re-write the 23 minimal-archetype stubs to populate macro_assembly_prices

**Bug:** 23 of 35 archetypes use `buildMinimalContract` which returns `macro_assembly_prices: [], topology: [], closures: []`. Their Contracts are essentially inert — Generator hallucinates rather than computes.

**Fix:** For each of the 23 stubs (solar_inverter, wind_turbine, h2_electrolyser, ups_inverter, 3d_printer_fdm, cnc_machine, e_bike, all 4 satellites, propulsion_thruster, ground_station, evtol, quantum_computer, cryostat, fso, phased_array, ssb, pemfc, smr, humanoid, dac), write a full contract builder modelled on bess/bioreactor.

**Effort:** ~1-2 hours per archetype × 23 = 25-45 hours. Substantial but parallelisable (subagents).

**Impact:** Same as P1-5 but at the contract layer rather than band-only. Lets G2 cost-reality + physics critic operate on real anchors.

**Cite:** HARDCODED_INVENTORY (Wind turbine empty contract), Seat A Q3.

---

## P3 — Polish (when there's time)

### P3-1. Pre-parser brief sanitisation
Strip prompt-injection markers / control characters / `</SYSTEM>` tokens from the brief at `submit/route.ts` before insert. Low risk today (LLM-only consumption) but defensive.

### P3-2. Rate-limit briefs per founder per hour
A malicious user can flood `pdf_engine_runs` queue. Add a `created_at` check at insert time.

### P3-3. Rename `skeletonFailFast` to `skeletonFailFastTriggered`
Misleading variable name. The boolean is set but never branched on — name promises halt that doesn't exist. Cross-cut 13.

### P3-4. Verify `briefBlock.parsed_original` vs `state.parsedBrief` consumer parity
Renderer may read either; they differ (pre vs post brief refinement). METRICS_CONSISTENCY.md Risk 3.

### P3-5. Worker crash + retry policy
Today: worker stamps `failed` on chain crash but doesn't retry. Consider: 3 retries with exponential backoff for transient errors (timeout, 5xx from OpenRouter); permanent failure for parse/halt errors.

### P3-6. Worker logs rotation
Today: `~/.pdf-engine-worker/worker.{stdout,stderr}.log` unbounded. Risk of disk fill on heavy usage.

---

## Estimated total effort

| Tier | Effort | Items |
|---|---|---|
| P0 | ~1 hour | 5 items (all small) |
| P1 | ~15-25 hours | 7 items |
| P2 | ~30-50 hours | 7 items |
| P3 | ~5-10 hours | 6 items |
| **Total** | **~50-90 hours** | 25 items |

P0 should ship today. P1 within a week. P2 within a month. P3 as time permits.

## The single most valuable hour

**Do P0-1 (move Stage 32) + P0-5 (wire audit-pdf-run.ts into chain) right now.** Combined: 30 minutes. Effect: every future chain self-audits AND every reviewer can ground critique on cover-page numbers. The next chain you run produces a PDF that is BOTH more likely to be right AND known to be right.
