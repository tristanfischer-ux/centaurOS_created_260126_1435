# Cursor → Claude Code Handover — Formula E Front FPK

**Written:** 2026-07-31 ~08:05 BST (Cursor session ending — Tristan out of Cursor credits; Claude Code refreshed)  
**Audience:** Claude Code / terminal agent — **you own the campaign** from here  
**Cursor role after this:** advisory only via `docs/plans/CURSOR-HARNESS-INBOX.md` if used  

---

## 0. Mission statement (read twice)

Tristan’s twin has serious engineering work underneath, but **he still cannot see into the product in Blender**. Cutaway feels like a black box. Exploded / decomposition does not let him inventory every part. He asked explicitly for parts **laid out on a big piece of paper** so he can see what they are and know they are actually in the system.

**Your first job is visual SIGHT for a human — not more green JSON.**

Until Tristan can open a PNG and point at sun / planets / magnets / SiC / cold-plate / halfshafts as distinct labelled objects, Blender Bar A is **not done**, regardless of `fpk_blender_coverage.ok=true` or mesh-authenticity score 1.0.

Parallel P0 (architecture): one OPEN blocker `EM_TORQUE_VS_ROTOR_BORE` — needs **DEC-EM-1** + denser FEMM. Do **not** invent Bar B artefacts. **`ship_ok` stays false.**

---

## 1. Hard constraints (do not violate)

| Rule | Value |
|---|---|
| Twin (ONLY) | `out/formula-e-front-mgu-20260729-1432/` — **do not mint a new front-kit out dir** |
| Branch | `oxccu-efuel` |
| `ship_ok` | Always **false** until Bar B hardware evidence |
| Homologation | **NOT_HOMOLOGATED** |
| Fix style | SOURCE rule + proveCatch — never band-aid one twin’s JSON |
| Gold / Lucid | Training check only — never paste proprietary STEP / silhouette |
| Product images | CAD → Cycles only — **no** LLM / Gemini product polish |
| Jack honesty | Named assumptions; results under assumptions; no CLEARED greenwash of open holds |
| SIGHT | Open delivered PNGs/GLB with eyes (or vision critic). Logs ≠ done |

---

## 2. Read-first document stack (in this order)

### 2.1 Mandatory before editing

| # | Path | Why |
|---|---|---|
| 1 | **This file** | Standing orders + Tristan’s unanswered Blender asks + next actions |
| 2 | [`JLR-FE-FRONT-FPK-BAR-A-BAR-B-CLOSEOUT-TRACKER-2026-07-31.md`](./JLR-FE-FRONT-FPK-BAR-A-BAR-B-CLOSEOUT-TRACKER-2026-07-31.md) | Canonical Bar A/B checklist, Day 0–2 runbook, DEC-EM-1 worksheet |
| 3 | [`JLR-FE-FRONT-FPK-REDTEAM-PUNCHLIST-2026-07-31.md`](./JLR-FE-FRONT-FPK-REDTEAM-PUNCHLIST-2026-07-31.md) | What was fixed vs residual |
| 4 | [`OPERATING-FRAME-2026-06.md`](../../OPERATING-FRAME-2026-06.md) | Adversarial chartered engineer + SIGHT (audit DELIVERED artefacts) |
| 5 | [`CLAUDE.md`](../../CLAUDE.md) — CORE FIX PRINCIPLE + GATE INTENT | Fix SOURCE; proveCatch; gate must catch |
| 6 | Twin council | `out/formula-e-front-mgu-20260729-1432/_closeout_council_v1/SYNTHESIS.md` → **PUSH_WITH_HOLDS** |
| 7 | [`JLR-FE-FRONT-FPK-BLENDER-FFF-SUBCOMPONENTS-2026-07-29.md`](./JLR-FE-FRONT-FPK-BLENDER-FFF-SUBCOMPONENTS-2026-07-29.md) | Blender ontology / coverage stack |
| 8 | `.cursor/rules/photoreal-cad-instrument-render.mdc` + `instrument-form-beauty.mdc` | Photoreal CAD→Cycles bar |

### 2.2 Binding FIA / plain language / Jack

