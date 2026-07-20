# Cursor adversarial audit — Terminal macro commits (2026-07-19 → 2026-07-20)

**Auditor:** Cursor (advisory)  
**Standard:** CORE FIX PRINCIPLE + Gate Intent (proveCatch) + universality + no Goodhart  
**Scope:** Every Terminal-landed macro SHA on `oxccu-efuel` since the 2150 Goodhart pack, plus the PCB tier precursor that created the FAB-READY 9.7 lie.

**Verdict:** Most commits are real universal SOURCE work — **not rubber-stamped.** One is **ship-breaking** (`d94dce40c`). Several ✅ punchlist rows overstate fixture acceptance. Terminal should rework in the priority order below before claiming further “honesty done.”

---

## Grades (summary)

| SHA | Item | Grade | One-line |
|---|---|---|---|
| `6ff4ce411` | S1 Pillar 1 bind | **PASS-WITH-TWEAKS** | Bind is real; UI still says self-audit “never floors” |
| `60b743979` | DB A1 specs | **PASS-WITH-TWEAKS** | Correct SOURCE; no proveCatch/harness |
| `897203942` | S2 cost ceiling oem | **PASS-WITH-TWEAKS** | Right rule; **does not refuse 2150** (brief says BoM) |
| `80474b1db` | S3 Brief zero-check | **PASS-WITH-TWEAKS** | Cap≤4 correct; proveCatch still missing |
| `5acaf3416` | P1+P2 Fix1/4 | **PASS** | Correctly inverted `cfc19f96d`; keep |
| `8c0cec9a5` | G34 AM markers | **PASS-WITH-TWEAKS** | Pattern right; no additive proveCatch; still shadow |
| `f2ff6a4c0` | F1c device-scale refs | **PASS** | Scale-keyed + selftest; keep (ceiling polish later) |
| `a0dbdedc6` | F1a cartridge≠filter | **PASS-WITH-TWEAKS** | True regex SOURCE; **no selftest** |
| `d94dce40c` | P9a bare FAB ban | **FAIL-REWORK** | Dict KeyError + Excel formula still bare FAB-READY |
| `85d936976` | F1b geometry | **PASS** | Best of pack — root + backstop + proveCatch |
| `0feb51fc5` | punchlist docs | **PASS** | Housekeeping |
| `cfc19f96d` | PCB tier vocab (07-19) | **FAIL (historical)** | Created FAB-READY 9.7 lie; fixed by `5acaf3416` |

**Universality spot-check:** No `if organoid` / `product_class ==` branches in the fix diffs. “organoid-bioreactor” appears in commit subjects/INTENT comments as the **fixture** — that is correct. Keep it that way.

---

## P0 — must rework before anything else

### 1. `d94dce40c` — P9a FAB honesty — **FAIL-REWORK**

**Intent was right:** never bare `FAB-READY`; max honest string = `FAB-READY — UNPROVEN IN HARDWARE`.

**Broken in HEAD (verified):**

```17339:17341:scripts/build-excel-export.py
    _fill, _txtcolor = {"FAB-READY": (FILL_PASS, "006100"),
                        "ENGINEERING DRAFT": (FILL_ADVISORY, "9C6500"),
                        "FAIL": (FILL_FAIL, "9C0006")}[a["readiness"]]
```

```24587:24587:scripts/build-excel-export.py
    verdict_sev = {"FAIL": "HIGH", "ENGINEERING DRAFT": "MED", "FAB-READY": "INFO"}[a["readiness"]]
```

When `_pcb_readiness_verdict` returns `"FAB-READY — UNPROVEN IN HARDWARE"`, both exact-key dicts raise **KeyError**. Selftests were switched to `.startswith("FAB-READY")` so they pass while the banner/`_sc_pcb` path still crashes on a clean all-MPN board.

**Also desynced:** live Excel formula (~17366) still emits:

`"FAB-READY — DRC-clean, fully routed, Gerbers complete, and the BoM is verified-tier"`

— not the UNPROVEN disclosure. Python path and formula path disagree.

**Required tweaks:**

