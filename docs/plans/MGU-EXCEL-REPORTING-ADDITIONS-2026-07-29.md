# MGU Excel reporting — what to add (SOL 2026-07-29)

**Ask:** Any additional reporting for the Excel dossier? What and how?
**Consult:** gpt-5.6-sol-high (subagent).
**Verdict:** Extend three existing universal tabs — do **not** add a PHANTM mega-sheet or new sheet count.

---

## Verdict

The 2340 gap is **closure and traceability**, not missing tabs. Prefer **EXTEND** over new sheets.

## Decisions

| Candidate | Decision | How |
|---|---|---|
| DVP&R / verification plan | **EXTEND Verification** | Columns: Requirement ID, Method, Evidence tier, Owner, Evidence reference, Next action. Source: brief constraints, contract quantities, tool `worked[]`, drawing/PCB gates, holds, Decision Register. Universal by requirement/evidence type. |
| Critical operating-point matrix | **EXTEND Calculations** | Block rows: Condition, Duration/share, Speed, Torque, Vdc, Phase A_rms, Electrical/shaft power, Loss, Efficiency, Coolant, Winding/Magnet °C, Margin/status, Source. From motor/inverter/gear/duty tools. Universal when operating-point signals exist. |
| Vehicle-boundary interface control | **EXTEND Connection trace** | Columns: Interface ID, Domain, Nominal, Limit, Unit, Medium/protocol, Connector/port, Responsibility, Verification status, Source. From connection ledger + contract + Decision Register. Universal on boundary service edges. |
| Mass / CoG / package budget | **DEFER** | After geometry is race-credible (≤650 mm). Then extend Equipment & Dimensions Register. |
| Dyno / FE / HIL evidence report | **DEFER** | No evidence yet — never invent PASS theatre. |
| PHANTM calculator mega-sheet | **REJECT** | Duplicates Calculations / Design basis; prior SOL stands. |

## Implementation order

1. Verification DVP&R fields  
2. Calculations operating-point matrix  
3. Connection-trace interface ratings  

## Must not add tonight

PHANTM mega-sheet · invented efficiency map · fake Jaguar APPROVED · speculative dyno/HIL PASS · duplicate regulatory tab · cosmetic reporting over broken package geometry.

---

*Cold twin `out/formula-e-rear-mgu-20260729-0453` validates SOURCE pack first; Excel extensions after SIGHT.*
