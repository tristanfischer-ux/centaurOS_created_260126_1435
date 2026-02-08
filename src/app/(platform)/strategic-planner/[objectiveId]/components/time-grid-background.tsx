"use client"

/**
 * @description SVG overlay that renders time gridlines on the React Flow canvas.
 * Shows month labels and week-spaced vertical lines for temporal orientation.
 */

import { useViewport } from "@xyflow/react"
import type { TimeRange } from "../lib/layout-engine"

interface TimeGridBackgroundProps {
  timeRange: TimeRange
}

export function TimeGridBackground({ timeRange }: TimeGridBackgroundProps) {
  const { x, y, zoom } = useViewport()

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'visible',
      }}
    >
      <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
        {/* Week gridlines (subtle) */}
        {timeRange.weekMarkers.map((marker, idx) => (
          <line
            key={`week-${idx}`}
            x1={marker.x}
            y1={-2000}
            x2={marker.x}
            y2={5000}
            stroke="hsl(var(--muted-foreground) / 0.08)"
            strokeWidth={1 / zoom}
          />
        ))}

        {/* Month gridlines (stronger) */}
        {timeRange.monthMarkers.map((marker, idx) => (
          <g key={`month-${idx}`}>
            <line
              x1={marker.x}
              y1={-2000}
              x2={marker.x}
              y2={5000}
              stroke="hsl(var(--muted-foreground) / 0.15)"
              strokeWidth={1.5 / zoom}
            />
            <text
              x={marker.x + 6}
              y={20}
              fill="hsl(var(--muted-foreground) / 0.5)"
              fontSize={11 / zoom}
              fontWeight={600}
              fontFamily="var(--font-mono, monospace)"
            >
              {marker.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}