| Path | Why |
|---|---|
| [`FIA-FRONT-POWERTRAIN-KIT-BINDING-REQUIREMENTS-2026-07-30.md`](./FIA-FRONT-POWERTRAIN-KIT-BINDING-REQUIREMENTS-2026-07-30.md) | Binding requirements |
| [`FIA-FRONT-KIT-FIRST-PRINCIPLES-EXPLAINER-2026-07-30.md`](./FIA-FRONT-KIT-FIRST-PRINCIPLES-EXPLAINER-2026-07-30.md) | First-principles explainer |
| [`JLR-FE-FRONT-FPK-HALF-DONE-CLOSURE-PLAIN-LANGUAGE-2026-07-30.md`](./JLR-FE-FRONT-FPK-HALF-DONE-CLOSURE-PLAIN-LANGUAGE-2026-07-30.md) | Plain-language status |
| [`JLR-FE-FRONT-FPK-EMAIL-ASK-JACK-2026-07-31.md`](./JLR-FE-FRONT-FPK-EMAIL-ASK-JACK-2026-07-31.md) | Partner ask draft |
| [`MOTOR-MULTIPHYSICS-AND-CAD-PLAIN-LANGUAGE-2026-07-30.md`](./MOTOR-MULTIPHYSICS-AND-CAD-PLAIN-LANGUAGE-2026-07-30.md) | Architecture blockers language |
| Twin Jack pack | `…/JLR-FE-FRONT-FPK-ASSUMPTIONS-FOR-JACK.xlsx`, `…/JLR-FE-FRONT-FPK-ASSUMPTION-BASED-DESIGN.{json,md}`, `…/JLR-FE-FRONT-FPK-BAR-B-READINESS.{json,md}` |

### 2.3 Twin evidence files (live SIGHT sources)

| Path under twin | Role |
|---|---|
| `motor-multiphysics.json` | Stamp: `ship_ok`, `architectureBlockers` |
| `state.json` → `motorMultiphysics` | Same blockers on state |
| `_motor_stack/em_fia_front_kit_case.json` | EM duty numbers |
| `_motor_stack/gear_oil_fia_front_kit_case.json` | Oil screens |
| `form-meshes.json` | **218** mesh ids (`meshes[]`) |
| `JLR-FE-FRONT-FPK-BLENDER-COVERAGE.json` | Ontology coverage (JSON can pass while human fails) |
| `JLR-FE-FRONT-FPK-MESH-AUTHENTICITY.json` | Principal authenticity score |
| `fpk-quantity-lineage.json` | Quantity lineage |
| `00-hero.png`, `08-…`, `13-…`, GLB/USDZ | **Human SIGHT targets** |
| `drawings/general-arrangement.png` | 2D GA (not a substitute for shaded inventory) |
| Latest Excel | `20260731-0758-V1.247-DRAFT-formula-e-front-mgu-engineering-workbook.xlsx` (mtime may advance) |
| `_closeout_council_v1/{SYNTHESIS.md,merged-closeout.json}` | Council PUSH_WITH_HOLDS |

### 2.4 Lessons / operating

| Path | Why |
|---|---|
| `tasks/lessons.md` | Session lessons |
| `~/.memory/carry-forward.md` | Pending FE items |
| `docs/plans/CURSOR-HARNESS-INBOX.md` | Optional Cursor↔terminal coordination |

---

## 3. Live twin scoreboard (SIGHT 2026-07-31 ~08:00 BST)

| Gate | Live status |
|---|---|
| `ship_ok` | **false** |
| Homologation | **NOT_HOMOLOGATED** |
| Architecture blockers OPEN | **1** — `EM_TORQUE_VS_ROTOR_BORE` |
| EM mean \|T\| | **118.75 N·m** vs required **125.21** (ratio mean **0.948**) |
| EM peak \|T\| | **~207** — **must not** clear duty alone |
| `torque_reliable` | **false** |
| FEMM positions | **4** — need **≥36** after DEC-EM-1 |
| Oil cornering / gallery | **CLEARED (screening)** — slosh **30 mm**, jet **Ø1.8 mm**, charge **~626.4 ml** |
| Oil free-surface CFD / bench | **OPEN (Bar B)** — do not claim closed |
| Provenance | **PASS** (gear face ≠ module) |
| Quantity lineage | Present (`fpk_quantity_lineage.py` + twin JSON) |
| Form meshes | **218** ids in `form-meshes.json` |
| Blender coverage JSON | `ok=true`, missing **0** — **≠ Tristan can see parts** |
| Mesh authenticity JSON | score **1.0** principals — **≠** sphere-proxy SIGHT pass |
| Blender PNGs | Present (~07:55–08:01) — **human acceptance failed** |
| Council | **PUSH_WITH_HOLDS** (OpenRouter 402 → fallback seats; re-run when billing works) |

