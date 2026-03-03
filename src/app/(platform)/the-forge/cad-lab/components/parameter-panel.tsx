"use client"

/**
 * @file parameter-panel.tsx — Slider-based parameter panel for CadQuery code.
 *
 * @description Renders extracted numeric parameters as labeled inputs with range
 * sliders. Debounced changes rebuild the code and auto-execute. Collapsible panel
 * that starts expanded when parameters exist.
 */

import { useCallback, useState, useRef, useEffect } from "react"
import { SlidersHorizontal, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ExtractedParameter } from "@/lib/cad-lab/parameter-extractor"

// ─── Unit extraction regex ───────────────────────────────────────────

const UNIT_RE = /\b(mm|cm|m|in|deg|rad|%)\b/i

/** Extract unit suffix from parameter label/comment if present */
function extractUnit(param: ExtractedParameter): string | null {
  const source = param.label || param.name
  const match = UNIT_RE.exec(source)
  return match ? match[1] : null
}

/** Compute smarter slider range based on value magnitude (#7) */
function computeRange(originalValue: number): { min: number; max: number; step: number } {
  const abs = Math.abs(originalValue)

  // Near-zero: symmetric range around 0
  if (abs < 0.001) return { min: -10, max: 10, step: 0.1 }

  // Negative values: symmetric range
  if (originalValue < 0) {
    return { min: originalValue * 3, max: -originalValue * 0.5, step: abs < 1 ? 0.01 : abs < 10 ? 0.1 : 1 }
  }

  // 0-1 range (ratios, percentages)
  if (abs <= 1) return { min: 0, max: 1, step: 0.01 }

  // 1-100 range
  if (abs <= 100) return { min: 0, max: Math.ceil(originalValue * 3), step: 0.5 }

  // 100+ range
  return { min: 0, max: Math.ceil(originalValue * 2), step: 1 }
}

// ─── Props ──────────────────────────────────────────────────────────

interface ParameterPanelProps {
  parameters: ExtractedParameter[]
  onChange: (params: ExtractedParameter[]) => void
  disabled?: boolean
}

// ─── Component ──────────────────────────────────────────────────────

export function ParameterPanel({
  parameters,
  onChange,
  disabled,
}: ParameterPanelProps): React.ReactNode {
  const [collapsed, setCollapsed] = useState(false)
  const [localParams, setLocalParams] = useState(parameters)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync when parent parameters change (e.g., after code edit)
  useEffect(() => {
    setLocalParams(parameters)
  }, [parameters])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Use ref to capture latest params for debounced emission
  const latestParamsRef = useRef(localParams)

  const handleParamChange = useCallback(
    (name: string, value: number) => {
      // Functional setState to avoid stale closure on rapid successive changes
      setLocalParams((prev) => {
        const updated = prev.map((p) =>
          p.name === name ? { ...p, value } : p,
        )
        latestParamsRef.current = updated
        return updated
      })

      // Debounce — wait 300ms after last change before emitting
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onChange(latestParamsRef.current)
      }, 300)
    },
    [onChange],
  )

  const handleResetAll = useCallback(() => {
    const reset = localParams.map((p) => ({ ...p, value: p.originalValue }))
    setLocalParams(reset)
    latestParamsRef.current = reset
    onChange(reset)
  }, [localParams, onChange])

  if (parameters.length === 0) return null

  const hasChanges = localParams.some(
    (p) => Math.abs(p.value - p.originalValue) > 0.001,
  )

  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="w-full flex items-center justify-between p-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Parameters ({parameters.length})
        </span>
        {hasChanges && !collapsed && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={(e) => {
              e.stopPropagation()
              handleResetAll()
            }}
            disabled={disabled}
          >
            <RotateCcw className="h-2.5 w-2.5" /> Reset All
          </Button>
        )}
      </button>
      {!collapsed && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {localParams.map((param) => {
            const { min, max, step } = computeRange(param.originalValue)
            const unit = extractUnit(param)
            // Visual warning when value is at extreme range (#19)
            const range = max - min
            const pct = range > 0 ? (param.value - min) / range : 0.5
            const isExtreme = pct < 0.05 || pct > 0.95

            return (
              <div key={param.name} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono text-muted-foreground">
                    {param.label || param.name.replace(/_/g, " ")}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={param.value}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (!isNaN(v)) handleParamChange(param.name, v)
                      }}
                      disabled={disabled}
                      min={min}
                      max={max}
                      step={step}
                      className={cn(
                        "w-20 h-6 text-[10px] font-mono text-right border rounded px-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange disabled:opacity-50",
                        isExtreme && "border-status-warning",
                      )}
                    />
                    {unit && (
                      <span className="text-[10px] text-muted-foreground font-mono w-6">{unit}</span>
                    )}
                  </div>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={param.value}
                  onChange={(e) => handleParamChange(param.name, parseFloat(e.target.value))}
                  disabled={disabled}
                  className="w-full h-1.5 accent-international-orange cursor-pointer disabled:opacity-50"
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
