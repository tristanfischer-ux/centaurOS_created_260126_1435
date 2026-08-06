# Anvil geometry kernel — CAD-first design

**Date:** 2026-08-06  
**Status:** Implemented through FreeCAD smoke + kernel master enforcement + port-face paths + export_step merge — 2026-08-06  
**Owner:** Anvil / CentaurOS geometry pipeline  
**Readers:** Tristan + implementers  

### Implementation status (shipped)

| PR | Deliverable | Location |
|---|---|---|
| PR1 | IR + completeness | `scripts/lib/geometry_ir.py`, `geometry_completeness.py` |
| PR2 | STEP export (CadQuery) | `scripts/lib/geometry_step_export.py` |
| PR3 | Path router | `scripts/lib/geometry_path_router.py` |
| PR4 | Blender import contract JSON | written by `geometry_kernel.py` → `blender_import.json` |
| PR5 | Domain grade + pack chrome | `domain_product_quality.py`, `build_send_pack.copy_geometry` |
| PR6 | Print subset STL | `geometry/print/*.stl` for `print_role` parts |
| CLI | Twin → geometry/ | `scripts/geometry-kernel-build.py` |

**Proved on disk:** bio `organoid-9drive-r11-allfixes` (STEP ~611 KB, completeness 10/10) and FE `formula-e-front-mgu-20260729-1432` (STEP ~1.2 MB, 18 paths). Open `geometry/assembly.step` in FreeCAD.

### Decisions already taken (from discussion)

| Decision | Choice |
|---|---|
| Master geometry | **Not Blender.** Parametric kernel authors solids + paths. |
| Customer / Tristan open format | **STEP assembly** (opens in free tools; no SolidWorks licence required) |
| Authoring runtime | **B or D:** FreeCAD / CadQuery / Build123d-class kernel, not commercial CAD API |
| Blender role | **Downstream film only** — import kernel geometry; no layout authority |
| Completeness | Every BoM principal is **solid**, **path**, **consumable**, or **OPEN hold** |
| Print claim | **Print subset** (3MF/STL for tagged parts), never “whole product printable” |

### Non-commercial open path (explicit requirement)

Tristan must open the deliverable on a **non-commercial** stack on his own machine:

| Tool | Cost | Opens |
|---|---|---|
| **FreeCAD** | Free | STEP assemblies, meshes |
| **CadQuery / Build123d** (Python) | Free | Author + STEP export |
| **Blender** | Free | Film / GLB review (secondary) |
| **Online STEP viewers** | Free | Quick look without install |

**Not required:** SolidWorks, AutoCAD, Onshape paid seats.  
**Still valuable:** STEP that *also* opens cleanly in SolidWorks when a partner has it.

---

## 1. Problem statement

Today Anvil’s strongest 3D path is **Blender mesh presentation** plus **SVG/PDF drawings** that approximate placement. That produces good review packs but:

1. Cannot be treated as fab CAD.  
2. Does not guarantee every BoM line appears in 3D.  
3. Wiring / tubing are under-represented.  
4. Drawings and film can drift from each other.  
5. “Looks finished” scores higher than “is complete.”

**Goal:** One **geometry kernel** produces a **tagged STEP tree** as master; drawings and Blender **consume** it; completeness **gates** bind pack quality.

---

## 2. Goals and non-goals

### Goals

1. **G1 — STEP master:** Every product-scale twin can emit `geometry/assembly.step` (or equivalent path) with a part tree.  
2. **G2 — Free open:** Tristan opens that STEP in FreeCAD (or equivalent free viewer) without paid CAD.  
3. **G3 — BoM coupling:** Assembly node names/tags match BoM / parts-ledger principals.  
4. **G4 — Paths:** Principal power / fluid / signal connections become 3D paths (or OPEN holds).  
5. **G5 — Blender demotion:** Blender imports kernel meshes; does not invent placement.  
6. **G6 — Completeness gates:** Missing principal geometry without hold fails domain/geometry grade.  
7. **G7 — Universal:** Role ontology + connection kinds — not bioreactor/motor forks.  
8. **G8 — Honest print:** Optional 3MF for `print_role` parts only, with manifold checks.

### Non-goals (this programme)

- Full SolidWorks feature history (extrude/fillet tree).  
- Printing motors, SiC modules, PCBA, sterile validation.  
- Every wire in a vehicle harness on day one (start with **principal** nets).  
- Replacing Excel dossier or EM fieldplots.  
- Killing Blender film in pack (only killing Blender-as-master).