**Blocker evidence path:**  
`out/formula-e-front-mgu-20260729-1432/_motor_stack/em_fia_front_kit_case.json`  
→ `loaded_point.duty_torque_screen_ok=false`, `rotor_position_sweep.summary.n_positions=4`

**Oil must-not-regress:**  
`_motor_stack/gear_oil_fia_front_kit_case.json` → `screening_results.cornering_pickup_ok=true`, `pickup_gallery_adequate=true`, `input_quantities.gear_oil_volume_ml≈626.4`

---

## 4. Tristan’s unanswered Blender questions — P0 #1

These were asked and **not answered by a successful artefact**. Treat them as acceptance criteria, not nice-to-haves.

### 4.1 What Tristan said (paraphrase + intent)

1. He has **not seen** a usable Blender **cutaway** — insides still feel like a black box.  
2. He has **not seen** a usable **parts decomposition / expansion** where he can tell parts apart.  
3. He can see that various parts *exist in data*, but cannot **see them in the render**.  
4. He wants Blender to show **all the parts almost laid out on a big piece of paper** so he can inventory them and know they are really in the system.

### 4.2 Why current artefacts fail him (do not argue with logs)

| Artefact | Intent | Why Tristan still fails |
|---|---|---|
| `00-hero.png` | Open cutaway / shell-off | Nest/planets/MCU under-read; reads sealed or cluttered — black-box feel |
| `08-product-ghost-shell.png` (+ 09–12) | Ghost cutaways | Same residual |
| `13-product-exploded.png` | Catalogue lattice explode (~181 meshes @ 110 mm) | Still sphere/cloud clutter; cannot inventory identities |
| `04–07-product-*.png` | Closed exterior | Correct for sealed product; **not** the interior ask |
| `product-3d-shell-{on,off}.{glb,usdz}` | Rotate in Quick Look | Useful; **not** a labelled parts catalogue |
| Coverage / authenticity JSON | Engine self-score | **Goodhart risk** — can pass while human cannot inventory |

**Code already landed (partial, not accepted):**  
`build_universal_scene.py` → `_fpk_explode_*`, `_fpk_apply_exploded_view`, `_FPK_EXPLODE_CATALOGUE_PITCH_M ≈ (110,100,95) mm`, `_fpk_apply_functional_section_view`.  
Log example: `moved=181 individual meshes (catalogue lattice, pitch=110mm)`.  
**Tristan’s eyes still reject it.** Raising pitch alone may help; **parts-on-paper + labels** is the requested UX.

### 4.3 Acceptance — Cutaway (`00-hero` / `08`)

All must be TRUE on a fresh force-render PNG:

- [ ] Hollow stator + rotor rear-half sections visible (not solid clay barrels)  
- [ ] Magnets distinct; sun + each planet + carrier + ring readable  
- [ ] Diff nest / post-diff / halfshaft flanges readable  
- [ ] MCU shelf: SiC modules + cold-plate + PCBs + busbars readable  
- [ ] Coolant / oil jets not fused into one blob  
- [ ] Opaque gearbox nest volume (`u_se_td_gearbox` etc.) hidden or transparent on open views so guts show  
- [ ] Tristan (or you as adversarial reviewer) can narrate the optical/mechanical story in one glance  

### 4.4 Acceptance — Parts-on-paper catalogue (**NEW — implement this**)

Tristan’s words: parts laid out on a big piece of paper.

**Implement a dedicated view** (do not pretend coaxial explode = paper layout):

