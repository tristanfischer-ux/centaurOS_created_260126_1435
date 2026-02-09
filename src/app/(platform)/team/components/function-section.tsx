'use client'

/**
 * FunctionSection — wraps marketplace candidates for a single business function.
 *
 * @description Renders a coloured status pill with function label, then children below.
 * Used in the list view marketplace section to group candidates by function.
 */

import { STATUS_COLORS } from '../constants'
import type { CoverageStatus } from '../types'

interface FunctionSectionProps {
  /** Display label for the function (e.g. "Marketing") */
  label: string
  /** Coverage status determines the colour */
  status: CoverageStatus
  children: React.ReactNode
}

export function FunctionSection({ label, status, children }: FunctionSectionProps) {
  const sc = STATUS_COLORS[status]

  return (
    <div className="mb-2 py-1">
      {/* Status pill */}
      <div
        className="inline-flex items-center gap-2 px-3 py-1 rounded-lg mb-2.5"
        style={{
          background: sc.fill,
          border: `1.5px solid ${sc.border}`,
        }}
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ background: sc.arc }}
        />
        <span
          className="text-[11px] font-extrabold tracking-wide"
          style={{ color: sc.text }}
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}
