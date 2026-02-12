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
import { OrbitControls, Grid, PerspectiveCamera, Environment } from "@react-three/drei"
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

      // Compute normals for proper lighting
      geometry.computeVertexNormals()

      return geometry
    } catch (err) {
      console.error("Failed to parse STL:", err)
      return new THREE.BoxGeometry(1, 1, 1) // Fallback cube
    }
  }, [stlData])

  // Calculate bounding sphere for camera positioning
  const boundingSphere = useMemo(() => {
    geometry.computeBoundingSphere()
    return geometry.boundingSphere
  }, [geometry])

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

      {/* Wireframe overlay for engineering context */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color="#404040"
          wireframe
          transparent
          opacity={0.1}
        />
      </mesh>

      {/* Camera setup based on model size */}
      <PerspectiveCamera
        makeDefault
        position={[
          boundingSphere?.radius ? boundingSphere.radius * 1.5 : 500,
          boundingSphere?.radius ? boundingSphere.radius * 1.2 : 400,
          boundingSphere?.radius ? boundingSphere.radius * 1.5 : 500,
        ]}
        fov={50}
      />

      {/* Grid at Z=0 (ground plane) */}
      <Grid
        args={[
          boundingSphere?.radius ? boundingSphere.radius * 4 : 2000,
          boundingSphere?.radius ? boundingSphere.radius * 4 : 2000,
        ]}
        cellSize={boundingSphere?.radius ? boundingSphere.radius / 10 : 50}
        cellThickness={0.5}
        cellColor="#6e6e6e"
        sectionSize={boundingSphere?.radius ? boundingSphere.radius / 2 : 200}
        sectionThickness={1}
        sectionColor="#9d4b4b"
        fadeDistance={boundingSphere?.radius ? boundingSphere.radius * 8 : 4000}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
        position={[0, 0, 0]}
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

          {/* Environment map for realistic reflections */}
          <Environment preset="city" />

          {/* 3D Model */}
          <STLModel stlData={stlData} />

          {/* Orbit controls */}
          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={10}
            maxDistance={5000}
            makeDefault
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