| Requirement | Detail |
|---|---|
| Output | e.g. `14-product-parts-catalogue.png` (register in `render_view_contract.py`) |
| Population | Every inventoriable `u_se_td_*` story mesh (or BoM principal + story meshes) as its **own** object |
| Layout | Flat XY **grid on a light “paper” ground plane**; pitch large enough nothing overlaps at Excel-gallery size (start ≥120–150 mm; proveCatch floor) |
| Labels | Billboard text per part (human name from traction spine / form-meshes / ontology / BoM join) |
| Shells | Housing skins parked aside or omitted so guts dominate |
| Fragments | Tooth fragments stay nested on parent gear bodies (same discipline as explode) |
| Camera | Top-oblique orthographic; frame post-layout bbox × ~1.2 |
| Geometry source | **Same kit meshes** — never LLM collage / Midjourney poster |
| proveCatch | Catalogue mesh count ≥ ontology / form-mesh inventoriable set; adversarial tiny pitch fails; labels present |
| Human gate | Tristan can point: “that is the sun gear / magnet 3 / SiC mod 1” |

**Keep `13-product-exploded` as assembly-story explode.** Catalogue is the inventory view.

### 4.5 Recommended SOURCE implementation sketch

1. **`scripts/lib/render_view_contract.py`**  
   - Add view `product_parts_catalogue` → `14-product-parts-catalogue.png`  
   - Wire into sealed/traction product view lists the same way `13-product-exploded` is wired  

2. **`scripts/blender-universal/build_universal_scene.py`**  
   - New `_fpk_apply_parts_catalogue_view(view_name, entering)`  
   - Snap/restore locations like `_FPK_EXPLODE_LOC_SNAP`  
   - Sort meshes into rows by assembly family (MCU / EM / planetary / diff / cooling / fasteners)  
   - Place on paper plane; add subtle paper plane mesh under grid  
   - Create text objects (or Grease/label helper already in forge blender lib if present)  

3. **`scripts/render-blender-scene.py`**  
   - Ensure new view is rendered on `--force`  

4. **Guards**  
   - Extend explode/catalogue selftests near existing `_fpk_explode_delta_for` asserts (~line 14871+)  
   - Optional: `fpk_blender_coverage` assert that catalogue render lists N labelled principals  

5. **Force render + SIGHT**
```bash
python3 scripts/render-blender-scene.py \
  --state out/formula-e-front-mgu-20260729-1432/state.json \
  --out-dir out/formula-e-front-mgu-20260729-1432 \
  --force 2>&1 | tee /tmp/fe-blender-force.log
rg -n "fpk-explode|parts-catalogue|catalogue|00-hero|14-product" /tmp/fe-blender-force.log
open out/formula-e-front-mgu-20260729-1432/14-product-parts-catalogue.png
open out/formula-e-front-mgu-20260729-1432/00-hero.png
open out/formula-e-front-mgu-20260729-1432/13-product-exploded.png
open out/formula-e-front-mgu-20260729-1432/08-product-ghost-shell.png
```

6. **Copy into Excel design-pack gallery** after PNGs pass human SIGHT.  

7. **Write** twin `_autonomous/STATUS.md` “How to view” note:  
   - Cutaway → `00-hero` / `08` / USDZ shell-off  
   - Inventory → `14-product-parts-catalogue`  
   - Assembly explode → `13`  

### 4.6 Cutaway fix direction (after or with catalogue)

- Confirm `_fpk_apply_functional_section_view` shell-off + hollow rear-half + expose prefixes  
- Hide opaque `u_se_td_gearbox` nest on open views  
- Force planets / diff / PE / SiC visible  
- Re-SIGHT `00-hero.png`  
- Authenticity residual: sphere proxies for magnets/bearings/bolts → CAD/compound primitives (`seed_internal_cad_assets.py`, tier2 motor drivetrain) — **wrong shape is not fixed by more explode pitch**

### 4.7 Answer Tristan’s related BoM↔Blender dim questions (already worked; do not regress)

**Q: Does BoM emit full dims / material / weight? Does Blender use them?**  
**A (landed this Cursor stretch):** Universal helper `scripts/lib/bom_physical_properties.py` projects structured `dimensions_mm`, mass, material into BoM rows + Excel + Blender `extract_parts` / `_mat_for` / `parse_dimension`.  

**Q: Where did Blender get dims before?**  
Word `dimension`/`dimensions` → `parse_dimension` → duty/instrument proxy → `TYPE_DEFAULTS_MM`. Traction `u_se_td_*` story meshes still from **contract quantities** via `fpk_concentric_geometry` (do not silently override without DEC).  

