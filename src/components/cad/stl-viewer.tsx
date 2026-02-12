"use client"

/**
 * @file stl-viewer.tsx — 3D STL viewer using React Three Fiber
 *
 * @description Renders STL files in an interactive 3D canvas with:
 * - Orbit controls (rotate, zoom, pan)
 * - Automatic camera positioning based on bounding box
 * - Grid and axes helpers
 * - Lighting setup for proper material visualization
 */

import { Suspense, useMemo } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Grid, PerspectiveCamera } from "@react-three/drei"
import * as THREE from "three"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js"

interface STLViewerProps {
  /** Base64-encoded STL file content */
  stlData: string
  /** Optional background color (default: dark gray) */
  backgroundColor?: string
}

function STLModel({ stlData }: { stlData: string }) {
  const geometry = useMemo(() => {
    try {
      // Decode base64 to binary
      const binaryString = atob(stlData)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Parse STL
      const loader = new STLLoader()
      const geometry = loader.parse(bytes.buffer)

      // Center geometry at origin
      geometry.center()

      // CadQuery uses Z-up coordinate system; Three.js uses Y-up.
      // Rotate -90° around X to convert so models appear right-way-up.
      geometry.rotateX(-Math.PI / 2)

      // Compute normals for proper lighting
      geometry.computeVertexNormals()

      return geometry
    } catch (err) {
      console.error("Failed to parse STL:", err)
      return new THREE.BoxGeometry(1, 1, 1) // Fallback cube
    }
  }, [stlData])

  // Calculate bounding sphere, box, and vertex count for camera/grid/wireframe decisions
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

  // Skip wireframe on complex models (>50k vertices) to avoid doubling GPU
  // draw calls for negligible visual benefit — typical for large buildings
  const showWireframe = vertexCount < 50_000

  return (
    <>
      {/* Main model */}
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color="#e0e0e0"
          metalness={0.3}
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Wireframe overlay for engineering context — disabled on large models */}
      {showWireframe && (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color="#404040"
            wireframe
            transparent
            opacity={0.1}
          />
        </mesh>
      )}

      {/* Camera setup based on model size */}
      <PerspectiveCamera
        makeDefault
        position={[r * 1.5, r * 1.2, r * 1.5]}
        fov={50}
      />

      {/* Grid on Y ground plane (at bottom of model) */}
      <Grid
        args={[r * 4, r * 4]}
        cellSize={r / 10}
        cellThickness={0.5}
        cellColor="#6e6e6e"
        sectionSize={r / 2}
        sectionThickness={1}
        sectionColor="#9d4b4b"
        fadeDistance={r * 8}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
        position={[0, yMin, 0]}
      />
    </>
  )
}

export function STLViewer({ stlData, backgroundColor = "#1a1a1a" }: STLViewerProps) {
  return (
    <div className="w-full h-full min-h-[400px] rounded-lg overflow-hidden border border-border">
      <Canvas
        shadows
        style={{ background: backgroundColor }}
        gl={{ antialias: true, alpha: false }}
      >
        <Suspense fallback={null}>
          {/* Lighting setup */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[10, 10, 5]}
            intensity={1}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <directionalLight position={[-10, -10, -5]} intensity={0.3} />

          {/* Fill light from below for better visibility (replaces external HDR environment map) */}
          <directionalLight position={[0, -5, 5]} intensity={0.2} />
          <hemisphereLight intensity={0.5} color="#ffffff" groundColor="#444444" />

          {/* 3D Model */}
          <STLModel stlData={stlData} />

          {/* Orbit controls — maxDistance scales with model size so large
              models (e.g. houses at 12 000 mm) remain fully navigable */}
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
