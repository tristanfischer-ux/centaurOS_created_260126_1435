"use client"

/**
 * @file schematic-view.tsx — 2D SVG schematic with interactive component slots.
 *
 * @description Renders an SVG diagram of the assembly with clickable slots.
 * Empty slots pulse gently (like RPG equipment slots). Filled slots show
 * the component name and a colored indicator. Slots are color-coded by group.
 *
 * @component
 * @example
 * <SchematicView
 *   slots={slots}
 *   placedComponents={placed}
 *   activeSlotId={activeId}
 *   onSlotClick={handleSlotClick}
 * />
 */

import { useMemo } from "react"
import { cn } from "@/lib/utils"

import type { TemplateSlot, PlacedComponent } from "@/actions/assembly-builder"

// ─── Group Colors ────────────────────────────────────────────────────

const GROUP_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  propulsion: { fill: "#fff7ed", stroke: "#f97316", text: "#c2410c" },
  structure: { fill: "#eff6ff", stroke: "#3b82f6", text: "#1d4ed8" },
  electronics: { fill: "#faf5ff", stroke: "#a855f7", text: "#7e22ce" },
  power: { fill: "#fefce8", stroke: "#eab308", text: "#a16207" },
  sensors: { fill: "#ecfdf5", stroke: "#10b981", text: "#047857" },
  payload: { fill: "#fdf2f8", stroke: "#ec4899", text: "#be185d" },
  control: { fill: "#f0f9ff", stroke: "#0ea5e9", text: "#0369a1" },
  default: { fill: "#f8fafc", stroke: "#94a3b8", text: "#475569" },
}

/**
 * Gets color scheme for a slot group.
 */
function getGroupColor(group: string): { fill: string; stroke: string; text: string } {
  return GROUP_COLORS[group.toLowerCase()] ?? GROUP_COLORS.default
}

// ─── Props ───────────────────────────────────────────────────────────

interface SchematicViewProps {
  /** Slot definitions from the template */
  slots: TemplateSlot[]
  /** Currently placed components */
  placedComponents: PlacedComponent[]
  /** Currently active/selected slot ID */
  activeSlotId: string | null
  /** Called when a slot is clicked */
  onSlotClick: (slotId: string) => void
  /** Custom SVG from template (rendered as background) */
  customSvg?: string | null
  /** Optional className */
  className?: string
}

// ─── Slot Dimensions ─────────────────────────────────────────────────

const SLOT_WIDTH = 120
const SLOT_HEIGHT = 56
const SLOT_RADIUS = 10

// ─── Component ───────────────────────────────────────────────────────