**Leftovers scrubbed:** do not bake `· m=N kg` into `dimensions_mm`; classic parse uses `allow_structured=False` after structured pass to avoid double-parse.

---

## 5. Priority queue (exact order)

### P0-A — Blender visibility (FIRST HOURS — Tristan’s eyes)

1. Implement **parts-on-paper catalogue** (`14-…`) + proveCatch (§4.4–4.5).  
2. Force re-render; **open PNGs yourself**; fix until inventory works.  
3. Improve cutaway until §4.3 checklist passes.  
4. Replace worst sphere proxies with CAD/compounds if still unreadable after layout.  
5. Sync PNGs into Excel pack; update STATUS “How to view”.  
6. Update tracker §A6 + punchlist with honest SIGHT (not “rendered = done”).

### P0-B — EM architecture (blocks “architecture cleared”)

1. Get **DEC-EM-1** from Tristan (tracker A1 / A6b worksheet):  
   - (a) grow EM annulus / stack / poles in bay  
   - (b) external planetary (smaller bore)  
   - (c) re-freeze A-DUTY lower continuous front regen  
2. Geometry writeback → `fpk_concentric_geometry.py` + `em_fia_front_kit_case.py`  
3. FEMM with **≥36** rotor positions (not 4); MTPA angle discipline  
4. Never clear duty on peak alone; keep `torque_reliable=false` until denser map/dyno  
5. `fe-front-stamp-motor-multiphysics.py` → ABD + lineage + Excel LIVE  

### P1 — Restamp / honesty

- ABD pitch, Jack xlsx, redteam digest  
- Closeout council when OpenRouter billing works (`fe-front-closeout-council.py`)  
- Unify motor_stack hashes after restamp  

### P2 — Bar B partner loop (never invent)

Dyno, HIL, Gerbers, chassis XYZ, oil CFD/bench, flow bench, release CAD — use Jack email draft; do not fabricate CSVs/STEP.

### Explicitly do NOT

- Mint `ship_ok` or homologation  
- Invent XYZ / Gerbers / dyno  
- Peak-alone duty clear  
- Claim oil CFD closed because analytical screens pass  
- LLM beauty images / generative product posters  
- Mint a second twin “to be safe”  
- Declare Blender done because coverage JSON is green  

---

## 6. What Cursor already completed (SOURCE landed — may be UNCOMMITTED)

Working tree on `oxccu-efuel` was **dirty (~76 paths)** when this handover was written. Latest committed tip observed: `fe8ed43a0` (rotor FoS cite). **Do not assume session work is committed — `git status` before push.**

### Done / improved

| Area | Where |
|---|---|
| Oil screening architecture | `scripts/motor-stack/gear_oil_fia_front_kit_case.py` — baffled 30 mm / Ø1.8 / ~626 ml; adversarial proveCatch keeps bad kit FAIL |
| Provenance gear face≠module | `scripts/lib/provenance.py` |
| ABD pitch honesty | `scripts/lib/fpk_assumption_based_design.py` |
| Quantity lineage | `scripts/lib/fpk_quantity_lineage.py` + twin JSON |
| BoM physical props universal | `scripts/lib/bom_physical_properties.py` wired into requirements_bom / excel / blender / densify |
| Exploded catalogue lattice | `build_universal_scene.py` `_fpk_explode_*` — **not Tristan-accepted** |
| Closeout council script | `scripts/fe-front-closeout-council.py` + twin `_closeout_council_v1/` |
| Tracker / punchlist / this handover | `docs/plans/JLR-FE-FRONT-FPK-*2026-07-31.md` |

### Still OPEN (honest)

| Item | Notes |
|---|---|
| Blender cutaway human SIGHT | Black box residual |
| Parts-on-paper catalogue | **Not implemented** — Tristan’s explicit ask |
| Exploded inventory | Lattice landed; still fails identity |
| `EM_TORQUE_VS_ROTOR_BORE` | OPEN; DEC-EM-1 + ≥36-pos FEMM |
| All Bar B holds | Dyno/HIL/Gerbers/XYZ/oil CFD/flow/CAD |

---

## 7. Code map (edit here)

