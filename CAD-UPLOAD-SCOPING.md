# CAD Upload — Scoping Document

**Author:** Agent scope pass, 2026-04-20
**Status:** Draft for Tristan sign-off
**Test project:** Stratosphere HAPS-S1 (solar HAPS UAV)

This document answers whether founders can upload existing CAD to ForgeOS and, if so, whether that uplifts the quality of downstream artefacts across the project lifecycle (Brief → Modules → BOM → Suppliers → Cost → Risks → Experts → Launch Checklist).

---

## 1. What exists today

**Good news: an uploader surface already exists.** The CAD Lab "reference documents" feature accepts CAD files alongside PDFs/DOCX/PPTX/XLSX today, but nothing is parsed — files land in storage and sit there as attachments.

Concrete finds in the repo:

- **Upload UI:** `src/app/(platform)/the-forge/cad-lab/components/reference-document-upload.tsx` — drag-and-drop with two variants ("compact" inline strip + "grid" for the intake form).
- **Server action:** `src/actions/cad-lab-reference-documents.ts` — uploads, runs text extraction for doc types, persists metadata.
- **Types:** `src/lib/cad-lab/reference-document-types.ts` — declares `DocumentFileType = "pdf" | "docx" | "pptx" | "xlsx" | "step" | "stl" | "dxf"` and the `StoredReferenceDocument` shape.
- **Storage bucket:** `xray-images` (shared with Product X-Ray). Already configured for STEP/STL MIME types and a 20 MB size limit — see `supabase/migrations/20260211040000_extend_xray_storage_for_cad.sql`.
- **Persistence columns:** `cad_lab_projects.reference_documents JSONB` and `cad_lab_projects.reference_images JSONB` (migrations `20260325300000` and `20260325100000`).
- **Limits:** `MAX_DOCUMENTS_PER_PROJECT = 10`, `MAX_DOCUMENT_SIZE_BYTES = 20 MB`, `MAX_DOCS_PER_REQUEST = 10`.

**What is NOT wired up:**

- No STEP/STL/DXF **parser** — the server action's `EXTRACTABLE_TYPES` list covers only `pdf | docx | pptx | xlsx`. CAD files are stored raw and their `extractionStatus` is effectively "not_applicable".
- No **geometry-derived metadata** (bounding box, mass, part count, materials).
- No **artefact wiring** — Modules / BOM / Suppliers / Cost / Risks / Launch Checklist specialists never see CAD-derived facts. They still operate on text only.
- No per-project **CAD-first table** — `reference_documents` is a JSONB blob, not a queryable table, which limits downstream joins (e.g. costing a specific part).

**Conclusion:** the upload *plumbing* is 70% there. The *intelligence layer* that converts an uploaded STEP file into structured geometry/material facts is the unbuilt piece.

---

## 2. Schema that exists

Tables and columns relevant to CAD today:

| Table | Column | Notes |
|---|---|---|
| `cad_lab_projects` | `reference_documents JSONB` | array of `StoredReferenceDocument` — includes CAD files |
| `cad_lab_projects` | `reference_images JSONB` | PNGs, sketches, moodboards |
| `storage.buckets` | `xray-images` | public=true, 20 MB limit, MIMEs include `application/step`, `model/stl`, `application/octet-stream` |
| `cad_lab_projects` | `assembly_code`, `integrated_assembly` | generated (not uploaded) assembly output |
| `cad_assemblies` (via RFQ) | `step_url`, `stl_url` | outputs of GenCAD, not inputs |

`src/lib/cad-lab-types.ts` exists; the CAD-specific typed shapes live in `src/lib/cad-lab/reference-document-types.ts`.

---

## 3. Format recommendations for MVP

### Must-have (V1)
- **STEP (.step / .stp)** — ISO 10303 neutral format. Carries assembly tree, feature tree, units, and (optionally) material annotations. Single highest-value format to parse.
- **STL (.stl)** — triangle mesh only. No material, no assembly, no tolerances. Cheap to parse, gives bounding box + mesh volume + surface area.
- **DXF (.dxf)** — 2D drawings (sheet metal flats, PCB outlines, plate cutouts). Gives 2D extents + layer list. Not strictly geometry, but useful for sheet-metal + laser-cut parts.

### Nice-to-have (V2+)
- **IGES (.iges / .igs)** — older neutral format. Parseable with the same native library as STEP, but lower-fidelity for assemblies.
- **DWG** — AutoCAD proprietary. Requires a commercial library (ODA File Converter, Teigha) or a pre-processor that converts DWG → DXF. **Defer.**
- **Parasolid (.x_t / .x_b)** — Siemens native. Parseable open-source via `opencascade.js` with limitations. V2.
- **SolidWorks (.sldprt / .sldasm), Fusion 360 (.f3d), Creo (.prt)** — all proprietary and require vendor SDKs (Windows-only for most). **Out of V1.** The pragmatic ask: "please export as STEP before uploading."

