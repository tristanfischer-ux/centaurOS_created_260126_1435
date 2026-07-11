# Universal Blender Image Quality Plan

**Objective:** materially raise the realism, correctness and usefulness of the
Blender images delivered in `dossier.xlsx`, universally across product classes.

**Scope:** plan only. No engine implementation in this document.

## 1. Current delivered evidence

Final Powerwall dossier:

- Run: `out/powerwall-20260711-1432`
- Workbook: `dossier.xlsx`
- Excel `Renders` tab embeds exactly three images:
  1. `00-hero.png`
  2. `01-top.png`
  3. `inspect-side.png`

Actual findings:

| View | Assessment | Defect |
|---|---|---|
| `00-hero.png` | Structurally readable, visually synthetic | Primitive slabs/cylinders, flat surfaces, translucent shell, weak manufacturing detail |
| `01-top.png` | Not useful | Tall wall product appears as a thin top edge; most of the frame is empty |
| `inspect-side.png` | Incorrect delivery view | Mounting wall dominates in orange; product internals collapse into abstract overlapping blocks |
| `02-corner-FR.png` | Broken camera | Nearly blank backdrop because camera sits behind the mounting wall |
| `03-corner-BL.png` | Best alternate | Product visible, but still a simplified CAD illustration |
| `inspect-front.png` | Engineering-debug view only | Orange wall + flat false-colour blocks; unsuitable for a customer workbook |

The current gallery selection is hardcoded in
`scripts/build-excel-export.py::_GALLERY_VIEWS`. It always prefers hero + top +
inspect-side, even when top/side are meaningless for the form factor.

### Important: this is not only decoration

The final rendered product bbox is:

```text
531 × 156 × 977 mm
```

The brief target is:

```text
609 × 193 × 1105 mm
```

The contract carries `enclosure_volume_m3` but no authoritative enclosure
length/width/height quantities. Therefore camera polish alone cannot make the
image correct: envelope geometry must be closed first.

## 2. Root causes

### 2.1 View selection is not form-factor aware

`_GALLERY_VIEWS` assumes a process plant:

- top plan;
- side elevation for underground equipment;
- hero isometric.

That is appropriate for a plant, but wrong for a wall-mounted appliance.

### 2.2 Camera grammar is generic and orthographic

`forge_blender_lib.py::nine_shot_cameras()` emits:

- top;
- front-right;
- back-left.

All use orthographic cameras. There is no service-face normal, wall normal,
visibility test or form-factor-specific camera contract. One Powerwall corner
camera therefore renders from behind the wall.

### 2.3 Geometry is mostly primitive approximation

The Anvil Blender path does not consume the existing CadQuery/component library.
Most parts resolve through:

- name/form regex;
- default dimensions;
- box/cylinder/vessel builders.

The repo contains approximately 274 parametric geometry types and an MPN-linked
component catalogue, but this is currently a parallel Cad Lab system.

### 2.4 Materials are diagrammatic

- flat Principled BSDF colours;
- no normal maps or procedural surface detail;
- no universal micro-bevel;
- inconsistent sRGB-to-linear conversion outside the sealed-product path;
- translucent ghost shells;
- EEVEE hero by default.

### 2.5 The current vision gate checks architecture, not realism

The strict product prompt checks whether pack, power electronics, BMS, thermal
path and interfaces are visible. It can pass a recognisable CAD diagram that
still does not look like a real manufactured product.

## 3. Target output contract

Every Blender image embedded in Excel must satisfy all four:

1. **Correct:** dimensions, orientation, components and interfaces agree with
   the settled design.
2. **Useful:** the view reveals information not already shown by another image.
3. **Well framed:** no blank/occluded view; product occupies 55–85% of frame.
4. **Credible:** materials, edges, lighting and component silhouettes resemble
   manufactured hardware.

### Scale-aware geometry fidelity

Geometry fidelity must depend on how large a part appears in the final Excel
image, not on a product-class slug.

| Visual regime | Typical output | Required geometry |
|---|---|---|
| Campus/plant | Part occupies <8–12 px | Simplified equipment-class geometry is acceptable |
| Machine/skid | Principal part occupies 12–80 px | Parametric family geometry with recognisable silhouette |
| Cabinet/product | Principal part occupies >80 px | Exact or verified family CAD for visible principal parts |
| PCB/handheld | Connectors/packages visibly resolved | Exact package/connector CAD; board-level assembly geometry |

A primitive box is allowed only when:

- the part is hidden;
- it occupies fewer than the configured pixel threshold; or
- exact/family CAD is unresolved and the image states that limitation.

### Form-factor-aware required views

#### A. Wall-mounted / sealed product