export function SchematicView({
  slots,
  placedComponents,
  activeSlotId,
  onSlotClick,
  customSvg,
  className,
}: SchematicViewProps): React.ReactNode {
  // Build a lookup of slotId -> placed component
  const placedBySlot = useMemo(() => {
    const map = new Map<string, PlacedComponent>()
    for (const pc of placedComponents) {
      if (pc.slotId) map.set(pc.slotId, pc)
    }
    return map
  }, [placedComponents])

  // Calculate SVG viewBox from slot positions
  const viewBox = useMemo(() => {
    if (slots.length === 0) return "0 0 600 400"
    const padding = 80
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const slot of slots) {
      minX = Math.min(minX, slot.position.x)
      minY = Math.min(minY, slot.position.y)
      maxX = Math.max(maxX, slot.position.x + SLOT_WIDTH)
      maxY = Math.max(maxY, slot.position.y + SLOT_HEIGHT)
    }
    return `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`
  }, [slots])

  // Group slots by group for rendering connection lines
  const groupedSlots = useMemo(() => {
    const groups = new Map<string, TemplateSlot[]>()
    for (const slot of slots) {
      const existing = groups.get(slot.group) ?? []
      existing.push(slot)
      groups.set(slot.group, existing)
    }
    return groups
  }, [slots])

  // Completion percentage for the ring
  const filledCount = placedComponents.filter((pc) =>
    slots.some((s) => s.id === pc.slotId),
  ).length
  const totalCount = slots.length
  const completionPct = totalCount > 0 ? (filledCount / totalCount) * 100 : 0

  return (
    <div className={cn("relative w-full h-full flex items-center justify-center", className)}>
      {/* Completion ring (background) */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <svg width="36" height="36" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke={completionPct === 100 ? "hsl(var(--status-success))" : "hsl(var(--international-orange))"}
            strokeWidth="3"
            strokeDasharray={`${(completionPct / 100) * 87.96} 87.96`}
            strokeLinecap="round"
            transform="rotate(-90 18 18)"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <span className="text-xs font-mono font-medium text-muted-foreground">
          {filledCount}/{totalCount}
        </span>
      </div>

      <svg
        viewBox={viewBox}
        className="w-full h-full max-h-[600px]"
        style={{ minHeight: 300 }}
      >
        {/* CSS Animations */}
        <defs>
          <style>{`
            @keyframes slotPulse {
              0%, 100% { opacity: 0.6; }
              50% { opacity: 1; }
            }
            .slot-empty { animation: slotPulse 2s ease-in-out infinite; }
            .slot-active { filter: drop-shadow(0 0 8px rgba(255, 69, 0, 0.5)); }
          `}</style>
        </defs>

        {/* Custom SVG background (if template provides one) */}
        {customSvg && (
          <g opacity="0.15" dangerouslySetInnerHTML={{ __html: customSvg }} />
        )}

        {/* Group connection lines */}
        {Array.from(groupedSlots.entries()).map(([group, groupSlots]) => {
          if (groupSlots.length < 2) return null
          const color = getGroupColor(group)
          const points = groupSlots.map(
            (s) => `${s.position.x + SLOT_WIDTH / 2},${s.position.y + SLOT_HEIGHT / 2}`,
          )
          return (
            <polyline
              key={`line-${group}`}
              points={points.join(" ")}
              fill="none"
              stroke={color.stroke}
              strokeWidth="1.5"
              strokeDasharray="6 4"
              opacity="0.3"
            />
          )
        })}

        {/* Group labels */}
        {Array.from(groupedSlots.entries()).map(([group, groupSlots]) => {
          const color = getGroupColor(group)
          const avgX =
            groupSlots.reduce((sum, s) => sum + s.position.x, 0) /
            groupSlots.length
          const minY = Math.min(...groupSlots.map((s) => s.position.y))
          return (
            <text
              key={`label-${group}`}
              x={avgX + SLOT_WIDTH / 2}
              y={minY - 14}
              textAnchor="middle"
              fill={color.text}
              fontSize="10"
              fontWeight="600"
              fontFamily="monospace"
              letterSpacing="0.1em"
            >
              {group.toUpperCase()}
            </text>
          )
        })}

        {/* Slots */}
        {slots.map((slot) => {
          const placed = placedBySlot.get(slot.id)
          const isFilled = !!placed
          const isActive = activeSlotId === slot.id
          const color = getGroupColor(slot.group)

          return (
            <g
              key={slot.id}
              transform={`translate(${slot.position.x}, ${slot.position.y})`}
              onClick={() => onSlotClick(slot.id)}
              style={{ cursor: "pointer" }}
              role="button"
              aria-label={`${slot.label}${isFilled ? ` — ${placed.componentName}` : " — empty"}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onSlotClick(slot.id)
                }
              }}
            >
              {/* Slot background */}
              <rect
                x="0"
                y="0"
                width={SLOT_WIDTH}
                height={SLOT_HEIGHT}
                rx={SLOT_RADIUS}
                fill={isFilled ? color.fill : "white"}
                stroke={isActive ? "#ff4500" : isFilled ? color.stroke : "#cbd5e1"}
                strokeWidth={isActive ? 2.5 : 1.5}
                className={cn(
                  !isFilled && !isActive && "slot-empty",
                  isActive && "slot-active",
                )}
                style={
                  isFilled
                    ? {}
                    : { strokeDasharray: "4 3" }
                }
              />

              {/* Required indicator */}
              {slot.required && !isFilled && (
                <circle
                  cx={SLOT_WIDTH - 8}
                  cy="8"
                  r="3"
                  fill="#ef4444"
                />
              )}

              {/* Content */}
              {isFilled ? (
                <>
                  {/* Filled: component name */}
                  <text
                    x={SLOT_WIDTH / 2}
                    y="22"
                    textAnchor="middle"
                    fill={color.text}
                    fontSize="10"
                    fontWeight="600"
                  >
                    {truncateText(placed.componentName, 16)}
                  </text>
                  <text
                    x={SLOT_WIDTH / 2}
                    y="38"
                    textAnchor="middle"
                    fill={color.stroke}
                    fontSize="8"
                    opacity="0.7"
                  >
                    {slot.label}
                  </text>
                  {/* Filled indicator dot */}
                  <circle
                    cx="10"
                    cy={SLOT_HEIGHT / 2}
                    r="3"
                    fill={color.stroke}
                  />
                </>
              ) : (
                <>
                  {/* Empty: slot label */}
                  <text
                    x={SLOT_WIDTH / 2}
                    y="24"
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="10"
                    fontWeight="500"
                  >
                    {truncateText(slot.label, 16)}
                  </text>
                  <text
                    x={SLOT_WIDTH / 2}
                    y="40"
                    textAnchor="middle"
                    fill="#cbd5e1"
                    fontSize="8"
                  >
                    Click to assign
                  </text>
                </>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/**
 * Truncates text with ellipsis.
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + "…"
}
