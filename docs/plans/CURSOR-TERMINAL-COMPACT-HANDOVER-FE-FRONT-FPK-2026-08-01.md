# Cursor → Terminal Compact Handover — FE Front FPK

**Written:** 2026-08-01 ~09:30 BST (Cursor / Grok)  
**Purpose:** Give **terminal** a ready block to merge into its own handover before compact — plus standing orders after wake.  
**Supersedes for ownership/status:** Blender + scoreboard sections of [`CURSOR-TO-CLAUDE-CODE-HANDOVER-FE-FRONT-FPK-2026-07-31.md`](./CURSOR-TO-CLAUDE-CODE-HANDOVER-FE-FRONT-FPK-2026-07-31.md) (that file’s EM ~118 N·m scoreboard is **STALE** — use live twin / this doc).  
**Audience:** Claude Code / terminal (campaign owner). Cursor after this: advisory only unless asked.

---

## How to use this in *your* terminal handover / compact

Copy or paste these sections into your compact doc (suggested structure):

1. **§0 Hard constraints** → keep verbatim  
2. **§1 Live scoreboard** → re-SIGHT twin at compact time; replace numbers if they moved  
3. **§2 What Cursor just did** → “peer work since last wake”  
4. **§3 Your P0 after wake** → remaining work queue  
5. **§4 Memory pointers** → MemPalace / MEMORY.md / catalogue (so compact does not drop them)  
6. **§5 Do-not / theatre** → anti-Goodhart list  

Point your post-compact wake at:

```
docs/plans/CURSOR-TERMINAL-COMPACT-HANDOVER-FE-FRONT-FPK-2026-08-01.md
docs/plans/FE-FRONT-FPK-TERMINAL-BAR-AB-ENGINE-CATALOGUE-2026-08-01.md
docs/plans/FE-FRONT-EM-TORQUE-REVIEW-BRIEF-v2-2026-08-01.md
```

Then: `mempalace search "FE Front FPK" --wing forgeos` and open native MEMORY RECENT for 08-01.

---

## 0. Hard constraints (do not violate)

| Rule | Value |
|---|---|
| Twin (**ONLY**) | `out/formula-e-front-mgu-20260729-1432/` — **do not mint a new front-kit out dir** |
| Branch | `oxccu-efuel` |
| `ship_ok` | Always **false** until Bar B hardware evidence |
| Homologation | **NOT_HOMOLOGATED** |
| Fix style | SOURCE rule + proveCatch — never band-aid one twin’s JSON |
| Gold / Lucid | Training check only — never paste proprietary STEP / silhouette |
| Product images | CAD → Cycles only — **no** LLM product polish |
| Jack honesty | Named assumptions; results under assumptions; no CLEARED greenwash |
| SIGHT | Open delivered PNGs / twin JSON with eyes. Logs ≠ done |
| Architecture blockers stamp | Empty `[]` while `duty_torque_screen_ok=false` is **NOT** clearance |

---

## 1. Live scoreboard (Cursor SIGHT 2026-08-01 — refresh at compact)

| Signal | Value | Bar |
|---|---|---|
| `duty_torque_screen_ok` | **false** | Blocks A |
| Mean \|T\| / required | **~0.462** (≈**57.8** / **125.21** N·m) | Blocks A |
| FE route (nonlinear BH) | **57.84 N·m** (EM brief v2 route C) | Blocks A |
| Linear / back-EMF routes | Higher (brief: ~131–215) — **not** duty clear alone | Diagnosis |
| Ripple / reliability | ~**207%** p-p; **sign reversal**; `torque_reliable=false` | Blocks A / DEC-EM-1 |
| Oil screening | **CLEARED** (analytical cornering + gallery) | Helps A; free-surface = B |
| Planetary strength writeback | **INVALIDATED** (`PLANETARY_STRENGTH_VS_ROTOR_BORE`) | Pause until EM OD freeze |
| PCB | Draft / **NOT_FAB** | Honest |
| Tracker | May still cite **~118 N·m** in places — **stale**; trust twin + EM brief v2 | Hygiene |

**Verdict:** Terminal is on the **correct** Bar A critical path (EM honesty). **Not close** to Bar A pass. Bar B **not** closable in software — keep checklist honest.

---

## 2. What Cursor just did (absorb into your handover)

### 2.1 Bar A/B + engine catalogue (new operational truth)

