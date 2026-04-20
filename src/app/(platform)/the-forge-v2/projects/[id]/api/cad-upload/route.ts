/**
 * @file route.ts — POST /the-forge-v2/projects/:id/api/cad-upload
 *
 * @description Server-side CAD upload endpoint for the 3 V1 formats:
 * STEP, STL, DXF. (DWG was dropped from V1 — see migration
 * 20260420210000_cad_lab_files_drop_dwg.sql. Founders export DWG as DXF.)
 * Accepts multipart/form-data with fields:
 *
 *   - file           (the CAD file; required; <= 50 MB)
 *   - material_hint  (free-text, optional; <= 200 chars)
 *
 * Flow:
 *   1. Authenticate and resolve foundry — caller must belong to a foundry.
 *   2. Verify the project belongs to the caller's foundry.
 *   3. Validate extension + MIME + size.
 *   4. Upload bytes to the private `project-cad-files` bucket at
 *      <foundry_id>/<project_id>/<file_id>.<ext>.
 *   5. Insert a `cad_lab_project_files` row with parse_status='pending'.
 *   6. Parse inline (small files — <50 MB — finish well inside the 120s budget).
 *   7. Update the row with bbox/volume/area/part-count or parse_error + failed.
 *   8. Return a compact JSON summary.
 *
 * @security Foundry isolation enforced at both the DB (RLS) and application
 * layer (explicit `.eq('foundry_id', foundryId)` + project-ownership check).
 * Storage bucket is private; downloads go through signed URLs (not in this route).
 *
 * @audit Every upload is logged via console.info with
 *   { userId, foundryId, projectId, fileId, format }.
 */