1. Exterior front three-quarter
2. Interior cutaway front three-quarter
3. Opposite front three-quarter
4. Side profile
5. Bottom/service-interface close-up
6. Rear mounting view when installation is relevant

Do **not** require a pure top plan or underground side elevation.

#### B. Container / cabinet

1. Exterior hero
2. Interior cutaway
3. Front/service elevation
4. Opposite side
5. Plan
6. Cable/pipe entry close-up

#### C. Open process plant

1. Interior hero
2. Plan
3. Side elevation
4. Opposite corner
5. Exterior/building hero when housed
6. Below-grade/service view when applicable

The view contract must be signal-driven from enclosure geometry, mounting,
below-grade parts, shell presence and service interfaces—not product-class
names.

## 4. Implementation programme

### Phase 0 — Quality baseline and frozen holdouts

Create a fixed visual benchmark set:

- Powerwall wall product;
- 20-ft BESS container;
- Codema process plant;
- RAS plant;
- HAPS/drone-like open assembly.

Record:

- every generated PNG;
- every Excel-embedded PNG;
- camera pose;
- product bbox;
- render time;
- current visual verdict.

No image-quality change is accepted without comparing all holdouts.

### Phase 1 — Geometry and camera truth

#### 1A. Enclosure dimension closure

Add authoritative quantities:

```text
enclosure_width_mm
enclosure_depth_mm
enclosure_height_mm
```

Precedence:

1. hard brief dimensions;
2. settled engineering contract;
3. verified CAD/catalogue dimensions;
4. derived envelope;
5. explicit unresolved state.

The Blender enclosure, GA, manifest bbox and Excel caption must consume the same
three values.

#### 1B. Service-face camera contract

Add presentation metadata:

```python
PresentationFrame(
    up_axis="Z",
    service_face="-Y",
    mounting_face="+Y",
    preferred_hero_azimuth_deg=35,
    preferred_hero_elevation_deg=18,
)
```

Derive it from mounting/interface geometry where possible.

#### 1C. Camera validation

Before accepting an image:

- projected product occupancy 55–85%;
- foreground not dominated by wall/floor helpers;
- visible product pixel fraction above threshold;
- no camera behind an opaque mounting wall;
- angle differs materially from the previous image.

Reject and deterministically try the next candidate camera.

### Phase 2 — Excel render-view contract

Create one shared pure module, for example:

```text
scripts/lib/render_view_contract.py
```

It owns:

- `view_id`;
- filename;
- camera intent;
- applicability;
- required/optional status;
- caption;
- Excel order.

Both Blender generation and Excel selection consume this contract.

Replace `_GALLERY_VIEWS` with contract-driven selection.

Only gate-passed images may be embedded. A file existing on disk is not enough.

#### Excel layout

For products:

- full-width exterior hero;
- full-width cutaway;
- two-column alternate/service views;
- concise captions naming orientation and purpose.

For plants:

- hero + plan;
- two-column side/opposite views;
- exterior section when present.

Target 4–6 distinct, useful images—not a fixed count and not duplicated angles.

### Phase 3 — Universal realism uplift

Presentation-only changes must leave inspect manifests and engineering geometry
byte-identical.

#### 3A. Edge treatment

- small scale-relative bevel on manufactured hard edges;
- weighted normals / auto smooth;
- retain sharp edges where functionally necessary.

This is the highest-value low-risk realism improvement.

#### 3B. Material system

Create semantic materials:

- powder-coated steel;
- anodised aluminium;
- brushed aluminium;
- black engineering polymer;
- PCB solder mask;
- copper busbar;
- rubber seals;
- glass/display;
- galvanised frame.

Use deterministic procedural microtexture and normal variation, not downloaded
image textures by default.

All colour inputs must be converted consistently to linear space.

#### 3C. Lighting/rendering

- studio HDRI or deterministic area-light rig;
- contact shadows and ambient occlusion;
- Cycles for final hero/cutaway views;
- GPU when available, deterministic denoise;
- EEVEE retained for previews and engineering views.

#### 3D. Perspective cameras

Use perspective for customer-facing product imagery:

- 50–70 mm equivalent lens;
- restrained perspective;
- optional shallow depth of field only for detail views.

Keep orthographic views for engineering plan/elevations.

#### 3E. Exterior and cutaway become separate scenes

Do not make one translucent image serve both purposes.

- exterior hero: closed, opaque, installation context;
- cutaway hero: deliberate section/open panel with visible internals;
- service view: ports, glands, access panels.

### Phase 4 — CAD-backed component geometry

For cabinet-scale and smaller products, CAD-backed geometry is a core quality
requirement, not optional polish. Use assets where they materially improve an
Excel-visible silhouette.

Resolution cascade:

1. exact MPN-linked verified CAD;
2. verified family parametric CadQuery geometry;
3. equipment-class parametric geometry;
4. current universal primitive.