| Artefact | Path |
|---|---|
| **Catalogue (full)** | [`FE-FRONT-FPK-TERMINAL-BAR-AB-ENGINE-CATALOGUE-2026-08-01.md`](./FE-FRONT-FPK-TERMINAL-BAR-AB-ENGINE-CATALOGUE-2026-08-01.md) |
| Contents | Terminal progress vs bars · engines **used** + insights · engines **unused-but-should** (GPT-5.6 Sol + Kimi K3; GLM 5.2 unavailable in Cursor Task list) · P0 software recommendations + expected results · theatre flags |

**Action for terminal:** Treat the catalogue §3–5 as the **tooling roadmap** after DEC-EM-1 geometry freeze — do not burn JMAG/3D EM/SPH before torque closes.

### 2.2 Blender — ownership returned to **you**

Cursor finished a SOURCE tranche; **you own Blender again**. Cursor will not compete unless asked.

| Fix | Where | Result |
|---|---|---|
| Meshing PCD unify | `scripts/blender-universal/build_universal_scene.py` + `scripts/lib/fpk_gear_teeth.py` | Ring PCD = sun+2×planet; mismatch cleared |
| Cutaway shell-off | `build_universal_scene.py` | Open views hide hollow_rotor/stator/magnets/carrier; nest exposed |
| Involute readability | `scripts/blender-templates/forge_blender_lib.py` | Thin ring rim, flat shade, lighter gear mat |
| Traction hi-res | `scripts/lib/instrument_form_grammar.py` | Product **4800×3200**; catalogue **7200×4800** (same framing — **not** gear enlargement) |
| Axial explode (`13`) | `build_universal_scene.py` | Assembly stack along pack +X — **not** catalogue lattice (`14` = inventory) |

**SIGHT after wake:** open twin `00-hero.png`, `08-product-ghost-shell.png`, `13-product-exploded.png`, `14-product-parts-catalogue.png`. Residual: m=0.6 mm teeth still fine at whole-kit framing; sphere-proxy authenticity remains.

### 2.3 Memory systems (so compact does not lose this)

| Store | What was filed |
|---|---|
| MemPalace | `drawer_forgeos_decisions_b12f5c78ae9e672a` · `drawer_forgeos_reference_1761c8d7c46426f0` · `drawer_forgeos_gotchas_e1e8396db547332f` + KG triples (twin path, Blender→terminal, Bar A blocked by ~58 vs 125) |
| Native MEMORY | RECENT bullet + topic `~/.claude/projects/-Users-tristanfischer/memory/forgeos-fe-front-fpk-bar-ab-2026-08-01.md` |
| Standing rule | `.cursor/rules/mempalace-native-memory-dual-write.mdc` — **both** MemPalace + MEMORY.md after significant work (not one-off) |
| Harness | Tip at top of [`CURSOR-HARNESS-INBOX.md`](./CURSOR-HARNESS-INBOX.md) — `WAITING_ON_TERMINAL` |

**Action for terminal:** On wake, search MemPalace; when *you* complete EM brief v2 / DEC-EM-1, dual-write MemPalace + MEMORY.md yourself (Claude already has `~/.claude/docs/mempalace.md`).

### 2.4 EM brief you already own (still P0)

[`FE-FRONT-EM-TORQUE-REVIEW-BRIEF-v2-2026-08-01.md`](./FE-FRONT-EM-TORQUE-REVIEW-BRIEF-v2-2026-08-01.md) — execute **§6** (linear-material FE, sign-reversal root cause, slot opening) → **DEC-EM-1**. Catalogue agrees: 58→125 is **design-space**, not “another 2D package.”

---

## 3. Your P0 after compact wake (ordered)

```
1. Re-SIGHT twin scoreboard (duty mean, torque_reliable, oil, planetary stamp)
2. Refresh Bar A tracker numbers from twin (kill stale ~118 if still present)
3. Execute EM brief v2 §6 → produce DEC-EM-1 decision table (freeze vs redesign)
4. Only after EM OD freeze: re-open planetary (KISSsoft/Romax-class LTCA — see catalogue)
5. Parallel cheap (does not block DEC-EM-1): LTspice DPT + cantools DBC / Renode
6. Blender SIGHT of Cursor tranche PNGs; fix SOURCE only if human glance fails
7. Dual-write MemPalace + MEMORY.md with your wake results
8. Append Terminal reply under CURSOR-HARNESS-INBOX.md
```