| Concern | Path |
|---|---|
| Universal Blender scene / FPK place / explode / section | `scripts/blender-universal/build_universal_scene.py` |
| View contract (add `14-product-parts-catalogue`) | `scripts/lib/render_view_contract.py` |
| Render entry | `scripts/render-blender-scene.py` |
| Blender helpers | `scripts/blender-templates/forge_blender_lib.py` |
| Concentric mm / bay | `scripts/lib/fpk_concentric_geometry.py` |
| EM FEMM case | `scripts/motor-stack/em_fia_front_kit_case.py` |
| Oil case | `scripts/motor-stack/gear_oil_fia_front_kit_case.py` |
| Multiphysics stamp | `scripts/fe-front-stamp-motor-multiphysics.py`, `scripts/lib/motor_multiphysics_stamp.py` |
| ABD / Bar B readiness | `scripts/lib/fpk_assumption_based_design.py`, `scripts/lib/fpk_bar_b_readiness.py` |
| BoM physics contract | `scripts/lib/bom_physical_properties.py` |
| BoM assemble | `scripts/requirements_bom.py` |
| Excel ledger | `scripts/build-excel-export.py` |
| FPK densify | `scripts/fe-front-densify-bom-from-physics-tree.py` |
| Blender coverage | `scripts/lib/fpk_blender_coverage.py` |
| Mesh authenticity | `scripts/lib/fpk_mesh_authenticity.py` |
| Traction spine | `scripts/lib/traction_spine_manifest.py` |
| Provenance / lineage | `scripts/lib/provenance.py`, `scripts/lib/fpk_quantity_lineage.py` |
| CAD seed / compounds | `scripts/ingest/seed_internal_cad_assets.py`, `Tier 1 and 2 parts for cad /tier2_motor_drivetrain.py` |
| GA drawings | `scripts/blender-universal/draw_ga.py` |

---

## 8. Dimension authority (avoid dual leftovers)

**Word → Part.dim (universal sealed/plant/instrument path):**  
1. `bom_physical_properties.extract_physical_props(mods)` → `props_to_blender_dim`  
2. Else classic `parse_dimension(..., allow_structured=False)` on `dimension`/`dimensions`  
3. Else duty-scaled machine default  
4. Else instrument proxy  
5. Else `TYPE_DEFAULTS_MM`  

**FPK concentric story meshes:** contract quantities via `fpk_concentric_geometry` only — do **not** silently override with BoM word dims inside `_place_traction_drive_pack_layout` without an explicit DEC.  

**Mass:** field `mass_kg` only — never re-append into `dimensions_mm`.

---

## 9. Key commands

```bash
cd /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel

# Guards
python3 scripts/lib/bom_physical_properties.py
python3 scripts/requirements_bom.py --selftest
python3 scripts/motor-stack/gear_oil_fia_front_kit_case.py --selftest

# Force Blender after code changes
python3 scripts/render-blender-scene.py \
  --state out/formula-e-front-mgu-20260729-1432/state.json \
  --out-dir out/formula-e-front-mgu-20260729-1432 \
  --force 2>&1 | tee /tmp/fe-blender-force.log

# Multiphysics restamp (after EM geometry)
python3 scripts/fe-front-stamp-motor-multiphysics.py \
  --state out/formula-e-front-mgu-20260729-1432/state.json

# Council when OpenRouter billing works
python3 scripts/fe-front-closeout-council.py --rebuild-digest

# Scoreboard peek
python3 - <<'PY'
import json
from pathlib import Path
p=Path('out/formula-e-front-mgu-20260729-1432')
mp=json.loads((p/'motor-multiphysics.json').read_text())
print('ship_ok', mp.get('ship_ok'))
print('blockers', [b.get('blocker_id') for b in (mp.get('architectureBlockers') or [])])
oil=json.loads((p/'_motor_stack/gear_oil_fia_front_kit_case.json').read_text())
print('oil', oil['screening_results']['cornering_pickup_ok'], oil['screening_results']['pickup_gallery_adequate'], oil['input_quantities'].get('gear_oil_volume_ml'))
em=json.loads((p/'_motor_stack/em_fia_front_kit_case.json').read_text())
lp=em['loaded_point']
print('EM mean', lp['torque_magnitude_mean_nm'], 'req', lp['required_shaft_torque_nm'], 'ok', lp['duty_torque_screen_ok'], 'n_pos', em['rotor_position_sweep']['summary']['n_positions'])
PY
```