Apply first to principal visible parts:

- fans;
- pumps/motors;
- contactors/breakers;
- inverters;
- heat sinks;
- connectors/glands;
- PCBs;
- cells/modules.

Do not import detailed CAD for hidden fasteners or every BoM line.

Requirements:

- geometry provenance in `parts-manifest.json`;
- licence/source metadata;
- cached local GLB/STL;
- bbox agreement within tolerance;
- no network fetch inside the render loop.

### Existing internal library

The repository already contains:

- approximately 274 seeded `component_geometry_types`;
- Tier 1 universal CadQuery parts;
- Tier 2 electromechanical CadQuery parts;
- an MPN-linked `component_catalogue`;
- `step_templates`;
- STEP/GLB export support.

These systems are currently dormant in the Anvil Blender path. The first
integration must be a read-only/shadow geometry resolver, followed by cached
mesh use for visible principals.

### Approved online acquisition sources

Priority order:

1. **Manufacturer CAD portal** — exact MPN STEP preferred.
2. **TraceParts / 3Dfindit manufacturer-certified catalogues** — API/download
   integration, with source and terms recorded.
3. **KiCad official 3D library** — especially connectors, packages and PCB
   hardware; CC BY-SA 4.0 with the KiCad design exception.
4. **SnapMagic/SnapEDA** — electronic packages and STEP models; CC BY-SA 4.0
   with Design Exception 1.0; API access is available.
5. **FreeCAD Parts Library** — mechanical families; CC BY 3.0, attribution
   required.
6. **Ultra Librarian** — broad verified electronic STEP coverage, but its
   content is proprietary; use only after confirming the intended automated
   integration and redistribution rights.

Do not automatically ingest anonymous GrabCAD/community uploads without an
explicit licence, author and source record.

### Acquisition architecture

The CAD library follows the same growing-database rule as the other ForgeOS
truth stores:

```text
DB first
  -> exact/family hit: use cached verified asset
  -> miss: search approved external sources
  -> validate + normalise + write back
  -> re-read through the DB path
  -> library grows permanently
```

Online search/download belongs in a background ingest job, never the design
chain itself:

```text
manufacturer + MPN
  -> exact-source search
  -> licence/provenance validation
  -> STEP validation + bbox extraction
  -> local/Supabase asset cache
  -> geometry mapping writeback
```

The render chain remains a deterministic database/cache consumer:

```text
part identity
  -> cached exact CAD
  -> cached verified family CadQuery
  -> equipment-class parametric geometry
  -> primitive fallback with visible confidence stamp
```

The chain must not directly call TraceParts, SnapMagic, manufacturer portals or
other live CAD services. This preserves determinism, protects quotas and ensures
that the same part produces the same geometry on every run.

### Growing-library resolution flow

```python
resolve_part_cad(manufacturer, mpn, family, dimensions):
    identity = normalise_identity(manufacturer, mpn)

    exact = cad_db.lookup_exact(identity)
    if exact and exact.is_verified:
        return asset_store.download(exact.asset_sha256)

    family_hit = cad_db.lookup_family(family, dimensions)
    if family_hit and family_hit.is_verified:
        return asset_store.download(family_hit.asset_sha256)

    cad_ingest_queue.enqueue(identity, family, dimensions)
    return current_parametric_fallback_with_pending_status()
```

The ingest worker:

```text
miss
  -> acquire single-flight lock for normalised identity
  -> search manufacturer source
  -> search approved aggregators in priority order
  -> download candidate into quarantine
  -> malware/file-format validation
  -> unit/orientation/bbox validation against datasheet
  -> licence/provenance acceptance
  -> generate LOD meshes + preview
  -> content-address and deduplicate
  -> write metadata + part mapping
  -> publish asset
  -> mark search attempt resolved
```

The next render—and any explicit retry after ingest—uses only the published DB
record.

### Storage model

Do not put large STEP/GLB binaries directly inside SQLite/Postgres rows.

Use:

- database: identity, metadata, provenance, validation, mappings and status;
- object storage: original STEP plus generated GLB/STL LODs and previews;
- local content-addressed cache: render-time files keyed by SHA-256.

Recommended logical tables:

```text
cad_assets
  asset_id, sha256, source_url, source_type, licence, attribution,
  native_format, units, bbox, verification_status, version

cad_asset_files
  asset_id, role(original|lod_high|lod_medium|lod_low|preview),
  storage_uri, sha256, bytes

cad_part_mappings
  normalised_manufacturer, normalised_mpn, family,
  asset_id, transform, confidence, evidence

cad_search_attempts
  identity, searched_sources, result, failure_reason, attempted_at,
  retry_after
```

