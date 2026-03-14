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

import { Suspense, useMemo, useState, useEffect } from "react"
import { Canvas, useLoader } from "@react-three/fiber"
import { OrbitControls, Grid, PerspectiveCamera } from "@react-three/drei"
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

// INTENT: Dispose GPU resources (geometries, materials, textures) to prevent WebGL memory leaks
function disposeScene(scene: THREE.Object3D) {
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of materials) {
        if (mat && typeof mat.dispose === "function") {
          // Dispose all textures on the material
          for (const key of Object.keys(mat)) {
            const val = (mat as Record<string, unknown>)[key]
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

  const { boundingSphere, yMin } = useMemo(() => {
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

  if (!hasContent) {
    return (
      <div className={`w-full h-full min-h-[300px] rounded-lg border border-border flex items-center justify-center bg-muted ${className ?? ""}`}>
        <p className="text-sm text-muted-foreground">No 3D model available</p>
      </div>
    )
  }

  return (
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
        <Suspense fallback={null}>
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[10, 10, 5]}
            intensity={0.8}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <directionalLight position={[-10, -10, -5]} intensity={0.3} />
          <directionalLight position={[0, -5, 5]} intensity={0.15} />
          <hemisphereLight intensity={0.6} color="#ffffff" groundColor="#d0d0d0" />

          {glbUrl ? (
            <GLBModel url={glbUrl} />
          ) : (
            <STLModel stlData={stlData} stlUrl={stlUrl} />
          )}

          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={1}
            maxDistance={50000}
            makeDefault
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