---

## 3. Architecture

```text
  state.json + parts-ledger + connection-ledger + quantities
                         │
                         ▼
              ┌──────────────────────┐
              │  GEOMETRY KERNEL     │
              │  (CadQuery/Build123d │
              │   or FreeCAD headless│
              │   + path router)     │
              └──────────┬───────────┘
                         │
           geometry/assembly.json  (IR — intermediate representation)
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   assembly.step    drawings/*       blender import
   (MASTER CAD)     (projections)    (materials/lights)
         │               │               │
         ▼               ▼               ▼
   FreeCAD open     PDF/SVG pack      hero/ghost PNG
```

**Authority order (when sources disagree):**

1. Kernel IR + STEP  
2. Drawings derived from IR  
3. Blender film  
4. Freehand SVG / legacy mesh (deprecated)

---

## 4. Geometry intermediate representation (IR)

All exporters read one IR. Path under twin:

```text
<twin>/geometry/
  assembly.json          # IR master (git-friendly, diffable)
  assembly.step          # BREP export for FreeCAD / partners
  parts/<tag>.step       # optional per-part STEP
  paths/<edge_id>.json   # centreline + section for harness/tube
  print/<tag>.3mf        # only if print_role set
  completeness.json      # gate report
  blender_import.json    # mapping IR → Blender collection names
```

### 4.1 `assembly.json` schema (v1)

```json
{
  "schema": "anvil.geometry_assembly/1",
  "units": "mm",
  "frame": {
    "origin": "site_min",
    "note": "World frame origin-shifted to parts-manifest site min for export"
  },
  "components": [
    {
      "tag": "X-104",
      "name": "Sterile Filter Vent",
      "role": "vent",
      "geometry_kind": "solid",
      "family": "cylinder",
      "params_mm": { "dia": 30, "len": 20 },
      "pose": {
        "origin_mm": [x, y, z],
        "rotation_rpy_deg": [0, 0, 0]
      },
      "material": "ptfe_or_polymer",
      "bom_ref": "requirementsBom|tag=X-104",
      "geometry_source": "parametric_family",
      "print_role": null,
      "mpn": null,
      "status": "PLACED"
    }
  ],
  "paths": [
    {
      "id": "conn-12",
      "kind": "fluid",
      "from_tag": "vessel",
      "to_tag": "X-104",
      "section": { "type": "tube", "id_mm": 4, "od_mm": 6 },
      "centreline_mm": [[...], [...]],
      "status": "ROUTED"
    }
  ],
  "holds": [
    {
      "tag": "I-1",
      "geometry_kind": "open",
      "reason": "OD600 full path fixture not frozen",
      "status": "OPEN"
    }
  ],
  "consumables": [
    {
      "tag": "media-tubing-set",
      "geometry_kind": "consumable_no_mesh",
      "reason": "length take-off only"
    }
  ]
}
```

### 4.2 `geometry_kind` (closed enum)

| Kind | Meaning | Must appear in STEP? |
|---|---|---|
| `solid` | Discrete part solid | Yes |
| `path` | Wire / tube / bus sweep | Yes (as solid sweep or centreline curve) |
| `consumable_no_mesh` | BoM only | No |
| `open` | Hold — deliberately absent | No (listed in completeness + holds) |
| `envelope_only` | Black-box OEM | Yes (box/cylinder only) |

### 4.3 Parametric families (v1 library)

Universal families — extend by role, not by product class:

| Family | Params | Typical roles |
|---|---|---|
| `box` | w, d, h | Enclosure, PCB outline, TEC, HMI |
| `cylinder` | dia, len | Motor, vessel, filter, shaft |
| `board` | w, d, h_mm (thin) | PCB |
| `flange_port` | dia, standout | Coolant QD, cable gland |
| `path_sweep` | section + centreline | Cable, tube |
| `envelope` | w, d, h | OEM black box |

Later: import supplier STEP when `geometry_source=supplier_step` and file exists under `geometry/library/`.

---

## 5. Kernel contract (authoring engine)

### 5.1 Inputs (read-only)

