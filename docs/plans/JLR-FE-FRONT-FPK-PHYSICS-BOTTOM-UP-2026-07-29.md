# JLR FE Front FPK — Bottom-up first-principles physics (plan)

**Date:** 2026-07-29  
**Twin:** `out/formula-e-front-mgu-20260729-1432/`  
**Bar (Tristan):** Every FPK component → subcomponents → materials → elemental / continuum physics. Not generic part names. Analytical first; FEA/dyno/supplier replace. Never claim homologated while OPEN holds remain.

---

## 1. Method (fixed order)

```
1. CHECKLIST — every part required to make the FPK (covers on everything)
2. EXPLODE  — recursively: part → sub-part → … → material / process leaf
3. PHYSICS  — for each node, attach every relevant domain:
              electrical | magnetic | thermal | fluid | mechanical/rotational
              | material | manufacturing
4. DERIVE   — bottom-up analytical relations from brief + contract scalars
5. OPEN     — mark what only FEA / supplier ICD / HIL / dyno can close
6. BUILD UP — geometry / BoM / Excel / Blender consume derived quantities
7. OPTIMISE — only after the physics skeleton is honest
```

**Rule:** a node without physics is incomplete. A seed is allowed; a silent gap is not.

---

## 2. Top-level kit (assemblies)

| Assembly | Role |
|---|---|
| **Cassette** | Unitised bay shell, mounts, halfshaft flanges, covers |
| **MCU / inverter** | SiC power stage + DC link + busbars + cold plate + PCBs + HV/LV I/O |
| **Motor (IPMSM)** | Stator EM + rotor PM + shaft/bearings/resolver + jacket + covers |
| **Transmission** | Planetary nest + mini-diff + shafts + seals + oil |

Lucid/Atieva = FFF training check only — never CAD paste.

---

## 3. Recursive explosion (depth target)

Go until leaves are **material + process + continuum properties**, e.g.:

```
stator_windings
  └─ phase_coil × 3
       └─ slot_coil_side × N
            └─ turn × N_turns
                 └─ conductor_strand
                      ├─ copper_core  (Cu, ρ, σ, J, I²R)
                      └─ enamel_insulation (polyimide class H — process)
                 └─ end_winding_overhang (thermal + inductance)
  └─ phase_terminal_lugs
  └─ slot_liner / wedge
```

Same pattern for: SiC stack, DC-link bank, laminated bus, cold plate channels, gate-drive board, control board, magnets, laminations, planetary mesh, seals, oil, etc.

---

## 4. Physics domains (every leaf must declare which apply)

| Domain | Typical quantities |
|---|---|
| **Electrical** | V, I, f, R, L, C, ESL/ESR, J, conduction/switching loss |
| **Magnetic** | B, H, Br, Hc, μ, eddy/hysteresis, demag margin |
| **Thermal** | Q̇, R_th, T_j / T_winding / T_magnet, ΔT, TIM |
| **Fluid** | ṁ, ΔP, Nu/h, channel Dh, EGW properties |
| **Mechanical / rot.** | ω, T, σ_bend, contact stress, L10 life, balance |
| **Material** | ρ, k, c_p, σ_y, composition / grade |
| **Manufacturing** | process (CNC, stamp, sinter, vacuum impregnate, sinter-braze…), special vs COTS |

---

## 5. Work packages (implementation order)

| WP | Deliverable | Status |
|---|---|---|
| **WP0** | This plan + SOURCE tree module | **DONE** — `fpk_physics_tree.py` |
| **WP1** | Full recursive ontology (MCU + motor + TX + cassette) with materials | **DONE** — 154 nodes / 105 leaves |
| **WP2** | Bottom-up analytical derivations wired to contract quantities | **DONE** — windings, C_dc, cold-plate Nu, bus section, SiC loss split, gear teeth |
| **WP3** | Twin stamp + checklist report (coverage %, OPEN list) | **DONE** — `state.fpkPhysicsTree` + `JLR-FE-FRONT-FPK-PHYSICS-TREE.md` |
| **WP4** | PCB channel-true BOM (6× gate + desat + sense + MCU + CAN) | **next** — tree states required channels; KiCad still 0 |
| **WP5** | Cold-plate CFD / ΔP (beyond analytical Re/Nu seed) | next |
| **WP6** | Bus 3D inductance / measured ESL / module datasheet thermal | next |
| **WP7** | EM FE / gear strength / bearing L10 | later |
| **WP8** | Blender / CadQuery mesh-per-leaf | later |
| **WP9** | Excel LIVE cells from tree quantities | later |

---

## 6. Honesty

- Seeds ≠ designed ≠ FIA homologated  
- `ship_ok` stays false while DEC-008/009/010 / HIL / dyno / supplier Gerbers OPEN  
- Density / conductivity constants are **material handbook seeds** with provenance, not measured lab data  

---

## 7. SOURCE files

| File | Role |
|---|---|
| `scripts/lib/fpk_physics_tree.py` | Recursive tree + materials + derive + selftest |
| `scripts/fe-front-stamp-fpk-physics-tree.py` | Stamp twin `state.fpkPhysicsTree` + markdown checklist |
| `scripts/lib/fpk_first_principles.py` | Flat 48-part ontology (kept; tree is the deep layer) |
| Twin report | `out/.../JLR-FE-FRONT-FPK-PHYSICS-TREE.md` |
