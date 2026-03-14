/**
 * @file mesh-convert.ts — Server-side GLB → STL conversion via three.js.
 *
 * @description Converts GLB meshes (from image-to-3D providers) to STL format
 * for the existing STLViewer and orthographic rendering pipeline.
 *
 * Runs in Node.js — no browser needed. The existing orthographic view renderer
 * (render-orthographic-views.ts) already does headless three.js, confirming
 * this approach works.
 */

import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js"
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js"

/**
 * Convert a GLB buffer to an STL buffer.
 *
 * @param glbBuffer - GLB binary data
 * @returns STL binary as a Buffer
 * @throws Error if GLB parsing fails or contains no geometry
 */
export async function glbToStl(glbBuffer: Buffer): Promise<Buffer> {
  // SECURITY: Reject oversized GLBs before parsing
  if (glbBuffer.length > 100 * 1024 * 1024) {
    throw new Error("GLB too large for conversion (>100MB)")
  }

  const loader = new GLTFLoader()
  const exporter = new STLExporter()

  // INTENT: GLTFLoader.parse expects an ArrayBuffer + onLoad/onError callbacks.
  // We wrap it in a promise for async/await usage.
  const gltf = await new Promise<GLTF>((resolve, reject) => {
    // GOTCHA: Buffer.buffer may return SharedArrayBuffer on some Node versions.
    // Copy to a fresh ArrayBuffer to satisfy GLTFLoader's type requirement.
    const uint8 = new Uint8Array(glbBuffer)
    const arrayBuffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer

    loader.parse(
      arrayBuffer,
      "",
      (result) => resolve(result),
      (error) => reject(new Error(`GLB parse failed: ${error instanceof Error ? error.message : String(error)}`)),
    )
  })

  // INTENT: GLTF scene is a Group, not a Scene. Wrap in a Scene for STLExporter.
  const scene = new THREE.Scene()
  scene.add(gltf.scene)

  // Verify the scene has geometry + count vertices to prevent decompression bombs
  let hasMesh = false
  let totalVertices = 0
  const MAX_VERTICES = 5_000_000

  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      hasMesh = true
      const posAttr = child.geometry.getAttribute("position")
      if (posAttr) totalVertices += posAttr.count
    }
  })

  if (!hasMesh) {
    throw new Error("GLB contains no mesh geometry")
  }

  if (totalVertices > MAX_VERTICES) {
    throw new Error(`GLB has too many vertices (${totalVertices.toLocaleString()}) for STL conversion`)
  }

  // Export to STL (binary format for smaller size)
  const stlBinary = exporter.parse(scene, { binary: true })

  // GOTCHA: STLExporter.parse with binary:true returns a DataView in the
  // current three.js version. Cast via unknown to handle the union type safely.
  let stlBuffer: Buffer
  const result = stlBinary as unknown
  if (result instanceof DataView) {
    stlBuffer = Buffer.from(result.buffer, result.byteOffset, result.byteLength)
  } else if (result instanceof ArrayBuffer) {
    stlBuffer = Buffer.from(result)
  } else {
    // String (ASCII STL) fallback
    stlBuffer = Buffer.from(result as string, "utf-8")
  }

  console.info(`[MESH-CONVERT] GLB→STL: ${Math.round(glbBuffer.length / 1024)}kb → ${Math.round(stlBuffer.length / 1024)}kb`)

  return stlBuffer
}
