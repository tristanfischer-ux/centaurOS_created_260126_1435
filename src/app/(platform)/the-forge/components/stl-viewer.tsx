/**
 * @file stl-viewer.tsx — Interactive 3D STL model viewer
 *
 * @description Renders an STL file from a URL in an interactive 3D canvas
 * with orbit controls (rotate, zoom, pan). Auto-centers and auto-scales
 * the model to fill the viewport. Used on the concept page to display
 * the system-level 3D CAD model.
 *
 * @related
 * - System blueprint: ./system-blueprint.tsx (parent component)
 * - CAD generator: ../services/cad-generator.ts (produces STL files)
 */

"use client"

import React, { Suspense, useRef, useState, useEffect, useMemo } from "react"

import { Canvas, useLoader, useThree } from "@react-three/fiber"
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js"
import * as THREE from "three"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────

interface StlViewerProps {
  /** URL of the STL file to load */
  stlUrl: string
  /** Optional CSS class for the container */
  className?: string
  /** Container height (default: 500px) */
  height?: number
}

// ─── Inner Scene Components ──────────────────────────────────────────

/**
 * Loads and renders the STL geometry, auto-centering and scaling it.
 *
 * @param stlUrl - URL of the STL file
 */
function StlModel({ stlUrl }: { stlUrl: string }): React.ReactNode {
  const geometry = useLoader(STLLoader, stlUrl)
  const meshRef = useRef<THREE.Mesh>(null)
  const { camera } = useThree()

  // Auto-center and auto-scale on load
  useEffect(() => {
    if (!geometry || !meshRef.current) return

    // Center the geometry
    geometry.computeBoundingBox()
    geometry.center()

    // Scale to fit nicely in viewport
    const box = geometry.boundingBox
    if (box) {
      const size = new THREE.Vector3()
      box.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = 4 / maxDim // Fit within a ~4-unit sphere
      meshRef.current.scale.setScalar(scale)

      // Position camera to frame the model
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.position.set(5, 4, 6)
        camera.lookAt(0, 0, 0)
        camera.updateProjectionMatrix()
      }
    }
  }, [geometry, camera])

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#8B9DAF",
        metalness: 0.3,
        roughness: 0.5,
      }),
    [],
  )

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} castShadow receiveShadow />
  )
}

/**
 * Subtle ground grid for spatial reference.
 */
function GroundGrid(): React.ReactNode {
  return (
    <group>
      <gridHelper args={[20, 40, "#e2e8f0", "#f1f5f9"]} rotation={[0, 0, 0]} />
      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={0.25}
        scale={15}
        blur={2}
        far={5}
      />
    </group>
  )
}

// ─── Loading Fallback ────────────────────────────────────────────────

function ViewerSkeleton({ height }: { height: number }): React.ReactNode {
  return (
    <div className="flex items-center justify-center" style={{ height }}>
      <Skeleton className="w-full h-full rounded-xl" />
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────

/**
 * StlViewer — Interactive 3D STL viewer with orbit controls.
 *
 * @description Loads an STL file, auto-centers/scales it, and renders
 * in a Canvas with orbit controls for rotate/zoom/pan interaction.
 *
 * @example
 * <StlViewer stlUrl="https://storage.example.com/system-cad.stl" height={500} />
 */
export function StlViewer({
  stlUrl,
  className,
  height = 500,
}: StlViewerProps): React.ReactNode {
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl bg-muted/30 border border-dashed",
          className,
        )}
        style={{ height }}
      >
        <p className="text-sm text-muted-foreground">
          Failed to load 3D model. Try refreshing the page.
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn("rounded-xl overflow-hidden border bg-gradient-to-b from-slate-50 to-white", className)}
      style={{ height }}
    >
      <Suspense fallback={<ViewerSkeleton height={height} />}>
        <ErrorBoundary onError={() => setHasError(true)}>
          <Canvas
            shadows
            camera={{ position: [5, 4, 6], fov: 45, near: 0.1, far: 100 }}
            style={{ width: "100%", height: "100%" }}
          >
            {/* Lighting */}
            <ambientLight intensity={0.4} />
            <directionalLight position={[8, 10, 5]} intensity={0.8} castShadow />
            <directionalLight position={[-5, 5, -5]} intensity={0.3} />

            {/* Environment for realistic reflections */}
            <Environment preset="city" />

            {/* Model */}
            <StlModel stlUrl={stlUrl} />

            {/* Ground reference */}
            <GroundGrid />

            {/* Orbit controls — rotate/zoom/pan */}
            <OrbitControls
              enableDamping
              dampingFactor={0.1}
              minDistance={2}
              maxDistance={20}
              maxPolarAngle={Math.PI / 2 + 0.3}
              makeDefault
            />
          </Canvas>
        </ErrorBoundary>
      </Suspense>
    </div>
  )
}

// ─── Error Boundary ──────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: React.ReactNode
  onError: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Simple error boundary for the 3D canvas.
 * Catches WebGL or loading errors without crashing the whole page.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(): void {
    this.props.onError()
  }

  render(): React.ReactNode {
    if (this.state.hasError) return null
    return this.props.children
  }
}