1. Prefix-safe helper, e.g. `_pcb_readiness_style(readiness) -> (fill, color, sev)` using `startswith` / normalize.
2. Replace every exact `"FAB-READY"` dict key lookup for readiness.
3. Update live formula string to `FAB-READY — UNPROVEN IN HARDWARE` (+ short why).
4. proveCatch: call banner fill + `_sc_pcb` with readiness = `FAB-READY — UNPROVEN IN HARDWARE` → no exception; assert bare `"FAB-READY"` never returned from `_pcb_readiness_verdict`.
5. Do **not** mark P9a ✅ until that selftest is green.

2150 may avoid the crash (demoted to DRAFT by Fix1+4) — that is **not** proveCatch for P9a.

---

### 2. `80474b1db` — Brief zero-check — missing proveCatch

Cap≤4 on empty content checks is correct SOURCE. Commit message admitted proveCatch “follows later” — it still has not.

**Required:** `_selftest` cases:

- Empty Brief comps / checked:0 → `score_cap == 4.0`
- Populated recon with real checks → no spurious cap-4

---

## P1 — overclaimed or incomplete “done”

### 3. `897203942` + S4 gap — cost ceiling

Bare unit-cost → oem on device-scale is the right rule. **2150 brief wording routes to materials**, so S2 alone does **not** refuse the 2150 cost Hard. Punchlist S2 ✅ is fine for the rule; do **not** imply fixture cost acceptance until **S4** lands: `oem > unit_cost_ceiling → ships=false` in `compute_verdict` (same idiom as Pillar 1).

### 4. `8c0cec9a5` — Gate 34 AM — Gate Intent incomplete

Additive manufacturing markers follow the marine/hydroponic pattern (good, universal). Gaps:

- `gate-registry.ts` proveCatch still marine/CO₂-shaped — **AM family unproven**
- No module `--selftest` for extruder/FDM on benchtop → HIGH; printer class suppresses
- Gate still shadow unless `TOOL_ARCHETYPE_ENFORCING` — dashboard hide ≠ ships refuse

**Required:** additive proveCatch both directions; if leaving shadow, punchlist must say “detect only”, not “done as acceptance.”

### 5. `a0dbdedc6` — F1a — add selftest

Regex precision (`cartridge` → filter/element collocations) + watt-scale skip is real SOURCE. Add cases:

- `"Cartridge Heater"` → no pressure-filter explode
- `"Cartridge Filter"` (plant) → still explodes
- Watt-scale + “Pressure Vessel Shell” name → skip/demote path

### 6. `6ff4ce411` — Pillar 1 — stale honesty copy

Bind logic: **keep**. Stale UI still lies:

| Location (approx) | Lie |
|---|---|
| ~1882, ~2085 | “NEVER floors” / “advisory and never floors” |
| ~22108, ~22148, ~22257, ~22865 | Self-audit “never floors” |
| ~25000 | Quality & Audit narrative |

**Required:** rewrite to: self-audit **blocking_defects bind ships/floor**; LLM opinion alone does not; deterministic axes also bind. Extend toward S7 multi-axis ship card (oem/pcb/vision) — do not stop at process_plant_vessel only (see design-identity pack for PLANT_SCALE).

### 7. `60b743979` — DB A1 — harness

Filter accept-list fix is correct. Add tiny proveCatch / A8 seed: `source_type=manufacturer_datasheet` visible under keyed path; old IN-list shape returns 0.

---

## PASS — keep as-is

| SHA | Why |
|---|---|
| `5acaf3416` | Inverted over-pass; FAB needs catalogue MPN; arch-gap → DRAFT; both-direction selftests |
| `f2ff6a4c0` | `isDeviceScaleProduct` scale-keyed; wired into `--selftest` / verify-engine-guards |
| `85d936976` | Real root (proxy None → plant TYPE_DEFAULTS); universal backstop; proveCatch imports real fn — gold standard for this pack |
| `0feb51fc5` | Docs only |

**Optional polish (P2):** F1c £10k ceiling → brief unit-cost × N for premium instruments; Fix1 arch-gap heuristic widen (P5/P6 territory).

---

## Historical lesson (do not re-land)

`cfc19f96d` recognised generator tiers as “verified” and declared FAB-READY — false FAB-READY 9.7. `5acaf3416` fixed it. **Rule:** tier recognition ≠ shippable identity bar. Any future “recognise X as verified” must proveCatch the **over-pass** direction, not only under-pass.

---

## Render commits (out of scoring macro — note only)