### Libraries
- **STEP parsing — `opencascade.js` / `occt-import-js`** (OpenCascade WebAssembly). Runs server-side on Vercel Node runtime. Extracts assembly tree, bounding box, part names, materials (when authored), basic feature metadata. This is the workhorse.
- **STL parsing — `three-mesh-bvh` + custom reader**, or `node-stl`. Node runtime. Gives mesh volume (via divergence theorem), surface area, AABB, triangle count.
- **DXF parsing — `dxf-parser`** (pure JS). Node runtime. Gives entity list, layers, 2D bounds.
- **Pre-processing / fallback — Modal GenCAD worker** already exists (`modal_cad_worker.py`). If occt-import hits the 300 s Vercel Pro `maxDuration` cap on a large STEP file, hand off to Modal which has no such cap.

All the above run on the **Vercel Node runtime** (not Edge — WASM + filesystem APIs needed). Large files (> ~50 MB STEP) should route to Modal.

---

## 4. Higher-quality outputs per artefact

What an uploaded STEP (best case) or STL (minimum case) unlocks downstream:

| Artefact | Uplift from CAD upload | Why |
|---|---|---|
| **Brief** | **None.** Brief is pre-geometry — the founder describes the product before CAD exists. | If CAD is uploaded it means the brief is already locked in the founder's head; Brief gets a free "infer brief from CAD" prompt but no quality lift. |
| **Modules** | **High.** Read assembly tree from STEP → name real sub-assemblies ("wing spar", "battery pack enclosure"). Bounding box + mass per sub-assembly → mass budget sanity check. | Today the Modules specialist guesses decomposition from a text brief. With STEP, it sees truth. |
| **BOM** | **High.** Part count from the STEP tree (deduplicate by geometry hash). Material hint per part (when authored). Fastener count from repeated small parts. | Today BOM is a hallucinated list; with STEP it's grounded. |
| **Suppliers** | **Medium–High.** Material + tolerance + size per part → supplier shortlist keyed to process capability (e.g. "3 mm titanium sheet, ±0.1 mm, 800 mm long" → pick from laser-cut Ti vendors with bed size ≥ 800 mm). | Chase (VP Supply Chain) can today only match on text keywords. CAD turns this into a capability match. |
| **Cost** | **High.** Volume × cost-per-kg per material + process cost factor → automatic first-pass unit cost. Flag outliers (e.g. a 5 kg part that could be hollowed). | Replaces Finn's "vibe estimate" with a defensible number. |
| **Risks** | **Medium.** DFM issues from geometry — thin walls, deep pockets, undercuts, non-printable overhangs, aspect-ratio fails. Fang (VP Mfg) gets specific callouts instead of generic ones. | Requires per-part mesh analysis; V2. |
| **Experts** | **Low–Medium.** Material inference triggers specialist matching — titanium → metallurgy expert, composites → laminate expert. | Nice-to-have; text brief already provides most of this signal. |
| **Launch Checklist** | **Medium.** Compliance triggers from detected materials (ITAR if titanium alloy 6Al-4V, REACH if certain alloys, FCC if an electronics enclosure with RF shielding). | Leo (Legal) flag accuracy goes up. |

**Net:** the biggest wins are Modules, BOM, Cost, and Suppliers. Brief and Experts get minor uplift. Risks and Launch Checklist get medium uplift in V2 once per-part DFM analysis is wired.

---

## 5. Proposed MVP architecture

