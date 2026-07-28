# Cold miss-path measurement — class-keyed contamination fork settled

**2026-07-27 · Cursor lane · artefact `out/cell-cycler-cold-v1c`**
**Status: MEASURED. Fork settled. Next work is bootstrap/generator admission, not better cache keys.**

---

## 1. What was measured

Council question (Fable): *if miss-path plausibility stays ≤3–4, the keying direction was a distraction and the failure was never really about caches.*

Protocol:

| Knob | Value |
|---|---|
| Brief | `briefs-loop/benchtop_cell_cycler.md` |
| Class | `consumer_electronics` (unchanged — no new class) |
| `STRUCTURAL_CACHE_REUSE` | `cold` (all three stores skip reuse) |
| `STRUCTURAL_CORPUS_NEIGHBOURS` | `0` (no neighbour-class graphs in harvest) |
| Fossils | quarantined=`1` in forge-truth.db |
| Code | `0c9076c5e` (`structural-cache-policy.ts`) |

---

## 2. Scores (SIGHT of the skeleton critique)

| Run | brief | plaus | coh | part | honesty | Headline disease |
|---|---|---|---|---|---|---|
| **Warm v1** (class reuse) | 1 | 1 | 2 | 2 | 3 | Microgravity bioreactor + 200 kW HX pasted onto a desk cycler |
| **Warm v2** (class reuse) | 2 | 2 | 4 | 1 | 5 | Multi-thousand-£ industrial thermal hallucination |
| **Cold v1c** (this measurement) | **4** | **3** | **5** | **2** | **8** | Liquid cooling loop on air-cooled Peltier; missing AFE; missing 8× channel safety |

Cold log proofs of miss-path (not reuse):

```
[tool-creation] STRUCTURAL_CACHE_REUSE disabled — skipping proposal cache
[bootstrap-tool-plan] … reused=false … Selected: … tec:peltier-sizing, instrumentation:adc-resolution …
  (no ht:ntu-heat-exchanger, no gimbal / microfluidics tools)
[bootstrap-class-graph] STRUCTURAL_CACHE_REUSE disabled
[generic-emitter] … reused=false … bootstrap-candidate@v1
```

---

## 3. Verdict — the fork

**Fable’s disproof condition is met: cold plaus = 3 (≤3–4).**

| Claim | Result |
|---|---|
| Structural caches were silent class inheritance | **Confirmed** — cold removed gimbal / microfluidics / industrial HX tools |
| Caches were the *remaining* disease | **Rejected** — cold still fails brief fidelity and plausibility |
| Fix = better hash / application-scoped keys | **Demoted** — containment only; not the destination |
| Fix = brief→structure bootstrap + admission invariant | **Promoted** — remaining defects are generator duties, not donor fossils |

Cold improved honesty (3→8) and removed the most embarrassing donor anatomy. It did **not** produce a design an engineer would trust: liquid `mass_fluid_transport_process` words on an air-cooled Peltier instrument, no precision AFE for 0.05%/0.1% accuracy, no per-channel OV/UV/OC/OT/reverse-polarity hardware paths, switching buck-boost where the brief asked for linear-assisted discharge.

---

## 4. What this does *not* say

- It does **not** say “the engine can’t design a novel brief.” It says the cold generator is weak and must be fixed at SOURCE.
- It does **not** license re-enabling cross-product structural reuse. Fossils stay quarantined; cold flags stay available.
- Gate 25 (`"2000"` literals vs £2000 ceiling) aborted the full chain after the skeleton — orthogonal; not scored as contamination.

---

## 5. Landed after measurement (same session)

| Piece | Where |
|---|---|
| Gate **39** structural admission (class-only + device-scale liquid/HX magnitude) | `scripts/lib/structural-admission-gate.ts` — shadow default; `STRUCTURAL_ADMISSION_ENFORCING=1` blocks |
| Bootstrap nodes require non-class-only `justified_by` | `validateBootstrapGraph` |
| Device-scale magnitude at harvest | `validateGraphMagnitudeAgainstBrief` — rejects `mass_fluid_transport_process` / `cooling_loop` without liquid brief duty; rejects gimbal/microfluidics without brief support |
| Cold SIGHT | Gate 39 **FAIL**s on `out/cell-cycler-cold-v1c` liquid words (Pipework Run / Distribution Manifold / Expansion Reservoir) — proveCatch held |

## 6. Landed after bootstrap floor (same campaign)

| Piece | Where |
|---|---|
| Universal bench-power instrument skeleton floor | `derive-skeleton.ts` — `hasBenchPowerInstrumentSignal` (channels + source/sink + accuracy + Peltier/linear + device-scale power). **Not** a `cell_cycler` class. |
| Bench floor before thermocycler | Shared `tec:peltier-sizing` was forcing PCR sample-block floors onto the cycler |
| **OV/UV electrical vs UV disinfection homonym** | `universal-contract-sizing.ts` — bare `\buv\b` exploded "Ov UV Comparator Latch" into Process Unit / manifolds / dosing lamp. Fixed via `isElectricalOverUnderVoltagePhrase` + SUB_ASSEMBLY `match` predicate; floor renamed `over_under_voltage_comparator_latch`. proveCatch: `f1a-ov-uv-electrical-selftest.ts` |

### Cold re-runs after floor

| Run | brief | plaus | coh | part | honesty | Notes |
|---|---|---|---|---|---|---|
| Cold v2 | 3 | 4 | 2 | — | — | AFE + cutout + linear + Peltier present; **safety polluted** by UV explode |
| Cold v2b | 3 | 2 | 2 | 4 | 6 | Same Process Unit / Manifold / Dosing pollution (FAIL_FAST) |
| Cold **v3** | **7** | **7** | **9** | 5 | **10** | OV/UV fix: zero Process Unit pollution. ONE HIGH: C14/PSU missing (floor was on absent `energy_storage`) |
| Cold **v4** | **8** | **7** | **9** | 5 | **10** | C14 on PD ✓. Self-audit floor 3 (FN3359 400 A; £0 lines; 27 V→5 V). Blender first picked **thermocycler** tip-back (Peltier vocab) → clipboard; form fix → sealed `bench_power` |

## 7. Landed mid-campaign (Terra / Kimi advice)

| Piece | Where |
|---|---|
| Pass-bank cooling fan colocated with heatsink | `BENCH_POWER_ENERGY_CONVERSION_FLOOR` |
| Device EMC ampacity (reject 3φ / >16 A filters) | `dbHitAcceptableForWord` + `emitter-mispin-selftest` |
| `is_bench_power_instrument_form` before thermocycler | `instrument_form_grammar.py` + Blender LE signature `bench_power` |

## 8. Next (ordered)

1. Cold-v5 full chain with all SOURCE fixes; SIGHT hero (cell bay / C14 / display) + Excel tabs.
2. PCB architecture (`no_boards` → real boards) + firmware honesty ceiling without HIL.
3. **Only then** revisit whether same-input memoization caches earn their keep.

Entry docs: `CLASS-KEYED-CONTAMINATION-REPORT/COUNCIL-2026-07-27.md`.