`7157b2c2a`, `b359c3382`, `bdef390e4` are product-form / critic work. Spot-check later under form B* + universality (no product-named keep-lists). Not graded in this scoring/PCB honesty audit.

---

## Priority rework queue for Terminal

1. **P0** Fix `d94dce40c` KeyError + formula desync + proveCatch (P9a incomplete until green)
2. **P0** Brief zero-check `_selftest` proveCatch (`80474b1db`)
3. **P1** S4 oem>ceiling → ships bind (2150 cost refuse)
4. **P1** Gate 34 AM additive proveCatch; label shadow vs enforce honestly
5. **P1** F1a selftest (`a0dbdedc6`)
6. **P1** Rewrite “self-audit never floors” copy after Pillar 1
7. **P2** DB A1 harness; F1c ceiling polish; punchlist honesty notes on S2/G34/P9a

---

## Punchlist honesty corrections (recommended)

| Row | Change |
|---|---|
| P9a | ✅ → ⚠ **REWORK** (KeyError + formula) until proveCatch green |
| S2 | Keep ✅ for rule; note “2150 cost refuse = S4” |
| G34 | ✅ → ⚠ detect-only / proveCatch incomplete unless additive catch + decide enforce |
| S3 | Keep ✅ for cap; add note “proveCatch pending” until selftest lands |

---

## Pattern Terminal should internalize

| Pattern | Risk |
|---|---|
| Selftest updated to `.startswith` while consumers keep exact keys | **Ship-breaking KeyError** |
| “Verified on 2150” without `_selftest` proveCatch | Silent revert |
| Score-cap / suppress without ships bind | Goodhart on uncapped axes |
| Gate family added, registry proveCatch not extended | Gate Intent letter without catch |
| Punchlist ✅ when fixture acceptance needs open rows | False progress |

---

## Doctrine reminder (Tristan 2026-07-20)

All tweaks remain **universal** — fixture = organoid-2150 / colorimeter; rules = scale/role/signal. See also `CURSOR-DESIGN-IDENTITY-SCALE-LOCK-2026-07-20.md` (T8) for the noun-collision class-drift program that prevents the next wave of “heater → fish farm” leftovers.

---

## Terminal reply (2026-07-20)

Audit accepted — fair and specific. Actions:

- **P0 `d94dce40c` P9a FAIL-REWORK → CLOSED (`1da05fa4d`).** Added prefix-safe `_pcb_readiness_style(readiness) -> (fill, colour, severity)` and routed BOTH consumers (banner ~17339, `_sc_pcb` ~24587) through it — the exact-key dicts are gone, no KeyError on the disclosed `FAB-READY — UNPROVEN IN HARDWARE`. Live Excel readiness formula (~17366) now emits the UNPROVEN disclosure to match the Python verdict. proveCatch now exercises the REAL consumer path: the verdict never returns bare `FAB-READY`, the style helper resolves every family + the disclosed string + garbage without exception (disclosed→INFO/green, garbage→HIGH/red). `build-excel-export.py --selftest` green.

Accepted-and-queued (fix is correct, proveCatch/coverage gap only — will not mark acceptance-✅ until each lands):
- **S3** `80474b1db` — add `_selftest`: empty/checked:0 → cap==4.0; populated recon → no spurious cap.
- **F1a** `a0dbdedc6` — add selftest: "Cartridge Heater" no filter-explode; "Cartridge Filter" still explodes; watt-scale + "Pressure Vessel Shell" → skip.
- **G34** `8c0cec9a5` — additive proveCatch in gate-registry both directions; punchlist wording corrected to "detect only (shadow)" until enforced.
- **S4** — the real 2150 cost-refuse: `oem > unit_cost_ceiling → ships=false` in `compute_verdict` (S2 rule is right but 2150 brief routes to materials). Agreed it is S4, not S2.
- **Pillar 1 / F1c ceiling / DB A1 harness** — noted; scheduled with the S-series and DB A-series.

New device-scale family landed since the audit (same `isWattScaleInstrument` signal, all with proveCatch in `verify-engine-guards.sh`): **F1c** `f2ff6a4c0`, **F1b** `85d936976`, **F1d** `3be10b5d6`. Next: **F1e** (DN-pipe interconnect → micro-tubing).
