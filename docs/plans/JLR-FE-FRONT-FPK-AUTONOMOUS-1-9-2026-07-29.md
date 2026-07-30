# JLR FE Front FPK — Autonomous execution plan (items 1–9) — COUNCIL-REVISED

**Date:** 2026-07-29  
**Twin:** `out/formula-e-front-mgu-20260729-1432/`  
**Operator:** Cursor agent (autonomous; Sol / GLM / Kimi K3 / Opus 5 on stall)  
**Watchdog:** OS timer **every 300 s**; stale if heartbeat age **> 600 s** (10 min)  
**Heartbeat:** `out/.../_autonomous/heartbeat.json`  
**Status:** `…/_autonomous/STATUS.md`  
**Traceability matrix:** `…/_autonomous/requirements-matrix.json`  
**Plan vet:** Sol + GLM = **GO_WITH_CHANGES**; Kimi failed → Opus 5 = **GO_WITH_CHANGES** (salvaged). Overall: **GO_WITH_CHANGES** — changes below **accepted before start**.

---

## Council deltas accepted (mandatory)

1. **Reorder:** infra+matrix → literature baseline → interface/topology freeze → provisional physics → ESL/thermal+ports → PCB → mesh → Excel → evidence → red-team; physics claim-link pass after literature join.  
2. **100% checklist disposition** (map / duplicate / N/A+rationale / OPEN+owner) — not 70%.  
3. **Physics quality fields:** equation, SI units, operating point, assumptions, provenance ∈ {MEASURED, SUPPLIER_DATASHEET, PEER_LITERATURE, ANALYTICAL_FROM_ASSUMED_GEOMETRY, ESTIMATE_UNVALIDATED}, uncertainty, validity domain, ≥1 limiting-case check.  
4. **ship_ok / SHIPS fail-closed** on any mandatory OPEN (race, DEC, HIL, Gerbers, dyno, CFD_cold_plate where required, unresolved physics disposition, stale hash).  
5. **Watchdog:** interval 300 s, stale 600 s; progress counter + resume_queue; no greenwash from council text (models ≠ evidence).  
6. **Phase wall-clock budgets** + checkpoint; escalate BLOCKED_NEEDING_HUMAN on budget exceed / repeated stall.  
7. **OA PDF:** explicit OPEN or implement bounded `--oa-pdf` in Phase L — no silent TODO.  
8. **PCB:** channel-true + isolation/creepage assumptions + NOT-FABRICATION-READY; `fitness_fail_reason` required when fail.  
9. **Mesh authenticity score** = non-cuboid principal ratio; residual list mandatory.  
10. **Regulatory basis stamp:** Gen3/Evo study vs spec-part integration; no “FIA compliant” without regs on disk.  
11. **Safety concept stub** before PCB (ASC/HVIL/IMD/desat reaction) — can be OPEN with structure.  
12. **Revision hashes** on stamp artefacts; reject mixed revisions.

---

## Honesty bar (non-negotiable)

| Claim | Allowed? |
|---|---|
| Deepen analytical/literature physics + stamp twin | YES |
| Channel-true PCB architecture + forge KiCad attempt | YES |
| Close supplier Gerbers / HIL / dyno with fiction | **NO** |
| Invent FIA port XYZ / Lucid CAD paste / SHIPS greenwash | **NO** |
| OPEN + evidence trail + proveCatch refuse greenwash | YES |

Council outputs are **challenge only**, never closure evidence.

---

## Revised phase sequence

| Phase | Name | Budget | Exit |
|---|---|---|---|
| **P0** | Infra, preflight, matrix, regulatory stamp, watchdog selftest | 30 min | matrix exists; watchdog wake proven; scripts present |
| **L** | Literature baseline (extract→join; OA PDF OPEN or bounded fetch) | 180 min | claims↑; corpus hash; quality fields on new claims |
| **T** | Interface + topology freeze (HV±, UVW, coolant, LV/CAN, resolver) | 60 min | edges enumerated; proveCatch missing HV− or coolant-in; rev hash |
| **P1** | Provisional physics tree deepen (100% path disposition) | 120 min | disposition file; open_until owners; provisional stamp |
| **P1b** | Safety concept structure (ASC, HVIL, IMD, desat, BBW interface) | 45 min | branch non-empty or OPEN structured |
| **P4** | Bus ESL + cold-plate analytical (+ ports); CFD OPEN guarded | 60 min | ESL with method+uncertainty; ΔT analytical; CFD_cold_plate OPEN proveCatch |
| **P3** | PCB channel-true pack (6 gate+desat…); NOT-FAB-READY | 90 min | architecture + fitness_fail_reason; Gerbers OPEN |
| **P1c** | Physics claim-link pass (post-L join) | 60 min | claim_refs attached; nondeterminism frozen to corpus hash |
| **P6** | Mesh authenticity (families/compounds; score+residuals) | 90 min | score in state; viz-only labels |
| **P7** | Excel LIVE from hashed quantities; UNVALIDATED tags | 60 min | V1.12+ DRAFT; ship_ok false |
| **P8** | Evidence trail ↔ race OPEN IDs bidirectional | 45 min | EVIDENCE-TRAIL.md + proveCatch |
| **P9** | Red-team v3; disposition each FATAL; no OPEN→CLOSED without artefact | 60 min | council artefacts; STATUS COMPLETE or BLOCKED |

**Overall wall clock soft stop:** 12 h then checkpoint + BLOCKED_NEEDING_HUMAN if incomplete.

---

## Watchdog + on-track contract (aligned)

| Timer | Interval | Role |
|---|---|---|
| `fe-front-autonomous-watchdog.sh` | **300 s** | Heartbeat age; wake if **> 600 s** stale |
| `fe-front-autonomous-ontrack.py` | **120 s** | Plan progress key (claims\|topo\|nodes\|step); relaunch dead watchdog/extract; wake on **5 min** stall |

- Log wall-clock to `watchdog.log` + `ontrack.log`  
- Snapshots: `_autonomous/ontrack_snapshot.json`, `ontrack_gaps.json`  
- Agent must consume `wake_signal` and advance a real plan gap (not only heartbeat)  
- 3 ontrack stalls with no progress key change → STALLED + Sol/GLM/Opus5 unstick once

---

## Success metrics

| Metric | Target |
|---|---|
| Checklist path disposition | **100%** classified |
| Literature claims | > baseline 482 with DOI/source where possible |
| Topology | HV− and coolant-in edges present or proveCatch fire |
| Gate channels | 6 required explicit; fitness_fail_reason if fail |
| ESL / cold-plate | analytical + uncertainty; CFD OPEN guarded |
| Mesh authenticity score | present + residual list |
| ship_ok / SHIPS | false while any mandatory OPEN |
| Final council | on disk; models ≠ evidence |

---

## Race OPEN holds (immutable IDs — enumerate from twin in P0)

Filled at P0 into `requirements-matrix.json` from live state (`DEC-*`, homologation, PCB Gerbers, HIL, dyno, CFD). Each row: artefact required, closure authority = physical test / supplier doc / FIA — **never** LLM.

---

## Abort / model assist

On tool hang, DB lock, Blender/KiCad crash, OpenRouter fail: Sol + GLM + (Kimi|Opus5) unstick with STATUS + error; apply SOURCE fix or mark BLOCKED with options. Do not invent evidence to unblock.
