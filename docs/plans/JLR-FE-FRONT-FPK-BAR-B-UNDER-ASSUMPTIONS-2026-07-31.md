# Bar B under assumptions — what “complete the list” means

**Date:** 2026-07-31  
**Twin artefacts:**  
`out/formula-e-front-mgu-20260729-1432/JLR-FE-FRONT-FPK-BAR-B-READINESS.md`  
`out/formula-e-front-mgu-20260729-1432/JLR-FE-FRONT-FPK-BAR-B-READINESS.json`

---

## Direct answer

**No — assumptions cannot complete Bar B as homologation.**  
Bar B is defined as race / ship evidence: HIL, supplier Gerbers, dyno, chassis XYZ, bench CFD. Minting `ship_ok=true` from guesses is forbidden.

**Yes — assumptions can complete the Bar B *checklist for Jack*.**  
Every Bar B row now has either:

| Closure class | Meaning |
|---|---|
| **ASSUMED_CONCEPT** | Educated guess named + screening result (SiC class, rotor retention seed, duty-cycle placeholder) |
| **NEEDS_HARDWARE** | Predicted model / bench recipe ready; physical test still required (HIL, dyno, flow, heater, double-pulse) |
| **NEEDS_PARTNER_INPUT** | We refuse to invent it (chassis XYZ, supplier Gerbers) |

Homologation stays **NOT_HOMOLOGATED**. Decision Register rows stay **OPEN** for race, with assumption annotations attached.

---

## Bar B list (filled)

See live twin markdown for numbers. Summary:

| Item | Class |
|---|---|
| DEC-001 SiC module | ASSUMED_CONCEPT |
| DEC-006 Rotor retention | ASSUMED_CONCEPT |
| DEC-007 Duty / E_net | ASSUMED_CONCEPT |
| DEC-008 HIL | NEEDS_HARDWARE |
| DEC-009 Supplier Gerbers | NEEDS_PARTNER_INPUT |
| DEC-010 Dyno | NEEDS_HARDWARE |
| Flow bench | NEEDS_HARDWARE |
| Heater plate | NEEDS_HARDWARE |
| Double-pulse ESL | NEEDS_HARDWARE |
| Chassis XYZ | NEEDS_PARTNER_INPUT |

---

## What Jack should hear

> “Every Bar B line is filled: where we could make an educated guess we did and show the screening result; where we need your ICD, Gerbers, or a bench we say so and have the measurement recipe ready. We are **not** claiming the car is homologated.”

Email ask remains: `docs/plans/JLR-FE-FRONT-FPK-EMAIL-ASK-JACK-2026-07-31.md`
