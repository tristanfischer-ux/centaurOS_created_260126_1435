/**
 * @file parsers/stl.ts
 *
 * @description STL parser — handles both binary and ASCII STL. Computes
 * axis-aligned bounding box, volume via the signed-tetrahedron method
 * (divergence theorem), and total surface area.
 *
 * @decision We do not use `node-stl` directly because its public API only
 * exposes bounding-box dimensions (`[dx, dy, dz]`), not the min/max corners
 * we need. The math is trivial so we parse STL ourselves.
 *
 * @see https://en.wikipedia.org/wiki/STL_(file_format)
 * @see https://stackoverflow.com/a/1568551 — signed-tetrahedron volume
 */

import type { ParseResult, Vec3 } from "./index"

/**
 * STL parser entry point.
 *
 * @param buffer - Raw file bytes (binary or ASCII STL)
 * @returns Parsed geometry or structured error. Never throws.
 */
export async function parseStl(buffer: Uint8Array): Promise<ParseResult> {
  try {
    const isBinary = detectBinary(buffer)
    const triangles = isBinary
      ? parseBinary(buffer)
      : parseAscii(new TextDecoder().decode(buffer))

    if (triangles.length === 0) {
      return {
        ok: false,
        error: "STL file contained no triangles (empty or malformed)",
        code: "stl_empty",
      }
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    let volume6 = 0 // 6 * signed-tetrahedron volume
    let area = 0

    for (const tri of triangles) {
      const [a, b, c] = tri

      if (a.x < minX) minX = a.x
      if (a.y < minY) minY = a.y
      if (a.z < minZ) minZ = a.z
      if (b.x < minX) minX = b.x
      if (b.y < minY) minY = b.y
      if (b.z < minZ) minZ = b.z
      if (c.x < minX) minX = c.x
      if (c.y < minY) minY = c.y
      if (c.z < minZ) minZ = c.z
      if (a.x > maxX) maxX = a.x
      if (a.y > maxY) maxY = a.y
      if (a.z > maxZ) maxZ = a.z
      if (b.x > maxX) maxX = b.x
      if (b.y > maxY) maxY = b.y
      if (b.z > maxZ) maxZ = b.z
      if (c.x > maxX) maxX = c.x
      if (c.y > maxY) maxY = c.y
      if (c.z > maxZ) maxZ = c.z

      // Signed volume of tetrahedron formed by triangle + origin.
      volume6 +=
        a.x * (b.y * c.z - b.z * c.y) +
        a.y * (b.z * c.x - b.x * c.z) +
        a.z * (b.x * c.y - b.y * c.x)

      // Surface area via cross-product magnitude / 2.
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z
      const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z
      const nx = uy * vz - uz * vy
      const ny = uz * vx - ux * vz
      const nz = ux * vy - uy * vx
      area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2
    }

    const volumeMm3 = Math.abs(volume6) / 6

    return {
      ok: true,
      geometry: {
        bboxMinMm: { x: minX, y: minY, z: minZ },
        bboxMaxMm: { x: maxX, y: maxY, z: maxZ },
        volumeMm3,
        surfaceAreaMm2: area,
        // STL is a single mesh — no assembly hierarchy. 1 "part".
        partCount: 1,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown STL parse error"
    console.error("[cad-upload/parsers/stl] parse failed:", msg)
    return { ok: false, error: msg, code: "stl_parse_failed" }
  }
}

// ── Binary STL ───────────────────────────────────────────────────────────────

/**
 * Detect binary vs ASCII STL.
 *
 * @description ASCII STL starts with "solid" (case-insensitive). Binary STL
 * has an 80-byte header (often also starting with "solid" — yes, really) and
 * then a uint32 triangle count. Most-reliable heuristic: compute the expected
 * binary file size and see if it matches actual size.
 *   expectedBytes = 84 + triangleCount * 50
 */
function detectBinary(buffer: Uint8Array): boolean {
  if (buffer.byteLength < 84) return false
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const triangleCount = view.getUint32(80, true)
  const expected = 84 + triangleCount * 50
  if (expected === buffer.byteLength) return true

  // Secondary check: ASCII STL should start with "solid" followed by
  // non-binary content within the first ~5 bytes.
  const head = new TextDecoder().decode(buffer.subarray(0, 5)).toLowerCase()
  return head !== "solid"
}

function parseBinary(buffer: Uint8Array): Array<[Vec3, Vec3, Vec3]> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const triangleCount = view.getUint32(80, true)
  const triangles: Array<[Vec3, Vec3, Vec3]> = []
  let offset = 84
  for (let i = 0; i < triangleCount; i++) {
    // Skip 12-byte normal
    offset += 12
    const a: Vec3 = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    }
    const b: Vec3 = {
      x: view.getFloat32(offset + 12, true),
      y: view.getFloat32(offset + 16, true),
      z: view.getFloat32(offset + 20, true),
    }
    const c: Vec3 = {
      x: view.getFloat32(offset + 24, true),
      y: view.getFloat32(offset + 28, true),
      z: view.getFloat32(offset + 32, true),
    }
    triangles.push([a, b, c])
    offset += 36 + 2 // 9 floats + 2-byte attr
  }
  return triangles
}

// ── ASCII STL ────────────────────────────────────────────────────────────────

const ASCII_VERTEX_PATTERN = /vertex\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/g

function parseAscii(text: string): Array<[Vec3, Vec3, Vec3]> {
  const triangles: Array<[Vec3, Vec3, Vec3]> = []
  const verts: Vec3[] = []
  let m: RegExpExecArray | null
  while ((m = ASCII_VERTEX_PATTERN.exec(text)) !== null) {
    verts.push({ x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) })
    if (verts.length === 3) {
      triangles.push([verts[0], verts[1], verts[2]])
      verts.length = 0
    }
  }
  return triangles
}
