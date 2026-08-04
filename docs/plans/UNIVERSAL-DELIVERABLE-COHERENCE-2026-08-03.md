# Universal deliverable coherence (no more from-scratch restamps)

**Why:** F1 / R1 / R2 / R5 were the same defect class — a frozen decision or
gate result lived in one store while the twin, workbook, or pack kept an older
snapshot. Fixing each by hand does not scale.

## Automatic choke points

| When | What runs | Prevents |
|---|---|---|
| **Before Excel** (`fe-front-autonomous-pipeline` / `continue` stage 3) | `apply_frozen_decisions.py --twin` | Twin still continuous while DEC-008 frozen; also syncs `10-decision-register.json` → `state.decisionRegister` |
| **Excel build end** | pack SHA must equal `dossier.xlsx` or exit 49 | Pack zip older than workbook (R2) |
| **After Excel** (pipeline) | `check_deliverable_coherence.py --enforce` | Workbook magnet ≠ twin; pack ≠ workbook; frozen DECs unapplied; drawingGates stale; Decision Register missing freezes |
| **Drawing gates write** | syncs `state.drawingGates` ← `drawing-gates.json` | state says fail while JSON says pass (R5) |
| **pre-commit + verify-engine-guards** | selftests for all of the above | regressions |

## Commands you should not need to invent again

```bash
# Apply every frozen decision that has a handler (idempotent)
.venv/bin/python scripts/lib/apply_frozen_decisions.py --twin out/<run>

# Prove twin ↔ workbook ↔ pack still line up
.venv/bin/python scripts/lib/check_deliverable_coherence.py --twin out/<run> --enforce

# Rebuild customer surfaces (also rebuilds pack in the same process)
PYTHONHASHSEED=0 .venv/bin/python scripts/build-excel-export.py out/<run>
```

## Adding a new frozen decision

1. Record it in `10-decision-register.json` with `status: FROZEN_UNDER_ASSUMPTION`.
2. Register a handler in `scripts/lib/apply_frozen_decisions.py` `HANDLERS`:
   - `is_applied(twin) -> bool`
   - `apply(twin) -> dict` (idempotent restamp)
3. Until a handler exists, `check_deliverable_coherence` **fails** with
   `frozen_decision_not_applied` / `handler_missing` — that is intentional.

DEC-008 handler: `apply_dec_008_duty_restamp.py` (intermittent peak + magnet vignette).  
DEC-009 handler: `apply_dec_009_em_restamp.py` (24,000 rpm / 130 mm stack; magnet ~99.4 °C under DEC-008 duty; torque ratio 1.069 MEASURED).

Both freezes also require the Decision Register file→state sync so the Excel
**Decision Register** tab shows DEC-008/009 (it reads `state.decisionRegister`
only — writing the JSON file alone is not enough).

## What this does not do

- Does not mint `ship_ok`
- Does not close Bar B holds
- Does not invent chassis XYZ / Gerbers / dyno data
- Does not re-solve FE/CalculiX — DEC-009 stamps measured option-screen inputs
