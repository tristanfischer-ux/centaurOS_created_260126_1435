# JLR FE Front FPK — Adversarial Red-Team Punch List (verified)

**Audience:** Jaguar Land Rover Formula E Head of Technology  
**Council:** `openai/gpt-5.6-sol` (REJECT/99), `z-ai/glm-5.2` (REJECT/~94), `moonshotai/kimi-k3` (REJECT/95)  
**Twin:** `out/formula-e-front-mgu-20260729-1432/`  
**Latest pack:** rebuild after OPEN-by-design honesty stamp (still DRAFT — must stay DRAFT)

---

## Verdict

**All three models REJECT.** Independent SIGHT + arithmetic agree the pack was not HoT-ready.  
SOURCE fixes landed for power-chain reconciliation, live Excel power/thermal formulas, thermal ΔT, mass breakdown, traction PCB architecture + Gerbers, and 4-20 mA misuse. **Residual gap to Tier-1 remains large** (morphology re-render, BoM procurement, channel fitness, dyno).

**OPEN by design (must NOT greenwash):** DEC-001 / 006 / 007 / 008 (HIL) / 009 (supplier Gerbers) / 010 (dyno). `homologationHonesty.verdict=NOT_HOMOLOGATED`; `pcb.supplierGerbers=false`, `hilPresent=false`, `forgeDraftOnly=true`. SHIPS blocked while these remain OPEN. Lucid = FFF training check only — never CAD paste.

---

## Independent skeptic addenda (verified)

| ID | Finding | Verdict | Notes |
|---|---|---|---|
| S1 | Calculations ~21% formulas; C16/C18 literals | **CONFIRMED** → **PARTIAL FIX** | Data-flow still has literals; new **FPK power/thermal LIVE trace** (11 yellow + 11 green) is SoT for DC→wheel |
| S2 | Topology 0/18 edges routed | **CONFIRMED** | Still open — Blender harness not re-routed this pass |
| S3 | PCB null / cots / no Gerbers | **CONFIRMED** → **FIXED PATH** | Forge draft Gerbers on disk; **supplier Gerbers DEC-009 OPEN by design**; fitness FAIL; HIL DEC-008 OPEN |
| S4 | Mass = 0.90×cap | **CONFIRMED** → **FIXED** | Σ concept seeds 11.5+8.2+6.4+2.7 = 28.8 kg (still concept, not CAD weigh) |
| S5 | Morphology fails Lucid-gold | **CONFIRMED** → **SOURCE+render** | Race-hardened cues in scene builder; Lucid = training check only; re-render required for SIGHT |
| S6 | SOL H1: 117 Nm ≠ 250 kW @ 19.5k | **CHALLENGED** | 117 matched old post-η shaft (~238.9). After reconcile: **T=119.7 Nm @ P_shaft=244.4 kW** with live η |
| S7 | I_ph 477 arithmetic | **OK** | Ideal SVPWM; added **I_ph_design=535 A** (+12% margin) |
| S8 | Kimi: 250×η×η ≠ 238.9 | **CONFIRMED** → **FIXED** | Root: IPMSM overwrote shaft; tools later raised η. `reconcileFrontFpkPowerChain` now authoritative |
| S9 | GLM: BoM all-null MPN/mfr/qty/price | **OVERSTATED** | MPNs exist (many TBD); **mfr often null; price all null** — still hollow for procurement |
| S10 | Coolant ΔT missing | **CONFIRMED** → **FIXED** | `coolant_delta_t_k≈9.2 K` at continuous loss ~6.6 kW / 12 L/min EGW |

---

## Council fatals — accept / challenge

| ID | Claim | Verdict | Action taken / residual |
|---|---|---|---|
| F1 | No executable SoT | **ACCEPT** | Live FPK trace + reconciled quantities; full workbook still not 95% formulas |
| F2 | Electronics not a release | **ACCEPT** | Bespoke path + Gerbers; HIL/fitness still FAIL; DEC-001 SiC die OPEN |
| F3 | HV power flow unclear | **ACCEPT** | Power tree JSON + labeled planes; vehicle contactor/precharge ICD still thin |
| F4 | Wiring fictional | **ACCEPT** | Topology 0/18 remains |
| F5 | Sensor topology implausible (4-20 mA) | **ACCEPT** | Blender signal context fixed for traction nouns |
| F6 | Thermal assertion only | **PARTIAL** | ΔT lump closed; no radiator/P&ID/transient lap |
| F7 | EM design unsupported | **ACCEPT** | IPMSM kept as capability check qty; no FEA/dq maps |
| F8 | No V&V programme | **ACCEPT** | Holds; not faked |
| F9 | Mech/gear unsubstantiated | **ACCEPT** | Gear ratio still trial seed |

---

## Top residual punch list (ordered for HoT)

1. **Morphology / Blender** — re-route ≥18 topology edges; raise Cycles past faceted clay; cutaway packaging story (no Lucid STEP paste).
2. **PCB fitness** — implement gate_drive×6, desat×6, phase_sense×3, resolver, CAN on boards; resolve OEM control + CAN-FD identities; HIL before FUNCTIONALLY VERIFIED.
3. **BoM procurement** — real MPN/mfr/qty/price/mass per line; kill TBD on SiC die (DEC-001).
4. **Excel tab floor** — DRAFT with Executive Summary/PCB/Verification &lt;8; provenance flags on reconciled qty; raise to genuine ≥8 without greenwash.
5. **Harness ICD** — cavity tables, gauges, shielding, HVIL states, creepage.
6. **EM + rotor** — dq maps, demag, DEC-006 overspeed margin ≥1.5 with stated n_max.
7. **Thermal network** — beyond lump ΔT: cold-plate Rth, winding/magnet temps, lap duty.
8. **Mass** — CAD/weighed roll-up vs 32 kg (concept Σ is not enough).
9. **FIA energy** — record tool outputs as quantities; never claim homologated.
10. **Ship honesty** — OPEN-by-design holds (HIL / supplier Gerbers / dyno) must block SHIPS; never claim FIA homologated.

---

## SOURCE changes landed this session

| Area | Change |
|---|---|
| Power chain | `formula-e-front-mgu.ts` `reconcileFrontFpkPowerChain` after every tool |
| Contract seeds | Thermal ΔT, mass seeds, I_ph_design, labeled DC→wheel planes |
| Excel | `_render_fpk_power_thermal_trace` + table contract; race-hold ship axis |
| PCB collect | Traction nouns in `pcb-stage.ts` ELECTRONIC_CATEGORY_PATTERNS |
| PCB architecture | `hasTractionInverterBoardSignal` → gate-drive + control boards |
| PCB run | `fe-front-run-pcb-pipeline.ts`; COTS force removed from close script |
| Honesty | `fe-front-close-remaining-six.py` forces DEC-008/009/010 OPEN; stamps `homologationHonesty` + `supplierGerbers=false` after pipeline |
| Repair | `fe-front-reconcile-power-chain.py` on twin |
| Blender | Traction signals not 4-20 mA; race-hardened morphology + Lucid=training-check language |

---

## What a HoT should see today (honest)

- **Workbook:** V1.8 **DRAFT** — live power/thermal formulas exist; not a release.  
- **PCB:** Gerbers for 2 boards; **not** fab-ready / fitness FAIL.  
- **Renders:** Prior morphology; still not Lucid-gold sealed FPK.  
- **Homologation:** Explicitly **NOT HOMOLOGATED**.  
- **Rear MGU:** Still deferred.
