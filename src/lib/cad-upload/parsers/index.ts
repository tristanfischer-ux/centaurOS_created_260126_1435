/**
 * @file parsers/index.ts
 *
 * @description Unified dispatch for the 3 V1 CAD formats (STEP / STL / DXF).
 * Every parser returns a `ParseResult` — never throws. Callers (the upload
 * route handler) should check `result.ok` and, if false, persist
 * `result.error` to `cad_lab_project_files.parse_error` with
 * `parse_status = 'failed'`.
 *
 * DWG was dropped from V1 — see migration 20260420210000_cad_lab_files_drop_dwg.sql
 * and CAD-UPLOAD-HANDOVER.md. Founders export DWG as DXF in their CAD tool.
 * When licensing permits a DWG parser, add a `dwg.ts`, re-broaden `CadFormat`,
 * and extend the switch below — the rest of the pipeline is structured to
 * accept that change as a single plug-in.
 *
 * @security Parsers run server-side on untrusted founder-uploaded bytes. Each
 * parser isolates its work inside try/catch and returns structured errors so
 * a malformed file cannot crash the upload route.
 */

import { parseStl } from "./stl"
import { parseDxf } from "./dxf"
import { parseStep } from "./step"

export type Vec3 = { x: number; y: number; z: number }

export interface ParsedGeometry {
  /** Axis-aligned bounding box (millimetres) */
  bboxMinMm: Vec3
  bboxMaxMm: Vec3
  /** Total enclosed volume in mm^3 (may be undefined for 2D / mesh-only formats) */
  volumeMm3?: number
  /** Total exterior surface area in mm^2 (may be undefined for 2D) */
  surfaceAreaMm2?: number
  /** Number of discrete parts/entities; STEP=assembly nodes, STL=1, DXF=entity count */
  partCount?: number
}

export type ParseResult =
  | { ok: true; geometry: ParsedGeometry }
  | { ok: false; error: string; code?: string }

export type CadFormat = "step" | "stl" | "dxf"

/**
 * Dispatch parse by declared format.
 *
 * @param format - Normalised format tag from the upload route
 * @param buffer - Raw file bytes (already size-gated by the route handler)
 * @returns Structured geometry or structured error. Never throws.
 */
export async function parseCadFile(
  format: CadFormat,
  buffer: Uint8Array,
): Promise<ParseResult> {
  try {
    switch (format) {
      case "step":
        return await parseStep(buffer)
      case "stl":
        return await parseStl(buffer)
      case "dxf":
        return await parseDxf(buffer)
      default: {
        // Exhaustiveness check — future format additions trip here.
        const _exhaustive: never = format
        return {
          ok: false,
          error: `Unknown format: ${String(_exhaustive)}`,
          code: "unknown_format",
        }
      }
    }
  } catch (err) {
    // Belt-and-braces: parsers shouldn't throw but if they do, surface loudly.
    const msg = err instanceof Error ? err.message : "Unknown parser error"
    console.error("[cad-upload/parsers] unexpected throw:", msg, err)
    return { ok: false, error: msg, code: "parser_threw" }
  }
}