import { NextResponse, type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"
import {
  parseCadFile,
  type CadFormat,
  type ParseResult,
} from "@/lib/cad-upload/parsers"

export const runtime = "nodejs"
export const maxDuration = 120 // 2 min — STEP parsing on Vercel Pro

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
const MAX_MATERIAL_HINT_LEN = 200
const BUCKET = "project-cad-files"

// Accepted extensions → canonical format tag. DWG intentionally omitted.
const EXT_TO_FORMAT: Record<string, CadFormat> = {
  step: "step",
  stp:  "step",
  stl:  "stl",
  dxf:  "dxf",
}

// MIME allowlist per format. Many CAD exporters default to octet-stream so
// we accept that as a safety fallback after the extension check passes.
// DWG MIMEs intentionally omitted — see migration
// 20260420210000_cad_lab_files_drop_dwg.sql for context.
const MIME_ALLOWLIST = new Set<string>([
  "application/step",
  "application/STEP",
  "application/x-step",
  "model/step",
  "model/stl",
  "application/sla",
  "application/vnd.ms-pki.stl",
  "application/dxf",
  "image/vnd.dxf",
  "application/octet-stream",
  "", // some browsers send empty for drag-dropped files
])

interface UploadSuccess {
  fileId: string
  parseStatus: "parsed" | "failed"
  filename: string
  format: CadFormat
  sizeBytes: number
  bbox?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
  volume_mm3?: number
  surface_area_mm2?: number
  part_count?: number
  error?: string
}

type RouteResult = UploadSuccess | { error: string }

function bad(status: number, message: string): NextResponse<RouteResult> {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<RouteResult>> {
  try {
    const { id: projectId } = await params

    // ── Auth ──────────────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return bad(401, "Unauthorized")

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return bad(403, "User not in a foundry")

    // ── Parse multipart body ──────────────────────────────────────────────
    let form: FormData
    try {
      form = await request.formData()
    } catch (err) {
      console.error("[cad-upload] formData parse failed:", err)
      return bad(400, "Could not parse upload. Expected multipart/form-data.")
    }

    const file = form.get("file")
    if (!(file instanceof File)) return bad(400, "Missing 'file' field.")

    const rawMaterialHint = form.get("material_hint")
    const materialHint = typeof rawMaterialHint === "string"
      ? rawMaterialHint.trim().slice(0, MAX_MATERIAL_HINT_LEN) || null
      : null

    // ── Validate size ─────────────────────────────────────────────────────
    if (file.size <= 0) return bad(400, "Uploaded file is empty.")
    if (file.size > MAX_SIZE_BYTES) {
      return bad(413, `File too large. Max upload is ${MAX_SIZE_BYTES / 1024 / 1024} MB.`)
    }

    // ── Resolve format from extension (primary) ──────────────────────────
    const filename = file.name ?? "upload"
    const ext = filename.includes(".")
      ? filename.substring(filename.lastIndexOf(".") + 1).toLowerCase()
      : ""
    const format = EXT_TO_FORMAT[ext]
    if (!format) {
      return bad(
        415,
        "Unsupported format. Upload STEP (.step, .stp), STL (.stl), or DXF (.dxf). " +
          "For DWG files, export as DXF in your CAD tool and upload that.",
      )
    }

    // ── MIME allowlist (secondary) ───────────────────────────────────────
    const mime = (file.type ?? "").toString()
    if (!MIME_ALLOWLIST.has(mime)) {
      return bad(415, `Unsupported MIME type: ${mime}`)
    }

    // ── Verify project belongs to caller's foundry ───────────────────────
    const { data: project, error: projectErr } = await supabase
      .from("cad_lab_projects")
      .select("id, foundry_id")
      .eq("id", projectId)
      .eq("foundry_id", foundryId)
      .maybeSingle()

    if (projectErr) {
      console.error("[cad-upload] project lookup failed:", projectErr.message)
      return bad(500, "Could not verify project ownership.")
    }
    if (!project) return bad(404, "Project not found.")

    // ── Write bytes to storage ───────────────────────────────────────────
    const fileId = randomUUID()
    const storagePath = `${foundryId}/${projectId}/${fileId}.${ext}`
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: mime || "application/octet-stream",
        upsert: false,
      })

    if (uploadErr) {
      console.error("[cad-upload] storage upload failed:", uploadErr.message)
      return bad(500, `Storage upload failed: ${uploadErr.message}`)
    }

    // ── Insert row (status=pending) ──────────────────────────────────────
    const { data: insertedRow, error: insertErr } = await supabase
      .from("cad_lab_project_files")
      .insert({
        id: fileId,
        project_id: projectId,
        foundry_id: foundryId,
        uploaded_by: user.id,
        filename,
        storage_path: storagePath,
        mime_type: mime || "application/octet-stream",
        size_bytes: file.size,
        format,
        material_hint: materialHint,
        parse_status: "pending",
      })
      .select("id")
      .single()

    if (insertErr || !insertedRow) {
      console.error("[cad-upload] row insert failed:", insertErr?.message)
      // Best-effort: clean up the orphan storage object.
      await supabase.storage.from(BUCKET).remove([storagePath])
      return bad(500, `Could not record upload: ${insertErr?.message ?? "unknown"}`)
    }

    console.info("[cad-upload] upload accepted", {
      userId: user.id,
      foundryId,
      projectId,
      fileId,
      format,
      sizeBytes: file.size,
    })

    // ── Parse inline ─────────────────────────────────────────────────────
    const parsed: ParseResult = await parseCadFile(format, bytes)

    if (parsed.ok) {
      const g = parsed.geometry
      const { error: updErr } = await supabase
        .from("cad_lab_project_files")
        .update({
          parse_status: "parsed",
          parse_error: null,
          bbox_min_mm: g.bboxMinMm,
          bbox_max_mm: g.bboxMaxMm,
          volume_mm3: g.volumeMm3 ?? null,
          surface_area_mm2: g.surfaceAreaMm2 ?? null,
          part_count: g.partCount ?? null,
        })
        .eq("id", fileId)
        .eq("foundry_id", foundryId)

      if (updErr) {
        // Parse worked but write failed — surface it; do not hide.
        console.error("[cad-upload] parse-success update failed:", updErr.message)
        return bad(500, `Parse OK but state update failed: ${updErr.message}`)
      }

      return NextResponse.json(
        {
          fileId,
          parseStatus: "parsed",
          filename,
          format,
          sizeBytes: file.size,
          bbox: { min: g.bboxMinMm, max: g.bboxMaxMm },
          volume_mm3: g.volumeMm3,
          surface_area_mm2: g.surfaceAreaMm2,
          part_count: g.partCount,
        } satisfies UploadSuccess,
        { status: 201 },
      )
    }

    // Parse failed — keep the stored file, mark row failed, surface the error.
    const { error: failUpdErr } = await supabase
      .from("cad_lab_project_files")
      .update({
        parse_status: "failed",
        parse_error: parsed.error,
      })
      .eq("id", fileId)
      .eq("foundry_id", foundryId)

    if (failUpdErr) {
      console.error("[cad-upload] parse-fail update failed:", failUpdErr.message)
    }

    return NextResponse.json(
      {
        fileId,
        parseStatus: "failed",
        filename,
        format,
        sizeBytes: file.size,
        error: parsed.error,
      } satisfies UploadSuccess,
      { status: 201 },
    )
  } catch (err) {
    console.error("[cad-upload] unexpected top-level failure:", err)
    return bad(500, "Unexpected upload failure.")
  }
}