Existing `component_geometry_types`, `component_catalogue` and `step_templates`
should be migrated/bridged into this resolver rather than replaced.

### Monotonic growth and safety rules

- A verified exact-MPN mapping is never silently replaced.
- New candidates create a version pending validation.
- Hash-identical assets deduplicate across sources and MPN aliases.
- Concurrent misses use single-flight locking so one part is downloaded once.
- Negative results are cached with a retry date; they are not searched on every run.
- Invalid, unlicensed or dimensionally inconsistent assets stay quarantined.
- Every render stamps `geometry_source`, asset hash and mapping confidence in
  `parts-manifest.json`.
- Coverage metrics must increase or stay constant across ingest runs; regression
  in verified CAD coverage fails the ingest guard.

### Immediate-vs-next-run behaviour

The deterministic main chain should not pause indefinitely for web acquisition.

- Current run on a DB miss: uses an honest family/primitive fallback and records
  `cad_status=pending_ingest`.
- Background worker resolves and writes back.
- Operator may trigger a render-only refresh once the asset publishes.
- All later full runs receive the improved asset automatically.

Every cached asset records:

- manufacturer;
- MPN/family;
- source URL;
- source type;
- licence/SPDX identifier;
- attribution;
- retrieval date;
- SHA-256;
- native units;
- orientation/origin transform;
- measured bbox;
- verification status.

### Performance / LOD policy

Do not import production STEP tessellation directly into every render.

On ingest:

- validate STEP;
- produce cached GLB/STL LODs;
- retain the original STEP for engineering use;
- generate thumbnail and bbox metadata.

At render:

- hero-visible principal: medium/high LOD;
- secondary visible part: low/medium LOD;
- hidden or sub-pixel part: bbox/primitive;
- repeated cells/fasteners: instanced mesh, never duplicated geometry.

### Powerwall-first CAD targets

The first cabinet-scale proof should replace primitive visual stand-ins for:

- LFP prismatic cell/module family;
- cooling fans;
- heatsink extrusion;
- contactor/breaker/fuse families;
- cable glands and service connectors;
- PCB substrate, terminal blocks and visible packages;
- capacitors and busbar hardware.

The bespoke inverter/control PCB remains a parametric board assembly unless an
exact design CAD exists. Do not pretend a third-party PCB is the designed board.

### Phase 5 — Image gates

Add deterministic gates with `proveCatch()` and counter-cases:

1. **View completeness:** required form-factor views exist.
2. **Excel sync:** every required approved view is embedded; no failed view is embedded.
3. **Blank/occlusion:** luminance/edge/foreground occupancy rejects the current blank FR view.
4. **Angle diversity:** camera directions differ by a minimum angular threshold.
5. **Framing:** product bbox occupies the target frame fraction.
6. **Envelope truth:** rendered bbox agrees with authoritative dimensions.
7. **Material/edge contract:** customer renders use bevels, semantic materials and final-quality lighting.
8. **Dual-pass identity:** presentation pass cannot mutate engineering manifests.
9. **Realism critic:** judge manufacturing credibility, not only visible functional zones.

## 5. Recommended delivery order

### Wave 1 — Correct images in Excel

- authoritative envelope dimensions;
- form-factor view contract;
- service-face cameras;
- blank/occlusion/framing gates;
- Excel embeds only approved views.

This removes wrong images before pursuing photorealism.

### Wave 2 — CAD-backed principals and visual realism

- shadow geometry resolver against the existing CAD library;
- cached exact/family geometry for visible Powerwall-scale principals;
- bevels/normals;
- semantic procedural materials;
- perspective product cameras;
- Cycles hero/cutaway;
- separate exterior/cutaway/service views.

### Wave 3 — Online library growth

- manufacturer/TraceParts/KiCad/SnapMagic/FreeCAD ingest jobs;
- MPN/family geometry mapping writeback;
- licence/provenance/cache enforcement;
- holdout validation.

## 6. Acceptance bar

For each holdout:

- every Excel Blender image is useful and non-duplicative;
- no blank, rear-wall-blocked or nonsensical plan view;
- authoritative dimensions match Blender, GA and captions;
- exterior and cutaway are visibly different;
- principal components have recognisable silhouettes;
- fresh independent critic scores:
  - geometry correctness ≥9;
  - view usefulness ≥9;
  - manufacturing realism ≥8 initially, then ≥9;
- fresh human SIGHT review finds no image worth removing from Excel;
- render time increase stays within an explicit budget.

## 7. Immediate recommendation

Start with Wave 1. The current Powerwall workbook proves that selecting more
existing images would make the deliverable worse: several generated views are
blank or meaningless. First make the view contract and camera gates correct.
Then improve realism on the smaller set of guaranteed-useful images.