| Input | Use |
|---|---|
| `state.json` → quantities, `isInstrumentDevice`, pcb honesty | Envelope, path lengths, class signals |
| `parts-manifest.json` | Initial poses if present (bootstrap) |
| `parts-ledger.json` / `requirementsBom` | Principal set + names |
| `connection-ledger.json` | Path graph |
| Optional: existing Blender mesh | **Import only as bootstrap**, then freeze IR |

### 5.2 Responsibilities

1. **Enumerate principals** from BoM/ledger (same principal definition as Part names).  
2. **Assign family + params** from dims_mm, role nouns, or catalogue geometry table.  
3. **Pose** each solid (from manifest, or layout solver v1 = use manifest / simple packer).  
4. **Route principal paths** for connection edges of kind power/fluid/signal (v1: straight + via keep-out box; v2: clearance A*).  
5. **Emit IR** + **STEP** + **completeness.json**.  
6. **Never** invent catalogue MPNs; OPEN is allowed.

### 5.3 Technology choice (B/D)

| Layer | Choice | Rationale |
|---|---|---|
| Solid modelling | **CadQuery or Build123d** (Python) | Free, scriptable, STEP export, CI-friendly |
| Fallback | FreeCAD headless macros | If CQ unavailable on a machine |
| Path routing | Pure Python in `scripts/lib/geometry_path_router.py` | No Blender dependency |
| Orchestrator | `scripts/lib/geometry_kernel.py` + CLI `scripts/geometry-kernel-build.py` | Twin in → geometry/ out |

**CI:** Prefer CadQuery in venv; skip STEP golden tests if binary missing but keep IR + completeness unit tests pure.

### 5.4 CLI contract

```bash
python3 scripts/geometry-kernel-build.py <twin_dir>
# writes geometry/assembly.json, assembly.step, completeness.json
# exit 0 = IR written; exit 2 = missing inputs; exit 3 = completeness HARD fail (optional --strict)
```

Flags:

| Flag | Meaning |
|---|---|
| `--strict` | HARD fail if any principal missing solid/path/hold |
| `--no-step` | IR only (dev) |
| `--import-manifest-poses` | Use parts-manifest poses (default true) |
| `--route-paths` | Build path sweeps (default true for principal edges) |

---

## 6. STEP tree rules

### 6.1 Tree shape

```text
Assembly_<twin_slug>
 ├── solid_<tag>_<sanitised_name>
 ├── solid_<tag>_...
 ├── path_<edge_id>_<kind>
 └── _HOLDS (empty compound or omitted; holds live in JSON)
```

### 6.2 Naming rules

| Rule | Example |
|---|---|
| Component name starts with tag when tag exists | `X-104_Sterile_Filter_Vent` |
| Sanitize: `[A-Za-z0-9_]` only | spaces → `_` |
| Path names include kind | `path_conn12_fluid` |
| No duplicate names | suffix `_2` if collision |
| Units mm | documented in IR |

### 6.3 Colour / layer (optional v1)

- Solids: default grey  
- Fluid paths: blue  
- Power paths: orange  
- Signal paths: green  

FreeCAD will still open without colours.

### 6.4 Validation (automated)

| Check | Fail |
|---|---|
| STEP file non-empty and parseable (FreeCAD or steputils/cadquery) | HARD |
| Every `geometry_kind=solid|path` in IR has a STEP entity | HARD |
| Tag set of solids ⊆ BoM principals ∪ manifest | HARD |
| Orphan STEP bodies without IR | MED |

### 6.5 FreeCAD open procedure (for Tristan)

1. Install FreeCAD (free) from freecad.org.  
2. File → Open → `geometry/assembly.step`.  
3. Model tree shows parts by tag.  
4. Optional: open `geometry/assembly.json` in any editor for holds list.

No licence. No SolidWorks.

---

## 7. Blender import contract

### 7.1 Principle

Blender **must not** place principals. It **imports** kernel meshes (or STEP via converter) and applies:

- Materials by `material` / role  
- Cameras from existing product templates  
- Lights / world  
- Cutaway modifiers for ghost views  

### 7.2 Import mapping (`blender_import.json`)

```json
{
  "schema": "anvil.blender_import/1",
  "assembly_step": "geometry/assembly.step",
  "collections": {
    "solids": ["X-104_...", "..."],
    "paths": ["path_conn12_fluid"]
  },
  "material_by_role": {
    "enclosure": "anvil_aluminium",
    "vessel": "anvil_clear_polymer",
    "pcb": "anvil_fr4"
  },
  "forbid_freehand_principals": true
}
```

