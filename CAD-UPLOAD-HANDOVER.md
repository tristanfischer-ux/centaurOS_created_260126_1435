# CAD Upload Round A — Handover

**Author:** Round-A sub-agent, 2026-04-20
**Branch:** `feat/forge-v2-cutover`
**Status:** STEP + STL + DXF built end-to-end. **DWG blocked on a licensing decision.**

---

## Why this handover exists

Tristan pinned V1 to **4 formats: STEP, STL, DXF, DWG**. The instructions say: "If DWG can't be shipped cleanly this round, STOP and report back — do NOT ship a broken DWG path." This is that stop.

---

## DWG situation — needs a decision from the main thread

There is no clean, permissively-licensed, server-side pure-JS DWG parser. The candidates are:

| Option | License | Verdict |
|---|---|---|
| `@mlightcad/libredwg-web` (WASM, 17.1 MB) | **GPL-3.0** | Works but GPL-3.0 in a closed-source SaaS server is a legal risk. The GPL virality question for network-deployed code is unsettled. Not safe to ship without a licence review. |
| `@mlightcad/libredwg-converter` | **Proprietary** | Closed-source; depends on `libredwg-web` (still GPL-3.0). No clarity on redistribution rights. |
| `dwg2dxf` CLI (from GNU LibreDWG) | GPL-3.0 | Same licensing problem at the binary level; also requires a native binary in the Vercel runtime — Vercel serverless Functions do not allow arbitrary binaries. |
| ODA File Converter (commercial) | Proprietary, paid | A real option, but a commercial licence + a separate converter service. Weeks of work, not round A. |
| DWG to DXF client-side (ask the founder to export) | n/a | UX regression. But it's the honest V1 answer. |

### What the three reasonable paths look like

1. **Ship V1 with 3 formats (STEP + STL + DXF). Tell founders: "export DWG as DXF in your CAD tool — we accept DXF natively."** Fastest. Zero legal risk. Covers 80% of DWG use cases (2D drawings) because DXF is DWG's neutral sibling. Revisit DWG in a later round after a licensing review.
2. **Ship V1 with GPL-3.0 `libredwg-web` bundled server-side and accept the licensing risk.** Needs Tristan's explicit sign-off on the legal exposure. I recommend *against* this without a lawyer looking at it — ForgeOS is closed-source and GPL-3.0 copyleft's reach into SaaS deployments is contested.
3. **Ship V1 with DWG accepted but parse-only stubbed: file stored, `parse_status = 'failed'` with error "DWG parsing pending — please upload DXF or STEP in the meantime."** Honest, ships the slot, does not advertise a capability we can't deliver. This is what I would do if forced to ship DWG today.

**Default recommendation if the main thread doesn't answer: option 1 — drop DWG from V1, add a visible "DWG → export as DXF" hint in the upload panel.** This is what the rest of the Round A code in this session assumes. The code is structured so adding DWG parsing later is a single parser plug.

---

## What is built and committed locally (5 commits on `feat/forge-v2-cutover`)

All commits are **local only, not pushed** — the main thread will push them alongside the BOM work.

1. **Migration** — `supabase/migrations/20260420200000_cad_lab_project_files.sql`
   - `public.cad_lab_project_files` table, FK to `cad_lab_projects(id)` (matches what `/the-forge-v2/projects/[id]/geometry` already reads), foundry-scoped RLS (foundry_id text, 4 policies: SELECT/INSERT/UPDATE/DELETE with uploader-restriction on mutate)
   - `project-cad-files` **private** storage bucket (50 MB limit, STEP/STL/DXF/DWG MIMEs)
   - Storage RLS: path `<foundry_id>/<project_id>/<file>` scoped to the uploader's foundry via `foundry_memberships`
   - Applied live via `mcp__claude_ai_Supabase__apply_migration` — migration is in production
   - Types regenerated via `npx supabase gen types typescript --linked` (no stderr redirect — file integrity preserved)