### Upload UI
- **Location:** extend the existing `reference-document-upload.tsx` component (don't build a new surface). Add a visual "CAD" tab or filter so founders see their uploaded parts distinct from spec PDFs.
- **Secondary surface:** the Workspace header gets a one-click "Upload CAD" affordance that deep-links to the intake form's CAD dropzone.
- **Size limit:** raise from 20 MB → **50 MB** for STEP (real assemblies hit this fast). Paid tiers only; Explorer stays at 20 MB.
- **Virus scan:** Supabase Storage already scans uploads; keep as-is. Reject by extension + MIME + magic-byte check on the server.

### Storage
- **Bucket:** reuse `xray-images` for continuity with the existing uploader. Long-term consider a dedicated `project-cad-files` bucket so RLS and retention can diverge. **V1: stay in `xray-images`.** V2: migrate.
- **Path:** `cad-lab/${projectId}/cad-files/${fileId}.${ext}` — matches the existing pattern.
- **Access:** signed URLs via `createSignedUrls()` (per existing `storage.md` rule — never `getPublicUrl` for confidential files).

### Processing pipeline
1. Browser uploads file via existing `uploadReferenceDocuments()` server action.
2. Action enqueues a **new** `parseCadFile` job (inline for STL/DXF; Modal for STEP > 10 MB).
3. Parser writes structured output to a new `project_cad_files` table (see below).
4. Downstream specialists (Modules, BOM, Cost, Suppliers) read from `project_cad_files` when generating artefacts.

### New table: `project_cad_files`

```sql
CREATE TABLE public.project_cad_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES cad_lab_projects(id) ON DELETE CASCADE,
  foundry_id text NOT NULL REFERENCES foundries(id),
  filename text NOT NULL,
  format text NOT NULL CHECK (format IN ('step','stl','dxf','iges')),
  storage_path text NOT NULL,
  size_bytes bigint NOT NULL,
  bounding_box_mm jsonb,          -- {x,y,z}
  mass_g numeric,                  -- computed from volume × density (when material known)
  volume_mm3 numeric,
  surface_area_mm2 numeric,
  material_hint text,              -- e.g. "aluminium 6061"
  part_count int,                  -- STEP assembly tree node count
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','parsing','complete','failed')),
  processing_error text,
  extracted_metadata jsonb,        -- assembly tree, per-part data, DFM flags
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  parsed_at timestamptz
);

CREATE INDEX ix_project_cad_files_project ON project_cad_files(project_id);
CREATE INDEX ix_project_cad_files_foundry ON project_cad_files(foundry_id);
ALTER TABLE public.project_cad_files ENABLE ROW LEVEL SECURITY;
-- RLS policies: SELECT/INSERT/UPDATE/DELETE filtered by foundry_id via profile
```

This sits **alongside** `reference_documents` JSONB (which stays for PDFs/DOCX/etc). CAD gets its own table because it needs structured columns for artefact joins.

---

## 6. Effort estimate

A "round" ≈ 2–4 hours of focused agent work.

| Round | Work | Notes |
|---|---|---|
| R1 | Schema migration + RLS + types regeneration | Straightforward; follow existing patterns. |
| R2 | STL parser (simplest — mesh math only) | `node-stl` + volume/AABB computation. End-to-end wired to table. |
| R3 | DXF parser | `dxf-parser`; 2D extents + layers. Cheap. |
| R4 | STEP parser via `occt-import-js` on Vercel Node | The meat. Needs WASM bundling sanity check. |
| R5 | Modal fallback for STEP > 10 MB | Reuse existing Modal CAD worker pattern. |
| R6 | Upload UI uplift (visual CAD separation, 50 MB limit gate by tier) | |
| R7 | Artefact wiring — Modules + BOM | The quality uplift shows here. |
| R8 | Artefact wiring — Cost + Suppliers | Material density table, process cost factors. |
| R9 | DFM risk flags (V2 scope — could cut) | Thin-wall / undercut detection. |
| R10 | End-to-end test on Stratosphere HAPS-S1 + parity gate | Mandatory per CLAUDE.md. |

**Total: ~10 rounds / 20–40 hours** for V1 (R1–R8 + R10). **Add ~4 rounds** if DWG/Parasolid become must-haves.

---

## 7. Open questions for Tristan

1. **Scope of V1 formats** — confirm STEP + STL + DXF only for V1, defer DWG / SolidWorks / Fusion / Parasolid to V2? Or is DWG a must-have because industrial founders live in AutoCAD?
2. **Per-project or per-module CAD scope?** — does a founder upload one assembly per project, or CAD per module (e.g. one STEP for the wing, one for the battery pack)? Affects the UI and the `project_cad_files.module_id` column.
3. **Free-tier size cap** — 20 MB (current), or bump to 50 MB on paid tiers only? Real UAV/robotics assemblies routinely exceed 20 MB.
4. **Bucket separation** — reuse `xray-images` for V1 (faster) or spin up `project-cad-files` immediately (cleaner RLS)?
5. **Material inference fallback** — when STEP has no material authored (common), do we ask the founder in-UI ("What's this part made of?"), or do we let the LLM guess from context? The former is slower but more accurate.

---

## Recommendation

Ship **V1 = STEP + STL + DXF + Modules/BOM/Cost/Suppliers uplift** in ~8 rounds. Skip DFM risk flags and exotic formats until Tristan sees the Stratosphere HAPS-S1 lift end-to-end. The upload plumbing already exists — the investment is almost entirely on the parser + artefact-wiring side.