### 7.3 Deprecation flags

| Env / flag | Behaviour |
|---|---|
| `ANVIL_GEOMETRY_MASTER=kernel` | Layout stages skip Blender placement; import only |
| `ANVIL_GEOMETRY_MASTER=legacy_blender` | Current behaviour (default until kernel green) |
| `ANVIL_REQUIRE_STEP=1` | Pack stage fails without `geometry/assembly.step` |

### 7.4 Dual-run period

Until kernel is trusted:

1. Kernel builds IR+STEP.  
2. Blender can still run **legacy** for film if `legacy_blender`.  
3. Pack ships **both** with banner: “STEP is master when present.”  
4. Completeness gate scores kernel only.

---

## 8. Completeness gates

### 8.1 Report: `geometry/completeness.json`

```json
{
  "schema": "anvil.geometry_completeness/1",
  "n_principals": 40,
  "n_solid": 32,
  "n_path": 8,
  "n_consumable": 3,
  "n_open_holds": 5,
  "missing": [],
  "path_coverage": { "principal_edges": 20, "routed": 14, "held_open": 6 },
  "score": 8.0,
  "binding_high": false,
  "defects": []
}
```

### 8.2 Scoring (feeds domain product quality later)

| Condition | Severity | Effect |
|---|---|---|
| Principal with no solid/path/consumable/open | **HIGH** | completeness ≤ 4; bind domain geometry axis |
| Principal path edge unrouted and not OPEN | **HIGH** | same |
| Consumable without classification | **MED** | cap 7 |
| STEP missing when `--strict` | **HIGH** | exit 3 |
| Print part non-manifold | **MED** | print subset fail only |

### 8.3 Relation to existing grades

| Grade | Geometry role |
|---|---|
| Tab floor | Unchanged contracts |
| Domain product quality | Add `geometry_completeness` defects when kernel present |
| Release readiness | STEP presence does **not** mean fab-ready |
| Cover dual grade | Show “Geometry completeness N/10” when IR exists |

### 8.4 Gate names (for CI / excel)

- `G-BOM-GEO` — principals covered  
- `G-CONN-3D` — principal edges routed or held  
- `G-STEP` — STEP parse OK  
- `G-DRAW-SYNC` — later: drawing tags ⊆ IR tags  
- `G-BLEND-SLAVE` — later: Blender scene principals ⊆ IR tags  

---

## 9. Path routing (wiring & tubing)

### 9.1 v1 (ship with kernel MVP)

- Input: connection-ledger rows with `kind` ∈ {power, fluid, signal}  
- Skip edges already banned by `instrument_connection_kinds`  
- Route: straight segment + vertical riser if z differs; optional midpoints at enclosure channel  
- Section defaults by kind:

| Kind | Default section |
|---|---|
| power | cable OD 4 mm |
| signal | cable OD 2 mm |
| fluid | tube ID 4 / OD 6 mm |

### 9.2 v2

- Clearance grid from solid AABBs  
- Min bend radius by section  
- Through-port snapping when flange_port family present  

### 9.3 Honesty

If routing fails → **OPEN hold** on that edge with reason, not a fake snake through the vessel.

---

## 10. Drawings (post-kernel)

Near-term (reuse pack-parity):

- Keep `draw_pack_parity_sheets.py` but **prefer IR poses** when `geometry/assembly.json` exists.  

Medium-term:

- Orthographic SVG from IR AABBs (same as now but IR-fed).  
- True FreeCAD TechDraw later (optional).  

Rule: **balloons only for IR tags**.

---

## 11. Print subset

| Field | Values |
|---|---|
| `print_role` | `null` \| `enclosure` \| `fixture` \| `manifold` \| `prototype_shell` |

Pipeline:

1. Kernel marks printables (rules: enclosure shell, 3D-printed fixtures — never PCB/motor).  
2. Export 3MF/STL.  
3. Manifold + min wall thickness check (configurable).  
4. Pack folder `geometry/print/`.  

Cover: “Printable subset only — not the full product.”

---

## 12. Universal vs twin-specific

| Universal (code) | Twin data |
|---|---|
| IR schema, STEP naming, CLI | Actual poses, MPNs |
| Family library box/cylinder/board | Which family each tag uses |
| Path router + connection kinds | Which edges exist |
| Completeness gate math | Which holds are open |
| Blender import materials map | Product-specific textures later |