**Open for Tristan / you:**
```bash
open out/formula-e-front-mgu-20260729-1432/00-hero.png
open out/formula-e-front-mgu-20260729-1432/13-product-exploded.png
open out/formula-e-front-mgu-20260729-1432/08-product-ghost-shell.png
open out/formula-e-front-mgu-20260729-1432/14-product-parts-catalogue.png   # after you add it
open out/formula-e-front-mgu-20260729-1432/product-3d-shell-off.usdz
open out/formula-e-front-mgu-20260729-1432/drawings/general-arrangement.png
```

---

## 10. Definition of done (next Claude Code stretch)

Tristan can honestly say yes to **all** of:

1. “I can see inside the cutaway.”  
2. “I can see every part laid out on the paper catalogue; I know they are in the system.”  
3. “EM either clears under mean+reliable rules or we have a named DEC-EM-1 with Jack freeze.”  
4. “Oil screens still clear; adversarial still fails the bad kit.”  
5. “`ship_ok` is still false; Bar B asks are honest.”  
6. Tracker + punchlist match live twin (no ‘0 OPEN’ lies).  

Until (1) and (2) are true, **do not** spend the bulk of the session on email polish, new twins, or council theatre.

---

## 11. Paste-ready first prompt for Claude Code

Copy-paste this as the first user message:

```text
Read end-to-end:
  docs/plans/CURSOR-TO-CLAUDE-CODE-HANDOVER-FE-FRONT-FPK-2026-07-31.md
  docs/plans/JLR-FE-FRONT-FPK-BAR-A-BAR-B-CLOSEOUT-TRACKER-2026-07-31.md
  OPERATING-FRAME-2026-06.md (§0.5 SIGHT + standing directive)
  CLAUDE.md CORE FIX PRINCIPLE + GATE INTENT

Twin ONLY: out/formula-e-front-mgu-20260729-1432/
Branch: oxccu-efuel
ship_ok stays false. Fix at SOURCE + proveCatch. No LLM product images.

P0 FIRST — Tristan’s unanswered Blender ask (human SIGHT is the gate):
  He cannot see the cutaway (black box). He cannot inventory exploded parts.
  He wants ALL kit parts laid out on a big piece of paper with labels so he
  can see what they are and know they are in the system.
  Implement 14-product-parts-catalogue.png (parts-on-paper grid) in
  render_view_contract.py + build_universal_scene.py, proveCatch, force-render,
  OPEN the PNGs yourself, then fix 00-hero cutaway until nest+MCU guts read.
  Do NOT declare done from coverage JSON or render logs alone.
  Keep 13 as assembly explode; catalogue is the inventory view.

P0 SECOND — EM_TORQUE_VS_ROTOR_BORE (mean ~118.75 < req ~125.21; n_pos=4;
  torque_reliable=false). Need DEC-EM-1 then denser FEMM (≥36). Never peak-alone.

Then restamp multiphysics/ABD/lineage/Excel; refresh tracker honesty.
Oil screens must not regress (30 mm / Ø1.8 / ~626 ml; adversarial bad kit FAIL).

Working tree may be dirty — git status before commit. Do not mint a new twin.
```

---

## 12. Git / dirty-tree note

When this was written, `git status` showed many modified scripts (Blender, oil, ABD, excel, densify, provenance, …) plus untracked tracker/handover docs. Session tip commits on branch were around `fe8ed43a0` / `ecf7fb916` / `c2a363944` (Bar B / rotor FoS). **Review and commit deliberately** with Tristan’s usual discipline; do not dump unrelated logs (`out-formula-e-*.log`) into commits.

---

## 13. Session memory pointers

- Daily: `~/.memory/daily/2026-07-31.md`  
- Carry-forward: FE FPK P0 EM + Blender human SIGHT / parts-on-paper  
- This handover supersedes earlier shorter Cursor↔Claude notes for FE Front FPK  

---

*End of handover. Claude Code: start at §5 P0-A — Tristan’s eyes are the gate. Parts on paper. Then cutaway. Then EM.*
