# FE Front — Grok takeover + stabilise (2026-08-04)

**Owner:** Grok Build  
**Twin:** `out/formula-e-front-mgu-20260729-1432`  
**Status:** **STABILISED** (re-confirmed 2026-08-04 ~09:14 BST)  
**ship_ok:** **false** (held)

## Live snapshot (2026-08-04 ~09:26 BST) — after council feedback

| Field | Value | Basis |
|---|---|---|
| `binding_duty_shaft_torque_nm` | **125.214912** | `rebalanced_required_shaft_torque_nm` (one bar = REBALANCED analytical) |
| `last_sign_consistent_kit_case_fe_mean_nm` | **81.558081** | sign-consistent mean; **torque_reliable=false**; **duty_torque_screen_ok=false**; ratio 0.651 |
| `last_coherent_kit_case_fe_mean_nm` | same value | historical key; basis `kit_case_sign_consistent_mean_not_duty_clear` |
| `mgu_fe_shaft_torque_nm` | **133.854741** | `option_screen_product_not_kit_case_fe` = binding × 1.069 |
| baseline magnet / active | 6.0×22.5 mm / 97.58 mm | REBALANCED pre-DEC-009 geometry |
| Workbook/pack | **V1.290** | coherence enforce **PASS** |
| ship_ok | **false** | held |
| twin_write_guard | wired into restamp/stabilise/frozen writers | **not** every twin writer in the repo (scope limit, recorded) |


Tristan ordered: precise plan → tell Terminal → take over → **stabilise**.  
Terminal had done real morning work first; that work is **kept** and folded in below.

---

## Success criterion

The twin tells **one honest story** a second engineer can trust:

1. Architecture freezes (DEC-008 duty, DEC-009 24k/130) remain recorded.  
2. No quantity pretends to be **kit-case FE SIGHT** when it is an **option-screen product**.  
3. Pre-DEC-009 baseline lineage is recoverable from **disk artefacts**, not `None`.  
4. **One binding duty torque bar** is named on the contract.  
5. Customer pack **SHA matches** the DRAFT workbook.  
6. `ship_ok` stays **false**. Bar B holds stay **OPEN**.  
7. **`em_fia_front_kit_case.py` is not edited** (Cursor HOLD R8).

---

## Part A — Terminal morning work (keep; do not reverse)

Done by Terminal Claude **before / alongside** Grok takeover. Useful; folded into the programme of record.

| When (BST) | Artefact | What | Disposition |
|---|---|---|---|
| ~08:13 | `scripts/lib/physics_plausibility.py` | **R5:** shaft power vs **duty cap** (250), not 350 HW envelope — stops false “70% of label” chase | **KEEP** |
| ~08:23 | **`scripts/lib/twin_write_guard.py`** (new) | Twin `state.json` writes require an **OPEN** discipline stage (plan-fit + start council, no finish yet). Override leaves a scar in `_discipline/guard-overrides.jsonl` | **KEEP** — wire into all writers later |
| ~08:35 | `scripts/motor-stack/em_fia_mtpa_screen.py` | Import **canonical** `rotor_frame_current_angle_deg` from kit_case (one tracking rule; delete silent duplicate) | **KEEP** — correct hardening |
| ~07:47–08:26 | `_motor_stack/em_fia_*_DEC009.json` | DEC-009 geometry FE attempts | **KEEP on disk as failed experiments** — **do not quote as SIGHT** (sign reversals / `torque_reliable=false`) |
| ~08:34–08:47 | `_discipline/bar-a-*`, `excitation-bisect-*` | Start councils; bisect **blocked** by grok45 + minimax + sol (under-specified provenance; turns 7-vs-4 misread) | **KEEP** — council was right to block |
| earlier | restamp first-write-wins; rear alias `source_detail` | Lineage / labelling honesty | **KEEP** |

### Terminal mistakes (already corrected or contained)

| Issue | Status |
|---|---|
| Wrong first theory: MTPA missing 15° axis as *cause* of DEC-009 incoherence | Withdrawn; for 24s/8p axis is zero — still keep the one-tracking-rule import |
| `mgu_fe_shaft_torque_nm` ≈ 133.85 as if kit-case FE | **Fixed by Grok S1** — now option-screen product |
| Non-idempotent restamps wiped baseline magnet | **Fixed by Grok S4** from REBALANCED disk |
| Hybrid geometry FE (08-02 radials + 130 mm stack) | Artefacts retained as failed; **no further hybrid bisect** without provenance freeze |

### Terminal process after stop order (~09:02 check)

- Twin disk: **idle** (no FE/excel/discipline writers).  
- PID 70197 (`opus-4-6`) may still be **chat-alive** at `$HOME` with MCP — not holding twin files. Tristan may exit that session for a hard stop.

---

## Part B — Grok stabilise (this takeover)

### In scope