**Forbidden:** `if product_class == bioreactor` in kernel core.  
**Allowed:** noun signals (`vessel`, `od sensor`, `ipmsm`) already used elsewhere.

---

## 13. Migration from current Blender pipeline

| Stage | Blender | Kernel |
|---|---|---|
| **Now** | Master placement | Design only |
| **MVP** | Film from legacy *or* import | IR+STEP+completeness |
| **Default** | Import IR only | Master |
| **Strict packs** | Optional | Required STEP |

Bootstrap: first kernel version **reads parts-manifest poses** so quality does not regress while paths and STEP land.

---

## 14. Implementation plan (PR stack)

### PR1 — IR + completeness (no STEP required)

- `scripts/lib/geometry_ir.py` — schema load/save/validate  
- `scripts/lib/geometry_completeness.py` — G-BOM-GEO  
- `scripts/geometry-kernel-build.py` — build IR from manifest+BoM (solids only)  
- Unit tests: IR round-trip, missing principal → HIGH  

**Done when:** bio + FE twins write `geometry/assembly.json` + completeness report.

### PR2 — STEP export via CadQuery/Build123d

- Export assembly.step from IR families  
- FreeCAD open smoke (local script; CI optional)  
- `ANVIL_REQUIRE_STEP` pack flag  

**Done when:** Tristan opens bio STEP in FreeCAD; tree shows principal tags.

### PR3 — Path routing

- `geometry_path_router.py`  
- Paths in IR + STEP sweeps  
- G-CONN-3D  

**Done when:** principal fluid/power edges routed or OPEN on bio.

### PR4 — Blender import slave mode

- Import STEP/mesh from geometry/  
- `ANVIL_GEOMETRY_MASTER=kernel`  
- Forbid freehand principal creation when flag set  

**Done when:** hero render can be produced from kernel import on one twin.

### PR5 — Domain grade + pack chrome

- Geometry completeness into domain product quality  
- Cover line: Geometry completeness N/10  
- Pack always includes `geometry/` when present  

### PR6 — Print subset (optional)

- 3MF + manifold gate for print_role parts only  

---

## 15. Success criteria (programme)

1. **FreeCAD open:** `geometry/assembly.step` opens locally without paid software.  
2. **Tag parity:** ≥95% of BoM principals are solid, path, consumable, or OPEN.  
3. **No silent ghosts:** missing principal → completeness HIGH.  
4. **Paths:** principal connection edges routed or held open with reason.  
5. **Blender optional:** pack valid with STEP+drawings even if Blender skipped.  
6. **Universal tests:** motor twin + instrument twin both emit IR (dual-class).  
7. **Honesty:** ship_ok still false without HIL/Gerbers; STEP ≠ fab-ready.

---

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| CadQuery install pain on macOS | IR-first; STEP optional; document brew/pip |
| Ugly STEP vs pretty Blender | Film stays; claim CAD for engineering |
| Over-routing fake wires | Principal edges only; OPEN on failure |
| Dual sources during migration | Authority order + master flag |
| Performance on large plants | LOD envelopes for non-principals |

---

## 17. Documentation for Tristan (user-facing later)

Short pack note `geometry/README.txt`:

```text
Anvil geometry (CAD master)
─────────────────────────
1. Open assembly.step in FreeCAD (free) — this is the engineering model.
2. assembly.json lists solids, paths, and OPEN holds.
3. completeness.json scores BoM↔geometry coverage.
4. Blender images in renders/ are film of this model (or legacy until migration completes).
5. STEP is not supplier fab-ready and not a substitute for HIL/Gerbers.
```

---

## 18. Immediate next action after this doc

**Implement PR1** (IR + completeness + CLI) so the contract is real code, then PR2 STEP so FreeCAD open is demonstrable on the bioreactor twin.

No Blender deprecation flag until PR2 is green on dual-class smoke.

---

## 19. References (existing Anvil work)

- Pack parity drawings: `scripts/blender-universal/draw_pack_parity_sheets.py`  
- Domain product grade: `scripts/lib/domain_product_quality.py`  
- Connection bans: `scripts/lib/instrument_connection_kinds.py`  
- Topology prune: `scripts/lib/topology_prune.py`  
- Educational CAD seeding notes: `docs/plans/EDUCATIONAL-CAD-FAMILY-SEEDING-PLAN-2026-07-30.md`  

---

*End of design. Implementation starts at PR1 when scheduled.*
