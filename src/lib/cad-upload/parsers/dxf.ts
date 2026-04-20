/**
 * @file parsers/dxf.ts
 *
 * @description DXF parser — 2D drawing format. We extract the axis-aligned
 * 2D extents (min/max X/Y) from every entity we can understand, plus a
 * layer count (proxy for `partCount`).
 *
 * @decision DXF is a 2D format so Z is always 0 in the returned bbox and
 * `volumeMm3` / `surfaceAreaMm2` are omitted. Downstream artefacts that
 * want to use DXF (sheet-metal flats, laser-cut outlines) care about
 * extents and layer list.
 */

import DxfParser from "dxf-parser"

import type { ParseResult, Vec3 } from "./index"

// Minimal structural shape of the dxf-parser result. The library ships no
// types for the output so we declare the bits we actually read.
interface DxfVertex { x?: number; y?: number; z?: number }
interface DxfPoint { x?: number; y?: number; z?: number }
interface DxfEntity {
  type?: string
  vertices?: DxfVertex[]
  center?: DxfPoint
  radius?: number
  startPoint?: DxfPoint
  endPoint?: DxfPoint
  position?: DxfPoint
  points?: DxfPoint[]
}
interface DxfResult {
  entities?: DxfEntity[]
  tables?: { layer?: { layers?: Record<string, unknown> } }
}

/**
 * DXF parser entry point.
 *
 * @param buffer - Raw file bytes (DXF is text — we decode to string)
 * @returns Parsed geometry or structured error. Never throws.
 */
export async function parseDxf(buffer: Uint8Array): Promise<ParseResult> {
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer)
    const parser = new DxfParser()
    const result = parser.parse(text) as DxfResult | null

    if (!result) {
      return { ok: false, error: "DXF parser returned null", code: "dxf_null" }
    }

    const entities = result.entities ?? []
    if (entities.length === 0) {
      return {
        ok: false,
        error: "DXF contained no drawable entities",
        code: "dxf_empty",
      }
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

    const eat = (p?: DxfPoint): void => {
      if (!p) return
      const x = p.x ?? 0, y = p.y ?? 0, z = p.z ?? 0
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (z > maxZ) maxZ = z
    }

    for (const e of entities) {
      if (e.vertices) for (const v of e.vertices) eat(v)
      if (e.points) for (const p of e.points) eat(p)
      if (e.startPoint) eat(e.startPoint)
      if (e.endPoint) eat(e.endPoint)
      if (e.position) eat(e.position)
      if (e.center && typeof e.radius === "number") {
        eat({ x: (e.center.x ?? 0) - e.radius, y: (e.center.y ?? 0) - e.radius, z: e.center.z })
        eat({ x: (e.center.x ?? 0) + e.radius, y: (e.center.y ?? 0) + e.radius, z: e.center.z })
      }
    }

    if (minX === Infinity) {
      return {
        ok: false,
        error: "DXF had entities but no extractable coordinates",
        code: "dxf_no_coords",
      }
    }

    const bboxMinMm: Vec3 = {
      x: minX,
      y: minY,
      z: isFiniteNumber(minZ) ? minZ : 0,
    }
    const bboxMaxMm: Vec3 = {
      x: maxX,
      y: maxY,
      z: isFiniteNumber(maxZ) ? maxZ : 0,
    }

    const layerCount = result.tables?.layer?.layers
      ? Object.keys(result.tables.layer.layers).length
      : entities.length

    return {
      ok: true,
      geometry: {
        bboxMinMm,
        bboxMaxMm,
        // DXF is 2D — no enclosed volume or surface area.
        partCount: layerCount,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown DXF parse error"
    console.error("[cad-upload/parsers/dxf] parse failed:", msg)
    return { ok: false, error: msg, code: "dxf_parse_failed" }
  }
}

function isFiniteNumber(n: number): boolean {
  return Number.isFinite(n)
}
