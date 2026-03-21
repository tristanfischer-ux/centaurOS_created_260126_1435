"use client"

/**
 * @file model-viewer.tsx — Unified GLB + STL 3D viewer.
 *
 * @description Extends the STL viewer pattern with GLB support via GLTFLoader.
 * Used in the provider comparison grid. Renders PBR textures when GLB is
 * provided, falls back to warm gray material for STL.
 *
 * Props accept either a remote URL (glbUrl/stlUrl) or inline base64 (stlData).
 */

import { Suspense, useMemo, useState, useEffect, Component, type ReactNode } from "react"
import { Canvas, useLoader } from "@react-three/fiber"
import { OrbitControls, Grid, PerspectiveCamera, Environment } from "@react-three/drei"
import * as THREE from "three"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

interface ModelViewerProps {
  /** Remote GLB URL — preferred, renders PBR textures */
  glbUrl?: string
  /** Base64-encoded STL data */
  stlData?: string
  /** Remote STL URL */
  stlUrl?: string
  /** Label shown in top-left corner */
  providerLabel?: string
  /** Optional background color (default: light gray) */
  backgroundColor?: string
  /** Optional CSS class */
  className?: string
}

// ─── GLB Model (loaded from URL) ─────────────────────────────────────

// INTENT: Dispose GPU resources (geometries, materials, textures) to prevent WebGL memory leaks.
// Handles Mesh, SkinnedMesh, Points, Line, LineSegments, Sprite — all types that hold GPU resources.
function disposeScene(scene: THREE.Object3D) {
  scene.traverse((child) => {
    const obj = child as THREE.Mesh
    if (obj.geometry && typeof obj.geometry.dispose === "function") {
      obj.geometry.dispose()
    }
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of materials) {
        if (mat && typeof mat.dispose === "function") {
          for (const key of Object.keys(mat)) {
            const val = (mat as unknown as Record<string, unknown>)[key]
            if (val instanceof THREE.Texture) val.dispose()
          }
          mat.dispose()
        }
      }
    }
  })
}

function GLBModel({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url)

  // SECURITY: Dispose GPU resources on unmount or URL change
  useEffect(() => {
    return () => {
      disposeScene(gltf.scene)
    }
  }, [gltf.scene])

  // GOTCHA: Some providers (TRELLIS) export meshes rotated 90° around X axis
  // (Z-up convention vs Y-up). Detect by checking if the bounding box is
  // taller than it is wide/deep and auto-correct orientation.
  const { boundingSphere, yMin } = useMemo(() => {
    // First compute raw bounds to detect orientation
    const rawBox = new THREE.Box3().setFromObject(gltf.scene)
    const size = new THREE.Vector3()
    rawBox.getSize(size)

    // If the model is significantly taller than wide, it's likely Z-up → rotate to Y-up
    const heightRatio = size.y / Math.max(size.x, size.z, 0.001)
    if (heightRatio > 2.0) {
      gltf.scene.rotation.x = -Math.PI / 2
      gltf.scene.updateMatrixWorld(true)
    }

    const box = new THREE.Box3().setFromObject(gltf.scene)
    const sphere = new THREE.Sphere()
    box.getBoundingSphere(sphere)
    return { boundingSphere: sphere, yMin: box.min.y }
  }, [gltf.scene])

  const r = boundingSphere.radius || 500

  return (
    <>
      <primitive object={gltf.scene} />

      <PerspectiveCamera
        makeDefault
        position={[r * 1.5, r * 1.2, r * 1.5]}
        fov={50}
      />

      <Grid
        args={[r * 4, r * 4]}
        cellSize={r / 10}
        cellThickness={0.5}
        cellColor="#c0c0c0"
        sectionSize={r / 2}
        sectionThickness={1}
        sectionColor="#e0836b"
        fadeDistance={r * 8}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
        position={[0, yMin, 0]}
      />
    </>
  )
}

// ─── STL Model (from base64 or URL) ──────────────────────────────────

