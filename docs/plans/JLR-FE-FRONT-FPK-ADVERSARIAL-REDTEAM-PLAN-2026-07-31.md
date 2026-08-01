# Adversarial red-team test plan — FE front FPK (assumption / Bar B era)

**Date:** 2026-07-31  
**Twin:** `out/formula-e-front-mgu-20260729-1432`  
**Question:** Would a JLR Formula E Head of Technology rely on this pack — or on our “results under assumptions” narrative to Jack?

**Prior art:** 2026-07-29 council (Sol + GLM + Kimi) **REJECT** ×3 on an earlier digest — see `JLR-FE-FRONT-FPK-REDTEAM-PUNCHLIST-2026-07-29.md`. This plan re-attacks the **current** multiphysics + assumption + Bar B + Jack email stack.

---

## 0. Answer up front

As of plan authoring: **no fresh multi-LLM adversarial pass had been run against the assumption-based / Bar B artefacts.** Only the older 29 Jul reject. This plan closes that gap.

---

## 1. Objectives

| # | Objective |
|---|---|
| O1 | Force **≥3 independent adversarial LLMs** (Sol, Kimi K3, GLM; Opus 5 if Kimi fails) to REJECT or CONDITIONAL with evidence |
| O2 | Attack **delivered artefacts** (SIGHT), not author intent in chat |
| O3 | Separate **FATAL greenwash** from **honest OPEN holds** |
| O4 | Produce a **verified punchlist** (accept / challenge / already-fixed) for SOURCE work |
| O5 | Stress-test Jack-facing claims so we do not email something a skeptic shreds in five minutes |

---

## 2. Models (standing council)

| Seat | Model | Role |
|---|---|---|
| Sol | `openai/gpt-5.6-sol` | HoT reject — physics arithmetic + release honesty |
| GLM | `z-ai/glm-5.2` | Packaging / BoM / morphology / Excel traceability |
| Kimi | `moonshotai/kimi-k3` | Power flow / EM / thermal consistency |
| Fallback | `anthropic/claude-opus-5` | If Kimi seat fails |

Run **in parallel**. Temperature ≤0.2. Strict JSON schema. No praise-seeking prompts.

Script: `scripts/fe-front-redteam-council.py` (+ digest builder).

---

## 3. Artefact digest (must include)

Feed a rebuilt `_redteam_digest_v2.json` containing:

1. `state.json` slices: ship, homologationHonesty, pcb, quantities, decision register, interface ICD  
2. `motor-multiphysics.json` (architecture / EM / thermal / gear / holds)  
3. `JLR-FE-FRONT-FPK-ASSUMPTION-BASED-DESIGN.json`  
4. `JLR-FE-FRONT-FPK-BAR-B-READINESS.json`  
5. Jack email + assumption brief excerpts (claims we make externally)  
6. Blender pack identity (V1.200 renders path, mesh/authenticity notes if present)  
7. Excel formula-coverage sample + LIVE trace presence  
8. Operator concerns list (morphology, Gerbers, dyno, greenwash)

Cap digest size ~120k chars; prefer numbers over prose.

---

## 4. Attack surfaces (mandatory questions)

Each model must score / find on every surface:

| ID | Surface | Adversarial question |
|---|---|---|
| A1 | **Greenwash** | Does “RESULTS UNDER ASSUMPTIONS” / “Bar B list filled” read as homologation to a hurried reader? |
| A2 | **Arithmetic** | Do 250 kW ↔ shaft torque ↔ rpm ↔ ratio ↔ wheel torque close? Is ~207 N·m vs ~125 N·m coherent? |
| A3 | **Thermal** | Is T_mod≈71 °C / Δp≈43 kPa credible at 60 °C / 12 L/min given stated losses, or a units/model bug? |
| A4 | **Gears** | FoS≈1.2 on planetary / bevel / post-diff — is that release-grade or screening theatre? Nest vs bore story coherent? |
| A5 | **EM** | FEMM / map density claims — duty screen vs dyno map honesty; demag / FW gaps |
| A6 | **Rotor** | FoS≈3.44 screening vs overspeed hold — mislabeled as retention proof? |
| A7 | **Interfaces** | Types-only XYZ — any invented millimetres? Jack ask complete? |
| A8 | **PCB / HIL / Gerbers** | Any false PASS? forgeDraftOnly respected? |
| A9 | **Blender** | Morphology vs Lucid training check; clay/faceted; ghost shell story incomplete? |
| A10 | **Mass** | 32 kg aspiration vs concept Σ — presented as weighed? |
| A11 | **Internet scavenger** | Did we over-claim public data or under-use real public FIA/Lucid numbers? |
| A12 | **ship_ok** | Still false? Any path to mint true without hardware? |
| A13 | **Excel** | LIVE formulas vs literals on power/thermal chain |
| A14 | **Jack email** | Would the email survive a hostile FE tech lead? Missing asks / overclaims? |

---

## 5. Pass / fail criteria

| Gate | Pass condition |
|---|---|
| G1 Council ran | ≥3 seats returned parseable JSON with verdict |
| G2 Not self-congratulatory | At least 2 seats verdict ≠ ACCEPT |
| G3 Fatals routed | Every FATAL has accept/challenge + SOURCE hint in punchlist |
| G4 Honesty intact | If any seat finds ship_ok/homologation greenwash → immediate SOURCE fix before Jack send |
| G5 Arithmetic | Independent check of torque/power/rpm on claimed numbers (script or seat physics_checks) |

**Success is not “ACCEPT”.** Success is a harsh, verified punchlist and no silent greenwash.

---

## 6. Execution steps

1. Rebuild digest from live twin (`scripts/fe-front-build-redteam-digest.py`)  
2. Run `scripts/fe-front-redteam-council.py` → `out/.../_redteam_v2/`  
3. Independent skeptic pass (deterministic arithmetic + file SIGHT)  
4. Write `docs/plans/JLR-FE-FRONT-FPK-REDTEAM-PUNCHLIST-2026-07-31.md`  
5. If FATAL greenwash → fix SOURCE before emailing Jack  
6. Commit plan + punchlist + council script updates (not huge twin dumps unless asked)

---

## 7. Out of scope (do not fake)

- Inventing chassis XYZ or supplier Gerbers to silence seats  
- Minting `ship_ok` because models said CONDITIONAL  
- Pasting Lucid geometry to “fix” morphology findings  

---

## 8. Re-challenge cadence

Re-run this plan after any of: new Blender morphology milestone, SiC MPN freeze, ICD XYZ arrival, Excel LIVE-trace expansion, or before sending the Jack pack.
