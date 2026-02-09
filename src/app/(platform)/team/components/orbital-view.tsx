'use client'

/**
 * OrbitalView — radial company health visualisation with side panel.
 *
 * @description Combines PanZoomCanvas (for drag/zoom interaction),
 * OrbitSVG (the visual diagram), and OrbitSidePanel (details on right).
 */

import { useState, useCallback } from 'react'
import { PanZoomCanvas } from './pan-zoom-canvas'
import { OrbitSVG } from './orbit-svg'
import { OrbitSidePanel } from './orbit-side-panel'
import type { FunctionId } from '../types'

export function OrbitalView() {
  const [selected, setSelected] = useState<FunctionId | null>(null)

  const handleSelect = useCallback((id: FunctionId) => {
    setSelected((prev) => (prev === id ? null : id))
  }, [])

  const handleDeselect = useCallback(() => {
    setSelected(null)
  }, [])

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Pan + Zoom Canvas with Orbit SVG */}
      <PanZoomCanvas onBackgroundClick={handleDeselect}>
        <OrbitSVG selected={selected} onSelect={handleSelect} />
      </PanZoomCanvas>

      {/* Side Panel (340px) */}
      <div className="w-[340px] border-l border-border overflow-y-auto bg-muted/30">
        <OrbitSidePanel selected={selected} />
      </div>
    </div>
  )
}
