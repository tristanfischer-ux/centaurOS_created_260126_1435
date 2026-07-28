# Universality asymmetry council (2026-07-28)

**Question (Tristan):** Why did the bioreactor hit ~9 on every tab, while the cell-cycler struggles? Is universality broken? If we went back to the bioreactor today, would it still work?

**Council:** Terra (GPT-5.6 Sol) + Kimi K3 · Cursor chair  
**Evidence artefacts:**
- Organoid: `out/organoid-9drive-r11-allfixes` — tab-scorecard min **9**, `ships: true` (28 scored; 8 OOS verified)
- Cycler: `out/cell-cycler-cold-v17` — tab-scorecard min **2.0** (Exec Summary / Quality floor); fail tabs: Exec, Overview, Quality; BoM ledger 8.7

---

## Joint verdict

**Universality is not fake. It is unproven and coverage-asymmetric.**

The engine’s *architecture* is function-keyed (no `cell_cycler` class required). The *gene coverage* that makes a cold twin hit floor-9 is mature for the wet-lab / `vial_bioreactor` clade and immature for dry `bench_power_instrument`. Passing on the training clade proves the engine can be completed *somewhere*; it does not prove *everywhere*.

| Claim | Status |
|---|---|
| Rules are product-named special cases | **False** — architecture is universal |
| Cold floor-9 for any unseen product today | **False / unproven** — coverage gap |
| Organoid “9” means morphology 9 | **False** — Excel 9 ≠ Yuri form 9 |
| Cycler struggle means invent a class | **False** — missing function genes + corpus |

---

## Would going back to the bioreactor still work?

| Experiment | Honest answer |
|---|---|
| **Frozen r11 replay** (same state/assets, re-score or re-export) | **Likely still 9** on the workbook scorecard — but that is *reproducibility of a repaired artefact*, not cold universality. Pin a forge-truth DB snapshot; live-DB drift can still move prices/embeddings. |
| **Fresh cold tip** on the same bioreactor brief, current HEAD, cold cache | **Do not assume floor-9.** Expect better than cycler on wet genes; still vulnerable to decomposition jitter, corpus/PCB fitness, newly sharpened honesty gates, and score-surface disagreement. Organoid’s 9 was bought with ~20 PCB solo packs + form/interior work — not demonstrated as zero-shot. |

Kimi’s blunt read: replay ≈ high probability; fresh cold tip ≈ coin-flip as *generalization*, not as “the product is easy.”

---

## Why the cycler struggles (not “harder product”)

1. **Gene maturity** — Bioreactor has a trained exterior/interior signature + long PCB repair history. Cycler’s `bench_power` exterior signature only landed **2026-07-28**; earlier twins had guts inside a featureless shell (Renders correctly failed).
2. **Corpus** — Wet-lab roles were repeatedly resolved through solo packs. Dry channel electronics (pass bank, charge source, AFE, shunt, protection) still hit catalogue silence → BoM ledger / PCB readiness residuals.
3. **Primary physics spine** — Bioreactor: vessel → temp/agitation/dosing → sense. Cycler: N bidirectional channels × thermal dissipation × isolation × mains — more function genes must fire together; still universal roles, not a new class.
4. **Sharper nets** — Cycler is judged by newer honesty floors (fillable TBD → Exec/Quality = 2). Part of the “regression” vs organoid green is **better measurement**, not only worse generation. Organoid can score Renders 9 while morphology remains imperfect.

---

## Plan — prove or falsify universality

### This week (do not pause cycler SIGHT)

Continue cell-cycler as the **falsification instrument already in flight**. Residuals (cutaway authenticity, corpus MPNs, thermal self-audit, PCB readiness) *are* the coverage-asymmetry map. Finishing them converts anecdotes into guarded SOURCE rules.

**Label discipline:** until a cold distant-clade probe passes, say **“clade-validated: wet-lab + (partial) bench_power”** — not “universal floor-9.”

### Campaign A — paired twins (same commit)

1. Pin tip + snapshot `forge-truth.db` (+ model/toolchain pins).
2. Cold twins: organoid brief + cell-cycler brief (`STRUCTURAL_CACHE_REUSE=cold`, `PCB_STAGE=1`), independent out dirs, no mid-run patches.
3. Repeat 2–3 seeds each.
4. Predeclared pass: every scored tab ≥9; score surfaces agree; zero fillable HARD TBD; PCB hygiene honest (`FAB-READY — UNPROVEN IN HARDWARE` without HIL); adversarial SIGHT ≥8 on *rendered* PNGs/Excel, not `state.json`.
5. Fix only shared rules; route faults by `basis` / gene, never by product name.

### Campaign B — distant-clade probe (after cycler honest floor-9)

One fresh brief with **no wet genes and minimal bench_power overlap** (e.g. ultrasonic wire bonder / hot-air rework). Zero mid-run patches. Pass bar: floor-9 with ≤3 new SOURCE fixes, all universal + proveCatch. If clade three needs its own 20-pack, universality is implementation-false.

### Campaign C — regression control (cheap, do soon)

Frozen r11 replay against the **DB snapshot**. If replay degrades on live DB, that determinism bug outranks both products.

### proveCatch themes (both clades)

- Signature isolation (exterior partset present; foreign optical tower absent)
- Form closure / interior distinctness across products
- Applicability honesty (dry ≠ fluid sinks)
- PCB closure honesty (pipeline.ok ≠ readiness 9)
- No Goodhart: OOS tabs must not inflate “every tab 9”

---

## STOP list

- New `cell_cycler` class
- Patch either artefact after generation to green the sheet
- Relax cycler gates until the spreadsheet matches organoid
- Count `pipeline.ok` as PCB design fitness
- Treat mesh-name presence as morphology
- Hand-seed two MPNs and declare BoM done
- Declare organoid proof from surviving workbook alone

---

## Terra + Kimi one-liners

- **Terra:** Mechanisms are universal; coverage is asymmetric. Fresh cold organoid is not a promised 9. Paired twins prove or falsify.
- **Kimi:** Agree unproven-not-fake. Continue cycler SIGHT; strike “universal” from scorecard language until a cold distant-clade probe passes; wire frozen-r11+snapshot into CI.

---

## Decision for Tristan

1. **Accept** the diagnosis: organoid 9 ≠ proof of universal cold floor-9.  
2. **Continue** cycler SOURCE/SIGHT (already paying for missing genes).  
3. **Authorize** Campaign C (cheap) + Campaign A when a free twin slot exists.  
4. **Defer** Campaign B until cycler crosses honest floor-9.