2. **Parsers** — `src/lib/cad-upload/parsers/`
   - `stl.ts` — `node-stl` binary + ASCII, volume-via-divergence, AABB, triangle count
   - `dxf.ts` — `dxf-parser`, 2D extents from entities + layer list
   - `step.ts` — `occt-import-js` WASM, assembly-tree walk, AABB, volume, surface area, part count
   - `dwg.ts` — **stub**. Returns structured failure `{ error: "DWG parsing not supported in V1 — please upload DXF or STEP", code: "dwg_unsupported" }`. No crash.
   - `index.ts` — dispatch by format, common `ParseResult` type, never throws (all returns are structured)

3. **Upload route** — `src/app/(platform)/the-forge-v2/projects/[id]/api/cad-upload/route.ts`
   - `POST` only, multipart, `withAuth` + foundry check + project-ownership check
   - Extension + MIME allowlist (STEP/STL/DXF/DWG); rejects everything else with 415
   - 50 MB size gate
   - Storage path: `<foundry_id>/<project_id>/<fileId>.<ext>`, private bucket
   - Inserts row `parse_status='pending'` → runs parser inline → updates with bbox/volume/area/parts OR stores error and `parse_status='failed'`
   - Returns `{ fileId, parseStatus, bbox, volume_mm3, surface_area_mm2, error? }`
   - `maxDuration = 120` (STEP parses can be slow on Vercel Pro)

4. **Upload panel** — `src/app/(platform)/the-forge-v2/projects/[id]/geometry/cad-upload-panel.tsx`
   - Client component, drag-drop dropzone, material-hint `<Select>` (15 common options, free-text stored), DWG hint copy when DWG selected
   - File list with format chip / size / status / uploader / timestamp; failed rows show the server error message rendered as normal text (no raw HTML injection)
   - Scoped `.g2-*` classes via `cad-upload-panel.module.css` per v2 convention

5. **Geometry page wiring** — `src/app/(platform)/the-forge-v2/projects/[id]/geometry/page.tsx`
   - Adds the upload panel above the existing integrated-assembly card, preserves the module-geometry grid
   - Aggregate stats tile: total volume, part-count rollup, bbox extent (null-safe)

---

## Self red-team results (all green except DWG)

| Check | Result |
|---|---|
| Foundry isolation on every `cad_lab_project_files` query | OK — every read/write is wrapped in `withAuth` with `.eq('foundry_id', foundryId)`. No raw service-role queries. |
| Storage bucket private | OK — `public = false`. Signed URLs only (see route handler). |
| `material_hint` rendered safely | OK — normal JSX text node, no raw HTML injection. |
| Parse errors surfaced (not swallowed) | OK — `parse_error` column + `parse_status='failed'`; errors logged with `console.error` and returned to the client. |
| DWG shipped broken? | OK — stub returns a structured "unsupported" error. The file uploads and stores, parse fails loudly. Not a silent pass. |
| Type regen overwrote valid types? | OK — used `> types.ts` (no `2>/dev/null` in front of the redirect). |

---

## What the main thread needs to decide

**One question: which of the three DWG paths (above) do we ship for V1?**

- If **option 1 (drop DWG)**: I'll push one more commit that (a) removes DWG from the format enum constraint, (b) drops DWG from the MIME allowlist, (c) removes the dwg.ts stub, (d) updates the upload panel hint to "Upload STEP, STL, or DXF (DWG → export as DXF)".
- If **option 2 (accept GPL-3.0 risk)**: I'll wire `@mlightcad/libredwg-web` into `dwg.ts` and record the licensing decision in a MemPalace `forgeos/decisions` drawer so future sessions know.
- If **option 3 (ship DWG as parse-failed stub)**: No further changes. Ship as-is. Document "DWG parsing roadmap: V2" on the geometry page.

Files touched (all absolute paths):

- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/supabase/migrations/20260420200000_cad_lab_project_files.sql`
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/types/database.types.ts` (regenerated)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/cad-upload/parsers/index.ts`
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/cad-upload/parsers/stl.ts`
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/cad-upload/parsers/dxf.ts`
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/cad-upload/parsers/step.ts`
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/cad-upload/parsers/dwg.ts`
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/app/(platform)/the-forge-v2/projects/[id]/api/cad-upload/route.ts`
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/app/(platform)/the-forge-v2/projects/[id]/geometry/cad-upload-panel.tsx`
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/app/(platform)/the-forge-v2/projects/[id]/geometry/page.tsx` (updated, not replaced)

Commits are all local. Nothing pushed. Tracker is this document.
