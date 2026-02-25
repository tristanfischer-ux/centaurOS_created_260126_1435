/**
 * @file render-orthographic-views.ts — Offscreen Three.js orthographic view renderer.
 *
 * @description Renders 6 high-quality orthographic CAD views (Iso, Front, Back, Left,
 * Right, Top) from STL data using a headless WebGL renderer. Returns PNG data URLs.
 *
 * Bypasses CadQuery's SVG exporter entirely — no viewBox bugs, proper materials,
 * lighting, and feature-edge hierarchy.
 *
 * DECISION: Uses raw Three.js (not React Three Fiber) so it can run outside React
 * render cycles, disposing all GPU resources immediately after capture.
 */

import * as THREE from "three"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js"

export interface RenderedViews {
  iso: string    // data:image/png;base64,...
  front: string
  back: string
  left: string
  right: string
  top: string
}

const DEFAULT_WIDTH = 2048
const DEFAULT_HEIGHT = 1536

/**
 * Renders 6 orthographic engineering views from a base64-encoded STL file.
 *
 * @description Uses a headless WebGL renderer (no DOM attachment required).
 * Applies professional CAD materials: shaded body (#c8c8c8) + dark feature edges
 * (15° threshold, #333333). Clean even lighting — no shadows.
 *
 * @param stlBase64 - Base64-encoded binary STL data
 * @param resolution - Optional render resolution (default: 2048×1536)
 * @returns Promise resolving to PNG data URLs for all 6 views
 */
export async function renderOrthographicViews(
  stlBase64: string,
  resolution?: { width: number; height: number },
): Promise<RenderedViews> {
  return new Promise((resolve, reject) => {
    try {
      const width = resolution?.width ?? DEFAULT_WIDTH
      const height = resolution?.height ?? DEFAULT_HEIGHT

      // Decode base64 STL
      const binaryString = atob(stlBase64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Parse STL geometry
      const loader = new STLLoader()
      const geometry = loader.parse(bytes.buffer)

      // Center geometry and convert Z-up → Y-up (matches stl-viewer.tsx convention)
      geometry.center()
      geometry.rotateX(-Math.PI / 2)
      geometry.computeVertexNormals()
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()

      // GOTCHA: boundingSphere is null until computeBoundingSphere() is called above
      const r = geometry.boundingSphere!.radius

      // ── Scene ───────────────────────────────────────────────────────────
      const scene = new THREE.Scene()
      scene.background = new THREE.Color("#f5f5f5")

      // Main mesh — professional CAD shaded appearance
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#c8c8c8"),
        metalness: 0.3,
        roughness: 0.45,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geometry, material)
      scene.add(mesh)

      // Feature edge outlines — 15° threshold shows only sharp feature edges,
      // not tessellation triangle edges on curved surfaces
      const edgesGeometry = new THREE.EdgesGeometry(geometry, 15)
      const edgesMaterial = new THREE.LineBasicMaterial({ color: "#333333" })
      const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial)
      scene.add(edges)

      // ── Lighting — clean, even, technical ──────────────────────────────
      scene.add(new THREE.AmbientLight(0xffffff, 0.5))

      const keyLight = new THREE.DirectionalLight(0xffffff, 0.7)
      keyLight.position.set(1, 2, 3)
      scene.add(keyLight)

      const fillLight = new THREE.DirectionalLight(0xffffff, 0.3)
      fillLight.position.set(-2, -1, 1)
      scene.add(fillLight)

      scene.add(new THREE.HemisphereLight(0xffffff, 0xd0d0d0, 0.4))

      // ── Renderer ────────────────────────────────────────────────────────
      const renderer = new THREE.WebGLRenderer({
        preserveDrawingBuffer: true,  // required for toDataURL() after render
        antialias: true,
        alpha: true,
      })
      renderer.setSize(width, height)
      renderer.setPixelRatio(1)  // explicit 1x — we control resolution via width/height

      // ── Orthographic camera — true engineering projection ───────────────
      const aspect = width / height
      const camera = new THREE.OrthographicCamera(
        -r * 1.2 * aspect,   // left
        r * 1.2 * aspect,    // right
        r * 1.2,             // top
        -r * 1.2,            // bottom
        -r * 10,             // near (symmetric so back-faces at any angle are captured)
        r * 10,              // far
      )

      // ── View definitions ─────────────────────────────────────────────────
      // After Z-up → Y-up rotation, Y is up in Three.js world space.
      // Top view uses (0,0,-1) up so +Z appears pointing down (standard drawing convention).
      type ViewDef = { name: keyof RenderedViews; position: THREE.Vector3; up: THREE.Vector3 }
      const views: ViewDef[] = [
        {
          name: "iso",
          position: new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(r * 3),
          up: new THREE.Vector3(0, 1, 0),
        },
        {
          name: "front",
          position: new THREE.Vector3(0, 0, r * 3),
          up: new THREE.Vector3(0, 1, 0),
        },
        {
          name: "back",
          position: new THREE.Vector3(0, 0, -r * 3),
          up: new THREE.Vector3(0, 1, 0),
        },
        {
          name: "left",
          position: new THREE.Vector3(-r * 3, 0, 0),
          up: new THREE.Vector3(0, 1, 0),
        },
        {
          name: "right",
          position: new THREE.Vector3(r * 3, 0, 0),
          up: new THREE.Vector3(0, 1, 0),
        },
        {
          name: "top",
          position: new THREE.Vector3(0, r * 3, 0),
          up: new THREE.Vector3(0, 0, -1),
        },
      ]

      const result: Partial<RenderedViews> = {}

      for (const view of views) {
        camera.position.copy(view.position)
        camera.up.copy(view.up)
        camera.lookAt(0, 0, 0)
        camera.updateProjectionMatrix()

        renderer.render(scene, camera)
        result[view.name] = renderer.domElement.toDataURL("image/png")
      }

      // ── Dispose all GPU resources ────────────────────────────────────────
      geometry.dispose()
      edgesGeometry.dispose()
      material.dispose()
      edgesMaterial.dispose()
      renderer.dispose()

      resolve(result as RenderedViews)
    } catch (err) {
      reject(err)
    }
  })
}