function STLModel({ stlData, stlUrl }: { stlData?: string; stlUrl?: string }) {
  const [urlGeometry, setUrlGeometry] = useState<THREE.BufferGeometry | null>(null)

  // Load STL from URL — dispose previous geometry on URL change
  useEffect(() => {
    if (!stlUrl) return
    const loader = new STLLoader()
    loader.load(stlUrl, (geo) => {
      geo.center()
      geo.rotateX(-Math.PI / 2)
      geo.computeVertexNormals()
      setUrlGeometry((prev) => {
        prev?.dispose()
        return geo
      })
    })
    return () => {
      setUrlGeometry((prev) => {
        prev?.dispose()
        return null
      })
    }
  }, [stlUrl])

  const geometry = useMemo(() => {
    if (stlData) {
      try {
        const binaryString = atob(stlData)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const loader = new STLLoader()
        const geo = loader.parse(bytes.buffer)
        geo.center()
        geo.rotateX(-Math.PI / 2)
        geo.computeVertexNormals()
        return geo
      } catch (err) {
        console.error("Failed to parse STL:", err)
        return new THREE.BoxGeometry(1, 1, 1)
      }
    }
    return urlGeometry ?? new THREE.BoxGeometry(1, 1, 1)
  }, [stlData, urlGeometry])

  // Dispose geometry on unmount to prevent WebGL memory leaks
  useEffect(() => {
    return () => { geometry.dispose() }
  }, [geometry])

  const { boundingSphere, yMin, vertexCount } = useMemo(() => {
    geometry.computeBoundingSphere()
    geometry.computeBoundingBox()
    const posAttr = geometry.getAttribute("position")
    return {
      boundingSphere: geometry.boundingSphere,
      yMin: geometry.boundingBox?.min.y ?? 0,
      vertexCount: posAttr ? posAttr.count : 0,
    }
  }, [geometry])

  const r = boundingSphere?.radius ?? 500
  const showWireframe = vertexCount < 50_000

  return (
    <>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color="#b0b0b0"
          metalness={0.25}
          roughness={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>

      {showWireframe && (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color="#666666"
            wireframe
            transparent
            opacity={0.08}
          />
        </mesh>
      )}

      <PerspectiveCamera
        makeDefault
        position={[r * 1.5, r * 1.2, r * 1.5]}
        fov={50}
      />

      <Grid
        args={[r * 4, r * 4]}
        cellSize={r / 10}
        cellThickness={0.5}
        cellColor="#c0c0c0"
        sectionSize={r / 2}
        sectionThickness={1}
        sectionColor="#e0836b"
        fadeDistance={r * 8}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
        position={[0, yMin, 0]}
      />
    </>
  )
}

// ─── Error Boundary ─────────────────────────────────────────────────

// INTENT: Catch failures from Environment HDR fetch (CDN down) or GLB
// load errors so the viewer degrades gracefully instead of crashing.
class ViewerErrorBoundary extends Component<
  { children: ReactNode; className?: string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; className?: string }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error) {
    console.error("[ModelViewer] Render error:", error.message)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className={`w-full h-full min-h-[300px] rounded-lg border border-border flex items-center justify-center bg-muted ${this.props.className ?? ""}`}>
          <p className="text-sm text-muted-foreground">3D viewer failed to load</p>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Main Component ──────────────────────────────────────────────────

export function ModelViewer({
  glbUrl,
  stlData,
  stlUrl,
  providerLabel,
  backgroundColor = "#f5f5f5",
  className,
}: ModelViewerProps) {
  const hasContent = !!(glbUrl || stlData || stlUrl)
  const isGlb = !!glbUrl

  if (!hasContent) {
    return (
      <div className={`w-full h-full min-h-[300px] rounded-lg border border-border flex items-center justify-center bg-muted ${className ?? ""}`}>
        <p className="text-sm text-muted-foreground">No 3D model available</p>
      </div>
    )
  }

  return (
    <ViewerErrorBoundary className={className}>
      <div className={`relative w-full h-full min-h-[300px] rounded-lg overflow-hidden border border-border ${className ?? ""}`}>
        {providerLabel && (
          <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-background/90 text-xs font-medium text-foreground border border-border">
            {providerLabel}
          </div>
        )}
        <Canvas
          shadows
          style={{ background: backgroundColor }}
          gl={{ antialias: true, alpha: false }}
        >
          {/* INTENT: PBR metallic surfaces reflect their environment — without an
              environment map they reflect black/nothing, appearing grey. "studio"
              provides neutral product-photography lighting. Only needed for GLB
              (STL uses a fixed material colour, not PBR textures).
              DECISION: Separate Suspense so the GLB model renders immediately with
              direct lights while the HDR loads asynchronously from CDN. Once the
              HDR arrives, PBR reflections appear — progressive enhancement. */}
          {isGlb && (
            <Suspense fallback={null}>
              <Environment preset="studio" />
            </Suspense>
          )}

          {/* DECISION: GLB lighting is lower because Environment provides most of
              the illumination via HDR reflections. STL has no env map so needs
              stronger direct lights. All values scaled for Three.js r182
              physically-correct mode (old 1.0 ≈ Math.PI). */}
          <ambientLight intensity={isGlb ? 0.8 : 1.5} />
          <directionalLight
            position={[10, 10, 5]}
            intensity={isGlb ? 1.5 : 2.5}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <directionalLight position={[-10, -10, -5]} intensity={isGlb ? 0.5 : 1.0} />
          <directionalLight position={[0, -5, 5]} intensity={isGlb ? 0.3 : 0.5} />
          <hemisphereLight intensity={isGlb ? 0.6 : 1.5} color="#ffffff" groundColor="#d0d0d0" />

          <Suspense fallback={null}>
            {isGlb ? (
              <GLBModel url={glbUrl} />
            ) : (
              <STLModel stlData={stlData} stlUrl={stlUrl} />
            )}
          </Suspense>

          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={1}
            maxDistance={50000}
            makeDefault
          />
        </Canvas>
      </div>
    </ViewerErrorBoundary>
  )
}
