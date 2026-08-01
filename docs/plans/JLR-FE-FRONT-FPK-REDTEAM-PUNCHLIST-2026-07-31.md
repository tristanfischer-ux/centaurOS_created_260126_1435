# JLR FE Front FPK — Adversarial red-team punchlist (2026-07-31)

**Plan:** [`JLR-FE-FRONT-FPK-ADVERSARIAL-REDTEAM-PLAN-2026-07-31.md`](./JLR-FE-FRONT-FPK-ADVERSARIAL-REDTEAM-PLAN-2026-07-31.md)  
**Target:** the **entire process** (brief → contract → multiphysics → assumptions → Bar B → PCB → Blender → Excel → `ship_ok`). Jack email is secondary.  
**Twin artefacts:** `out/formula-e-front-mgu-20260729-1432/_redteam_v2/`  
**Digest:** `_redteam_digest_v2.json` (process surfaces + Jack fill-in xlsx presence)  
**Jack fill-in workbook:** `out/formula-e-front-mgu-20260729-1432/JLR-FE-FRONT-FPK-ASSUMPTIONS-FOR-JACK.xlsx`

---

## Council verdicts (process pass)

| Seat | Model | Verdict | Confidence |
|---|---|---|---:|
| Sol | `openai/gpt-5.6-sol` | **REJECT** | 99 |
| GLM | `z-ai/glm-5.2` | **REJECT** | 92 |
| Kimi | `moonshotai/kimi-k3` | failed → Opus 5 | — |
| Opus 5 (fallback) | `anthropic/claude-opus-5` | parse fail (reasoning still shreds torque math) | — |

**Merged findings:** 55 (11 FATAL from Sol+GLM JSON seats). Gate G2: ≥2 ≠ ACCEPT → pass.

Both JSON seats attack **process coherence / greenwash / EM arithmetic / oil / thermal / Excel** — not the email.

---

## Independent SIGHT (deterministic — not LLM)

| Check | Number | Verdict |
|---|---:|---|
| ω at 19,500 rpm | 2042.0 rad/s | OK |
| Ideal T at 250 kW elec / n_max | **122.43 N·m** | Baseline |
| Twin “required” shaft torque | **125.21 N·m** | ~2% above ideal (η / boundary — MED) |
| FEMM peak loaded \|T\| | **207.12 N·m** | Best position — **not** continuous at n_max |
| Position-sweep mean \|T\| | **118.75 N·m** | **Below** required 125.21 |
| `torque_reliable` | **false** | Must stay on every process surface |
| `duty_torque_screen_ok` | **False** (live twin after SOURCE fix) | **FIXED** — mean &lt; required or `torque_reliable=false` ⇒ fail |
| `ship_ok` / homologation | false / NOT_HOMOLOGATED | Honesty hold OK |
| Gear-oil `cornering_ok` | **False** | Must escalate as architecture blocker |
| Jack xlsx present | yes (~14 KB) | Form exists; ingestion/invalidation not proven |

---

## Fatal findings — accept / challenge / action (process)

| ID | Claim (council) | Verdict | Action |
|---|---|---|---|
| F-EM-1 | `duty_torque_screen_ok=True` while mean 118.75 &lt; required 125.21 | **ACCEPT** | SOURCE: flip screen false unless mean/reliable map clears duty; never pass on peak alone |
| F-EM-2 | Required 125.21 vs T=P/ω 122.43 not identity-locked | **ACCEPT** | One canonical shaft-torque ID + η boundary in contract; all solvers read it |
| F-PROC-1 | Duplicate / sanitised `R-EM-DUTY` omits `torque_reliable` + mean in slice | **ACCEPT** | Digest + multiphysics slice must carry unfavourable fields |
| F-PROC-2 | No revisioned quantity lineage across FEMM / ISO / CFD / CAD / Excel | **ACCEPT residual** | Canonical quantity contract + hashes (process build-out) |
| F-OIL-1 | `cornering_ok=False` not in `architecture_blockers_open` | **ACCEPT** | Escalate to blockers; never say architecture cleared |
| F-OIL-2 | ΔP_jet ≈ 1678 kPa implausible (units?) | **ACCEPT investigate** | Audit SOURCE oil-jet units; fix rule + proveCatch |
| F-TH-1 | T_winding≈67 / T_mod≈71 without published loss ledger | **ACCEPT (honesty)** | Publish W-level loss split on process surface; keep screening label |
| F-XL-1 | Excel LIVE formula floor still weak | **ACCEPT residual** | Carry from prior pass |
| F-PCB-1 | No false Gerber PASS; pipeline_ok can still mislead | **HOLD honest** | Keep forgeDraftOnly; do not mint ship_ok |
| F-BLEND-1 | Renders ≠ solver lineage proof | **ACCEPT residual** | Morphology / cutaway honesty work continues |
| F-ASK-1 | xlsx is a request surface, not controlled overwrite + invalidation | **ACCEPT** | Partner loop: ingest Jack cells → re-stamp → invalidate dependent screens |