| ID | Action | Status | Evidence |
|---|---|---|---|
| **S0** | Inbox: Grok owns twin stabilise; Terminal/Cursor HOLD competing edits | ✅ | `CURSOR-HARNESS-INBOX.md` TAKEOVER + STABILISE_DONE + POST-STOP |
| **S1** | Relabel `mgu_fe_shaft_torque_nm` as **option-screen product** (duty × ratio), not kit-case FE | ✅ | basis=`option_screen_product_not_kit_case_fe` · value **133.859432** |
| **S2** | Publish `last_coherent_kit_case_fe_mean_nm` from REBALANCED | ✅ | **81.558081** · sign_reversals=0 |
| **S3** | Publish **one** `binding_duty_shaft_torque_nm` | ✅ | **125.2193** · basis=`binding_conservative_19500_class_identity` |
| **S4** | Repair `dec_009_baseline_reference` from disk | ✅ | magnet **6.0×22.5 mm**, active **97.58**, rpm **19500**, stack **98.33**, cont. magnet **159.235** |
| **S5** | DEC-009 residual: architecture freeze stands; **FE kit-case SIGHT open** | ✅ | register + workbook DR · status still `FROZEN_UNDER_ASSUMPTION` |
| **S6** | Sync `10-decision-register.json` → `state.decisionRegister` | ✅ | 9 rows |
| **S7** | Rebuild Excel+pack; coherence pack==workbook | ✅ | **V1.289** · enforce **PASS** (0 findings) |
| **S8** | Harden `apply_dec_009_em_restamp.py` product basis / caveats | ✅ | selftest OK |
| **S9** | Cull Saturday `until ! pgrep em_fia` zombie waiters | ✅ | culled |
| **S10** | Idempotent re-run of stabilise after Terminal morning inventory | ✅ | **2026-08-04T08:14:24Z** · audit refreshed · coherence still green |

### Tooling

| Path | Role |
|---|---|
| `scripts/lib/stabilize_fe_front_honesty.py` | Idempotent twin honesty pass + selftest |
| `out/.../_motor_stack/stabilize_fe_front_honesty.json` | Audit stamp (latest apply) |
| `scripts/lib/apply_dec_009_em_restamp.py` | Future restamps cannot re-mint “MEASURED FE” ambiguity on product torque |
| `scripts/lib/check_deliverable_coherence.py` | Twin ↔ workbook ↔ pack |

### Customer surfaces (current)

| Artefact | Path |
|---|---|
| Workbook | `20260804-0856-V1.289-DRAFT-formula-e-front-mgu-engineering-workbook.xlsx` |
| Design pack | `20260804-0856-V1.289-formula-e-front-mgu-design-pack.zip` |
| Coherence | `ok=true`, findings=0 (re-checked after S10) |

### Out of scope (still)

| ID | Why not now |
|---|---|
| **X1** | Re-solve `em_fia_front_kit_case` at DEC-009 | Cursor HOLD; needs provenance-frozen plan |
| **X2** | Close Bar A / mint ship_ok | No coherent FE at freeze |
| **X3** | MemPalace rewrite (R7) | After contract and FE agree |
| **X4** | Hybrid geometry / excitation bisect | Council blocked; do not reopen casually |
| **X5** | Commit/push | Tristan did not ask |
| **X6** ✅ | Wire `twin_write_guard.assert_stage_open` into restamp + stabilise + frozen-decisions writers | Done 2026-08-04 — `apply_dec_008/009`, `stabilize_fe_front_honesty`, `apply_frozen_decisions` |

---

## Explicit non-goals

- Not quoting torque from `em_fia_front_kit_case_DEC009.json` or DEC009 MTPA as Bar A proof.  
- Not treating option-screen **1.069×** as proof the live kit-case clears duty.  
- Not collapsing 350 HW class to 250 (Cursor R4).  
- Not editing `em_fia_front_kit_case.py`.

---

## Re-verify commands

```bash
.venv/bin/python scripts/lib/stabilize_fe_front_honesty.py --selftest
.venv/bin/python scripts/lib/stabilize_fe_front_honesty.py --twin out/formula-e-front-mgu-20260729-1432
.venv/bin/python scripts/lib/check_deliverable_coherence.py --twin out/formula-e-front-mgu-20260729-1432 --enforce
```

---

## Next (only when Tristan assigns)

1. **Optional:** wire `twin_write_guard` into restamp + stabilise writers.  
2. **FE:** provenance-frozen 08-02 replay **or** clean DEC-009 geometry solve — **Cursor** owns kit_case.  
3. MemPalace after FE and contract agree.  
4. Commit stabilise tooling + Terminal morning keepers when asked.

---

## Inbox trail

| Tip | Meaning |
|---|---|
| Grok ~09:00 TAKEOVER | Terminal stop competing twin work |
| Grok ~08:57 STABILISE_DONE | First stabilise complete (V1.289) |
| Grok ~09:05 POST-STOP CHECK | Twin idle after Tristan stop order; Terminal process may still be chat-alive |
| This plan S10 | Morning work inventoried; stabilise **re-run** 09:14; still green |