**Bar A minimum pass (do not declare early):**  
duty torque screen true + `torque_reliable` true + planetary writeback re-validated on frozen EM OD + oil stays CLEARED + blockers stamp honest.

**Bar B:** dyno / HIL / Gerbers / XYZ / oil free-surface / NVH / FIA — software can prepare, not mint.

---

## 4. Engines cheat-sheet (from catalogue — for compact body)

### Used (insight one-liners)

- **xfemm/femmcli** — FE mean ~58 N·m; saturation vs linear gap real  
- **swat_em** — winding was a real bug (+7.3×)  
- **ISO 6336 screens** — planetary vs bore → INVALIDATED (correct)  
- **CoolProp/ht / OpenFOAM scaffolding / CalculiX / ROSS** — screens only  
- **Blender/Cycles** — morphology SIGHT (Cursor tranche above)  
- **atopile/KiCad** — NOT_FAB honesty  

### Unused-but-should (P0 consensus GPT+Kimi)

1. One industrial EM path: **JMAG** *or* **Motor-CAD+Maxwell** (after/with brief §6)  
2. **pymoo / OpenMDAO** around FE for DEC-EM-1 Pareto  
3. **KISSsoft / Romax** after EM freeze  
4. **LTspice DPT + FastHenry → PLECS** for SiC honesty  
5. Oil free-surface (**OpenFOAM VOF** or Particleworks) **after** gear freeze  
6. **cantools + Renode** now; Typhoon later  

### Theatre (do not)

3D EM before torque closes · NVH campaigns now · SPH splash videos · FEMM↔JMAG-2D swap expecting shortfall to vanish · enlarging gears in Blender to “see teeth”

---

## 5. Suggested paste block for *your* terminal compact header

```markdown
## Peer update absorbed (Cursor 2026-08-01)

- Catalogue: docs/plans/FE-FRONT-FPK-TERMINAL-BAR-AB-ENGINE-CATALOGUE-2026-08-01.md
- Compact handover: docs/plans/CURSOR-TERMINAL-COMPACT-HANDOVER-FE-FRONT-FPK-2026-08-01.md
- Blender ownership: TERMINAL (Cursor tranche done — PCD, cutaway shell-off, hi-res, axial explode)
- Live EM: ~58 N·m mean vs 125.21; torque_reliable=false; tracker ~118 may be STALE
- MemPalace: decisions_b12f5c78ae9e672a · reference_1761c8d7c46426f0 · gotchas_e1e8396db547332f
- Native: MEMORY.md RECENT + forgeos-fe-front-fpk-bar-ab-2026-08-01.md
- Next: EM brief v2 §6 → DEC-EM-1; then gear LTCA; dual-write memory after wake
```

---

## 6. Useful commands

```bash
# Twin scoreboard
python3 - <<'PY'
import json
from pathlib import Path
p = Path("out/formula-e-front-mgu-20260729-1432")
for name in ["motor-multiphysics.json", "_motor_stack/em_fia_front_kit_case.json"]:
    f = p / name
    print(f.name, "exists" if f.exists() else "MISSING", f.stat().st_mtime if f.exists() else "")
PY

# MemPalace wake
mempalace search "FE Front FPK" --wing forgeos | head -80
mempalace search "DEC-EM-1" --wing forgeos | head -40

# Native memory
head -40 ~/.claude/projects/-Users-tristanfischer/memory/MEMORY.md
# open: ~/.claude/projects/-Users-tristanfischer/memory/forgeos-fe-front-fpk-bar-ab-2026-08-01.md

# Blender SIGHT (Finder)
open out/formula-e-front-mgu-20260729-1432/00-hero.png \
     out/formula-e-front-mgu-20260729-1432/08-product-ghost-shell.png \
     out/formula-e-front-mgu-20260729-1432/13-product-exploded.png \
     out/formula-e-front-mgu-20260729-1432/14-product-parts-catalogue.png
```

---

## 7. Quick start for terminal after compact

1. Read **this file** + catalogue + EM brief v2 §5–6  
2. Re-SIGHT twin numbers (do not trust 07-31 handover’s ~118 N·m)  
3. Continue EM path → DEC-EM-1  
4. SIGHT Blender PNGs; only SOURCE-fix residuals  
5. Dual-write MemPalace + MEMORY.md with your new state  
6. Reply in harness inbox  

Cursor is **out of the Blender seat** and waiting on terminal for EM / DEC-EM-1.
