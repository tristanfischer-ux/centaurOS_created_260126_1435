'use client'

/**
 * GapAlert — displays a coverage alert for a business function that is yellow or red.
 *
 * @description Shows a visual alert indicating either "Founder covering — consider delegating"
 * (yellow) or "No coverage — critical gap" (red).
 */

import { STATUS_COLORS } from '../constants'
import type { CoverageStatus } from '../types'

interface GapAlertProps {
  /** Display name of the business function */
  functionName: string
  /** Coverage status — yellow (founder covering) or red (gap) */
  status: 'yellow' | 'red'
}

export function GapAlert({ functionName, status }: GapAlertProps) {
  const isYellow = status === 'yellow'
  const sc = STATUS_COLORS[status]

  return (
    <div
      className="flex items-center gap-3 rounded-xl p-3.5"
      style={{ background: sc.fill, border: `2px solid ${sc.border}` }}
    >
      {/* Status icon */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0"
        style={{
          background: sc.fillH,
          border: `2px ${isYellow ? 'dashed' : 'solid'} ${sc.arc}`,
          color: sc.text,
        }}
      >
        {isYellow ? 'YOU' : '!'}
      </div>

      {/* Copy */}
      <div>
        <div className="text-sm font-bold" style={{ color: sc.text }}>
          {functionName}
        </div>
        <div className="text-xs text-muted-foreground">
          {isYellow
            ? 'Founder covering — consider delegating'
            : 'No coverage — critical gap'}
        </div>
      </div>
    </div>
  )
}
