/**
 * @file parsers/step.ts
 *
 * @description STEP parser via occt-import-js (OpenCascade WASM).
 * Computes bounding box from the mesh vertex positions, approximates
 * volume via the signed-tetrahedron sum, counts leaf nodes in the
 * assembly tree, and reports total surface area from all triangles.
 *
 * @decision We take the mesh-derived volume rather than OCCT's BRep volume
 * because the latter is only exposed inside the native OCCT API, not the
 * JS-level result of occt-import-js. For first-pass cost/material sanity
 * checks the triangulated volume is close enough.
 *
 * @gotcha occt-import-js is a CommonJS module whose default export is a
 * factory (a `() => Promise<OCCTModule>`). The first call loads the WASM
 * and caches it — subsequent calls reuse the same promise.
 */

import type { ParseResult, Vec3 } from "./index"

// Lazy WASM init — only pay the cost on the first STEP upload in a Function
// cold start, cache for the rest of the request lifecycle.
let occtPromise: Promise<OcctModule> | null = null

async function getOcct(): Promise<OcctModule> {
  if (!occtPromise) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const factory = require("occt-import-js") as () => Promise<OcctModule>
    occtPromise = factory()
  }
  return occtPromise
}

interface OcctMesh {
  name?: string
  attributes?: { position?: { array?: number[] } }
  index?: { array?: number[] }
}

interface OcctNode {
  name?: string
  meshes?: number[]
  children?: OcctNode[]
}

interface OcctResult {
  success: boolean
  root?: OcctNode
  meshes?: OcctMesh[]
}

interface OcctModule {
  ReadStepFile: (buffer: Uint8Array, params: unknown) => OcctResult
}

/**
 * STEP parser entry point.
 *
 * @param buffer - Raw file bytes
 * @returns Parsed geometry or structured error. Never throws.
 */
export async function parseStep(buffer: Uint8Array): Promise<ParseResult> {
  try {
    const occt = await getOcct()
    const result = occt.ReadStepFile(buffer, { linearUnit: "millimeter" })

    if (!result?.success) {
      return {
        ok: false,
        error: "OpenCascade rejected the STEP file as invalid",
        code: "step_invalid",
      }
    }

    const meshes = result.meshes ?? []
    if (meshes.length === 0) {
      return {
        ok: false,
        error: "STEP imported with no meshes — empty assembly?",
        code: "step_empty",
      }
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    let volume6 = 0
    let area = 0

    for (const mesh of meshes) {
      const positions = mesh.attributes?.position?.array
      const indices = mesh.index?.array
      if (!positions || !indices) continue

      // Grow bounding box over all vertices.
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2]
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (z < minZ) minZ = z
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
        if (z > maxZ) maxZ = z
      }

      // Per-triangle volume + surface area.
      for (let t = 0; t < indices.length; t += 3) {
        const ia = indices[t] * 3
        const ib = indices[t + 1] * 3
        const ic = indices[t + 2] * 3
        const a: Vec3 = { x: positions[ia], y: positions[ia + 1], z: positions[ia + 2] }
        const b: Vec3 = { x: positions[ib], y: positions[ib + 1], z: positions[ib + 2] }
        const c: Vec3 = { x: positions[ic], y: positions[ic + 1], z: positions[ic + 2] }

        volume6 +=
          a.x * (b.y * c.z - b.z * c.y) +
          a.y * (b.z * c.x - b.x * c.z) +
          a.z * (b.x * c.y - b.y * c.x)

        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z
        const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z
        const nx = uy * vz - uz * vy
        const ny = uz * vx - ux * vz
        const nz = ux * vy - uy * vx
        area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2
      }
    }

    if (minX === Infinity) {
      return {
        ok: false,
        error: "STEP meshes had no vertex data",
        code: "step_no_vertices",
      }
    }

    const volumeMm3 = Math.abs(volume6) / 6
    const partCount = countLeafNodes(result.root)

    return {
      ok: true,
      geometry: {
        bboxMinMm: { x: minX, y: minY, z: minZ },
        bboxMaxMm: { x: maxX, y: maxY, z: maxZ },
        volumeMm3,
        surfaceAreaMm2: area,
        partCount,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown STEP parse error"
    console.error("[cad-upload/parsers/step] parse failed:", msg)
    return { ok: false, error: msg, code: "step_parse_failed" }
  }
}

function countLeafNodes(node?: OcctNode): number {
  if (!node) return 0
  const children = node.children ?? []
  if (children.length === 0) {
    // A node with meshes but no children is a leaf (a part).
    return (node.meshes?.length ?? 0) > 0 ? 1 : 0
  }
  let total = 0
  for (const child of children) total += countLeafNodes(child)
  return total
}
