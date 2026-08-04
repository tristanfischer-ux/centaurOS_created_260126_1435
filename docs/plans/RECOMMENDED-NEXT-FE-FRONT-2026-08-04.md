# Recommended next steps — FE Front (2026-08-04)

**Author:** Grok (executing). Tristan: follow these unless you override in writing.  
**Aim:** high-quality twin honesty and a defensible path to Bar A — not a fast green stamp.

---

## What is already true (evidence)

| Fact | Evidence |
|---|---|
| Today’s kit-case code is innocent on frozen 08-02 geometry | Path A run 2: mean **81.558081**, magnets 6×22.5, 0 sign reversals |
| DEC-009 kit-case FE is sign-stable with correct magnets | Path B: mean **122.100**, 6×22.5, 130 mm, 24k rpm, 535 A, 0 reversals |
| Analytical shaft need at 24k / 250 kW (twin η) | Path B `required_shaft_torque_nm` = **104.099** |
| Mean vs that need | **1.173×** |
| Mean vs old binding 125.215 | **0.975×** |
| Why `duty_torque_screen_ok` is still false | Kit-case **hardcodes** `torque_reliable=False` until dyno/map close — fail reason is only that, **not** short torque vs 104 |

---

## Recommendations (do these, in order)

### R1 — Publish **two** torque bars (do not collapse them)

| Quantity | Value | Role |
|---|---|---|
| `architecture_duty_shaft_torque_nm` | **104.099** | Correct physics bar at DEC-009 freeze (24k, 250 kW, twin η). Path B mean clears this. |
| `binding_duty_shaft_torque_nm` | **125.215** | Conservative REBALANCED / pre-24k ledger bar. Keep until a written DEC retires it. Path B mean does **not** clear this. |

**Why:** Using only 125.2 at 24k mixes a superseded speed’s torque with the adopted architecture (the Q2 hole). Using only 104 and deleting 125.2 erases the conservative ledger. High quality = both, named.

### R2 — Adopt Path B mean as kit-case FE label (SIGHT-candidate, not duty-clear)

Stamp:

- `last_sign_consistent_kit_case_fe_mean_nm` = **122.100**
- `last_coherent_kit_case_fe_mean_nm` = **122.100**
- basis: sign-consistent Path B kit-case mean; **not** `duty_torque_screen_ok`; **not** `torque_reliable`

**Why:** Twin still shows 81.56 (pre-DEC-009 REBALANCED). That is now wrong as the “latest kit-case” label after Path B.

### R3 — Keep product torque as option-screen product (for now)

Leave `mgu_fe_shaft_torque_nm` basis = `option_screen_product_not_kit_case_fe` until a separate DEC says product = kit-case FE.

**Why:** Collapsing product into FE without a decision reintroduces the honesty bug we just fixed.

### R4 — Do **not** mint `duty_torque_screen_ok` or `ship_ok`

`torque_reliable` is intentionally false until dyno/map. Forcing it true in code to green the screen would be greenwash.

**Why:** High-quality Bar A needs either real reliability evidence or an explicit A-DUTY freeze that *names* the open residual — not a silent flag flip.

### R5 — Bar A stays **open**; record Path B as FE SIGHT-candidate under dual bars

Tracker language:

- Architecture FE: Path B sign-stable mean **122.1** at 24k/130/6×22.5  
- Clears architecture bar 104.1 at 1.17×  
- Does not clear conservative binding 125.2  
- Duty screen open: `torque_reliable` gated on dyno/map by design  
- `ship_ok` false  

### R6 — After twin restamp: coherence check (+ workbook if pack drifts)

Run `check_deliverable_coherence` enforce. Refresh workbook only if coherence fails on stamped fields.

### R7 — Later (not this pass)

| Item | When |
|---|---|
| Dyno / map path to `torque_reliable=true` | Partner / test plan |
| DEC to retire 125.2 binding in favour of 104.1 only | After stakeholders accept dual-bar reading |
| MemPalace drawer rewrite | After twin labels match Path B |
| Bar A close under A-DUTY or true duty screen | After R1–R5 recorded and reviewed |

---

## Explicit non-goals this pass

- No `ship_ok`  
- No Bar A close  
- No editing `em_fia_front_kit_case.py` to force `torque_reliable=true`  
- No overwriting failed `*_DEC009.json`  
- No inventing dyno correlation  

---

## Execution log

| When | What |
|---|---|
| 2026-08-04 | Path A match + Path B coherent (prior commits) |
| 2026-08-04 | This plan; stabilize extended for Path B + dual bar; twin restamp |