---

## Top punchlist (process-ordered)

| # | Item | Status (2026-07-31 SOURCE) |
|---|---|---|
| 1 | **SOURCE EM screen** — `duty_torque_screen_ok=False` when mean &lt; required or `torque_reliable=false` | **FIXED** — `shaft_torque_identity.evaluate_duty_torque_screen_ok` + `build_artifact` + stamp re-eval; twin rewritten False |
| 2 | **Canonical shaft torque** — reconcile 122.43 / 125.21 / mount copies | **FIXED** — `scripts/motor-stack/shaft_torque_identity.py`; ISO/bevel/mount/EM import it |
| 3 | **Unsanitised multiphysics slice** — mean + `torque_reliable` | **FIXED** — stamp twin_bound_case + digest `_slice_mm` whitelist |
| 4 | **Escalate oil cornering fail** | **FIXED** then **CLEARED (screening)** — baffled slosh 30 mm + charge floor ~626 ml; blocker no longer OPEN |
| 5 | **Audit oil-jet ΔP units** (1678 kPa) + proveCatch | **FIXED** then **CLEARED (screening)** — kit Ø1.8 mm nozzles; adversarial Ø1.0 mm still proves gallery FAIL |
| 6 | **Publish loss ledger** on thermal surface | **FIXED** — `_cooling_network_cite` + ABD `R-COOL-NET` Cu/inv/motor/total W |
| 7 | **Excel LIVE** power/thermal formula floor | **FIXED** — proveCatch requires `T_shaft` LIVE cell when power trace present |
| 8 | **Jack xlsx ingestion** | **FIXED** — `ingest_jack_workbook` → overrides + `screens_invalidated`; `--ingest-jack` |
| 9 | **Blender cutaway honesty** | **RESIDUAL** — morphology/exploded continue; not a greenwash of solvers |
| 10 | **Hardware correlation** | **OPEN by design** — never invent XYZ / Gerbers / dyno; `ship_ok` stays false |
| 11 | **Provenance false divergence** (face 58 mm vs module 1 mm) + sourceless `gear_face_mm`/`planet_count` | **FIXED** — `_GEAR_METRIC_GROUPS` + `gear` generic; writeback emits `source_detail`; twin provenance PASS |
| 12 | **ABD pitch greenwash** (“screens torque…” while duty fails) | **FIXED** — `_build_pitch` data-driven; proveCatch rejects screens-torque when duty fails |
| 13 | **Stale SIGHT docs** claiming 0 OPEN / peak≥75% duty pass | **FIXED** — punchlist / Jack results / plain-language / explainer refreshed to live twin |

Live twin after oil SOURCE clear + re-stamp: `architecture_blockers_open` =
**`EM_TORQUE_VS_ROTOR_BORE` only** (`GEAR_OIL_*` CLEARED at screening — baffled 30 mm / Ø1.8 mm / ~626 ml).  
Provenance audit: **0 SOURCELESS / 0 HIGH divergence** (141 quantities, verdict PASS).  
ABD pitch names duty fail + open blockers (no “screens torque” greenwash).  
Canonical close-out steps: [`JLR-FE-FRONT-FPK-BAR-A-BAR-B-CLOSEOUT-TRACKER-2026-07-31.md`](./JLR-FE-FRONT-FPK-BAR-A-BAR-B-CLOSEOUT-TRACKER-2026-07-31.md).

---

## Jack spreadsheet (partner loop)

Stamped at twin:

`out/formula-e-front-mgu-20260729-1432/JLR-FE-FRONT-FPK-ASSUMPTIONS-FOR-JACK.xlsx`

| Sheet | Role |
|---|---|
| Instructions | How to fill; `ship_ok=false` honesty |
| Assumptions (fill) | Grey = our freezes; **yellow** = Jack_status / Jack_value / Jack_notes |
| Results (context) | Read-only screening under current freezes |
| Asks (fill) | Yellow blanks for have_it / attachment / owner |

Selftest proveCatch: `--selftest` asserts fill sheets + blank Jack columns.

---

## What we will *not* do

- Mint `ship_ok` because screens look green  
- Invent XYZ / Gerbers to silence the council  
- Treat email polish as process closure  
- Pass duty on peak FEMM torque alone  

---

## Next verification

After SOURCE fixes (EM screen + oil escalate + torque identity):

```bash
python3 scripts/lib/fpk_assumption_based_design.py --twin out/formula-e-front-mgu-20260729-1432
python3 scripts/fe-front-build-redteam-digest.py
python3 scripts/fe-front-redteam-council.py
```

Re-attack until fatals on process coherence / greenwash drop; email stays out of the critical path.
