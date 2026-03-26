'use client'

/**
 * @file StrategyRiver.tsx
 *
 * @description Sankey-style river visualization for strategic objectives.
 * Each strategic objective is rendered as a "river" flowing left-to-right along
 * a shared global timeline. Milestones appear as confluence points where the river
 * widens, and tasks are shown as tributary streams that merge into the river at
 * each milestone. Status is colour-coded: green (done), orange (in progress),
 * grey (not started).
 *
 * @related
 * - Adapter: src/lib/canvas/strategy-river-adapter.ts
 * - Shell: src/app/(platform)/canvas/canvas-shell.tsx
 * - Types: src/types/canvas.ts
 */

import { useState, useMemo, useRef, useCallback, useEffect, type FC } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RiverTask {
  id: string
  title: string
  /** ISO date "YYYY-MM-DD" */
  start: string
  /** ISO date "YYYY-MM-DD" */
  end: string
  status: 'done' | 'in_progress' | 'not_started'
  /** 2-char initials e.g. "TF" */
  assignee: string
  /** User role for avatar coloring (Founder, Executive, Apprentice, AI_Agent) */
  assigneeRole?: string | null
}

export interface RiverObjective {
  id: string
  title: string
  /** ISO date */
  dueDate: string
  tasks: RiverTask[]
}

export interface RiverStrategicObjective {
  id: string
  title: string
  /** hex e.g. "#F97316" */
  color: string
  /** ISO date */
  startDate: string
  /** ISO date */
  targetDate: string
  objectives: RiverObjective[]
}

interface StrategyRiverProps {
  /** Strategic objectives with their milestones and tasks, from the adapter */
  strategicObjectives: RiverStrategicObjective[]
  /** Optional override for "today" (useful for testing) */
  today?: Date
  /** Called when a task bar/label is clicked */
  onTaskClick?: (taskId: string) => void
  /** Called when a milestone node is clicked */
  onMilestoneClick?: (milestoneId: string) => void
  /** Called when a strategic goal title/node is clicked */
  onGoalClick?: (goalId: string) => void
  /** Called when the "+" button on a river lane is clicked */
  onAddToRiver?: (strategicObjectiveId: string) => void
  /** Externally controlled set of expanded objective IDs (overrides internal state) */
  expandedObjectiveIds?: Set<string>
  /** Called when expansion should change (when controlled externally) */
  onExpandToggle?: (objectiveId: string) => void
  /** Called to expand every milestone across all strategic objectives */
  onExpandAll?: () => void
  /** Called to collapse every milestone across all strategic objectives */
  onCollapseAll?: () => void
  /** Called when a task is dragged to new dates (start, end as ISO strings) */
  onTaskDateChange?: (taskId: string, newStart: string, newEnd: string) => void
  /** Called when a milestone is dragged to a new due date (ISO string) */
  onMilestoneDateChange?: (milestoneId: string, newDueDate: string) => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FONT = "'Inter', system-ui, -apple-system, sans-serif"

const STATUS_MAP = {
  done:         { color: '#059669', solid: '#34D399', bg: '#ECFDF5', label: 'Done' },
  in_progress:  { color: '#EA580C', solid: '#FB923C', bg: '#FFF7ED', label: 'In Progress' },
  not_started:  { color: '#94A3B8', solid: '#CBD5E1', bg: '#F8FAFC', label: 'Not Started' },
} as const

// Role-based avatar colors matching UserAvatar component (no borders/rings)
const ROLE_AVATAR_COLORS: Record<string, { bg: string; text: string }> = {
  Founder:    { bg: '#FED7AA', text: '#C2410C' },   // orange-200, orange-700
  Executive:  { bg: '#FFF7ED', text: '#EA580C' },   // orange-50, orange-600
  Apprentice: { bg: '#F1F5F9', text: '#64748B' },   // slate-100, slate-500
  AI_Agent:   { bg: '#F3E8FF', text: '#9333EA' },   // purple-100, purple-600
  default:    { bg: '#F1F5F9', text: '#64748B' },   // slate-100, slate-500
}

function getAvatarColors(role: string | null | undefined): { bg: string; text: string } {
  if (!role) return ROLE_AVATAR_COLORS.default
  return ROLE_AVATAR_COLORS[role] ?? ROLE_AVATAR_COLORS.default
}

const BAND_W = 8
const LANE_GAP = 34
const PAD_L = 190
const PAD_R = 80
const SVG_W = 1200

/**
 * Truncate text to a max character count, appending ellipsis if needed.
 * Uses approximate character widths per font-size to avoid SVG overflow.
 */
function truncText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 1).trimEnd() + '…'
}

/** Minimum drag distance (in SVG units) before a drag is recognized */
const DRAG_THRESHOLD = 4

// ─── Drag state types ────────────────────────────────────────────────────────

interface DragState {
  type: 'task' | 'milestone'
  id: string
  /** SVG X at drag start */
  startSvgX: number
  /** Current SVG X during drag */
  currentSvgX: number
  /** Original start date (tasks only) */
  originalStart?: string
  /** Original end date (tasks/milestones) */
  originalEnd: string
  /** Duration in days (tasks only — preserved during drag) */
  durationDays?: number
  /** Whether drag threshold has been exceeded */
  isDragging: boolean
}

// ─── Geometry ────────────────────────────────────────────────────────────────

const daysBetween = (a: string, b: string): number => (new Date(b).getTime() - new Date(a).getTime()) / 864e5
const dateToX = (d: string, s: string, e: string, x0: number, x1: number): number => {
  const span = daysBetween(s, e)
  // Guard: if start === end, place everything at the midpoint
  if (span === 0) return (x0 + x1) / 2
  return x0 + (daysBetween(s, d) / span) * (x1 - x0)
}
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/**
 * Inverse of dateToX — converts an SVG X coordinate back to an ISO date string.
 *
 * @param x - SVG X coordinate
 * @param globalStart - Timeline start date (ISO)
 * @param globalEnd - Timeline end date (ISO)
 * @param x0 - Left pixel bound
 * @param x1 - Right pixel bound
 * @returns ISO date string (YYYY-MM-DD)
 */
function xToDate(x: number, globalStart: string, globalEnd: string, x0: number, x1: number): string {
  const span = daysBetween(globalStart, globalEnd)
  if (span === 0) return globalStart
  const fraction = (x - x0) / (x1 - x0)
  const days = Math.round(fraction * span)
  const base = new Date(globalStart)
  base.setDate(base.getDate() + days)
  return base.toISOString().slice(0, 10)
}

function tributaryPath(endX: number, taskY: number, confX: number, slotY: number): string {
  const dx = confX - endX, dy = slotY - taskY
  return `M${endX} ${taskY} C${endX + dx * 0.93} ${taskY},${confX} ${taskY + dy * 0.93},${confX} ${slotY}`
}

function riverSegPath(x1: number, y: number, w1: number, x2: number, w2: number): string {
  const h1 = w1 / 2, h2 = w2 / 2, cx = (x1 + x2) / 2
  return `M${x1} ${y - h1}C${cx} ${y - h1},${cx} ${y - h2},${x2} ${y - h2}` +
    `L${x2} ${y + h2}C${cx} ${y + h2},${cx} ${y + h1},${x1} ${y + h1}Z`
}

// ─── Component ───────────────────────────────────────────────────────────────

const StrategyRiver: FC<StrategyRiverProps> = ({ strategicObjectives, today, onTaskClick, onMilestoneClick, onGoalClick, onAddToRiver, expandedObjectiveIds, onExpandToggle, onExpandAll, onCollapseAll, onTaskDateChange, onMilestoneDateChange }) => {
  const NOW = today ?? new Date()

  // Per-milestone expansion — controlled externally or managed internally
  const isControlled = expandedObjectiveIds !== undefined
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(() => {
    if (strategicObjectives.length > 0) {
      return new Set(strategicObjectives[0].objectives.map((o) => o.id))
    }
    return new Set()
  })
  const expandedMilestones = isControlled ? expandedObjectiveIds : internalExpanded
  const setExpandedMilestones = isControlled
    ? () => {} // No-op: parent controls via onExpandToggle
    : setInternalExpanded

  const [hovTask, setHovTask] = useState<string | null>(null)
  const [hovObj, setHovObj] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileHintDismissed, setMobileHintDismissed] = useState(false)
  const dragRef = useRef<{ x: number; startPan: number } | null>(null)

  // INTENT: On mobile, the 1200px-wide SVG scales down to ~3x smaller than intended,
  // making labels unreadable. Auto-set zoom to 2x so users start at a usable scale
  // and can pan to see the full timeline.
  useEffect(() => {
    const mobile = window.innerWidth < 640
    setIsMobile(mobile)
    if (mobile) {
      setZoom(2)
      setPan(0)
    }
  }, [])

  // ── Drag-to-reschedule state ──
  // Use both state (for re-renders) and ref (for event handlers to avoid stale closures)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const x0 = PAD_L, x1 = SVG_W - PAD_R

  // ── Global timeline bounds (enforce minimum span so items don't collapse to one X) ──
  const { globalStart, globalEnd } = useMemo(() => {
    const todayISO = NOW.toISOString().slice(0, 10)
    if (strategicObjectives.length === 0) return { globalStart: todayISO, globalEnd: todayISO }

    const allDates: string[] = [
      ...strategicObjectives.map((s) => s.startDate),
      ...strategicObjectives.map((s) => s.targetDate),
      ...strategicObjectives.flatMap((so) => so.objectives.map((o) => o.dueDate)),
      ...strategicObjectives.flatMap((so) => so.objectives.flatMap((o) => o.tasks.map((t) => t.start))),
      ...strategicObjectives.flatMap((so) => so.objectives.flatMap((o) => o.tasks.map((t) => t.end))),
    ].filter(Boolean)
    const times = allDates.map((d) => new Date(d).getTime())
    const minT = Math.min(...times)
    const maxT = Math.max(...times)
    const start = new Date(minT).toISOString().slice(0, 10)
    let end = new Date(maxT).toISOString().slice(0, 10)

    const MIN_TIMELINE_DAYS = 30
    if (daysBetween(start, end) < MIN_TIMELINE_DAYS) {
      const d = new Date(start)
      d.setDate(d.getDate() + MIN_TIMELINE_DAYS)
      end = d.toISOString().slice(0, 10)
    }
    return { globalStart: start, globalEnd: end }
  }, [strategicObjectives, NOW])

  const tx = (d: string): number => dateToX(d, globalStart, globalEnd, x0, x1)
  const nowX = clamp(tx(NOW.toISOString().slice(0, 10)), x0, x1)

  // ── Month ticks ──
  const months = useMemo(() => {
    const ticks: { x: number; label: string }[] = []
    const sd = new Date(globalStart)
    let d = new Date(sd.getFullYear(), sd.getMonth(), 1)
    const ed = new Date(globalEnd)
    while (d <= ed) {
      ticks.push({
        x: tx(d.toISOString().slice(0, 10)),
        label: d.toLocaleString('en-GB', { month: 'short' }),
      })
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    }
    return ticks
  }, [globalStart, globalEnd])

  // ── Layout computation (per-milestone expansion) ──
  const layout = useMemo(() => {
    let curY = 40
    return strategicObjectives.map((so) => {
      const sX = tx(so.startDate), eX = tx(so.targetDate)

      let rw = 8
      const objs = so.objectives.map((obj, i) => {
        rw += 2 + obj.tasks.length * 1.5
        const isExpanded = expandedMilestones.has(obj.id)
        return { ...obj, side: (i % 2 === 0 ? 'above' : 'below') as 'above' | 'below', cx: tx(obj.dueDate), rw, isExpanded }
      })

      let maxA = 0, maxB = 0
      const tasks: Array<RiverTask & {
        objId: string; side: 'above' | 'below'; si: number; n: number;
        cx: number; rw: number; sx: number; ex: number;
      }> = []

      // Only include tasks for individually expanded milestones
      objs.forEach((obj) => {
        if (!obj.isExpanded) return
        const sorted = [...obj.tasks].sort((a, b) => new Date(a.end).getTime() - new Date(b.end).getTime())
        const n = sorted.length
        if (obj.side === 'above') maxA = Math.max(maxA, n)
        else maxB = Math.max(maxB, n)
        sorted.forEach((t, i) => tasks.push({
          ...t, objId: obj.id, side: obj.side, si: i, n,
          cx: obj.cx, rw: obj.rw, sx: tx(t.start), ex: tx(t.end),
        }))
      })

      // Space only expands on the side that actually has expanded tasks
      const aH = maxA > 0 ? maxA * LANE_GAP + 52 : 0
      const bH = maxB > 0 ? maxB * LANE_GAP + 52 : 0
      const mL = 80
      const topP = aH + mL, botP = bH + mL
      const lH = topP + botP + 10
      const ry = curY + topP

      const tPos = tasks.map((t) => {
        const dist = t.n - t.si
        return { ...t, y: t.side === 'above' ? ry - 44 - dist * LANE_GAP : ry + 44 + dist * LANE_GAP }
      })

      // River width segments
      const rParts: { x1: number; x2: number; w1: number; w2: number }[] = []
      let px = sX, pw = 8
      objs.forEach((obj) => {
        const nw = pw + 2 + obj.tasks.length * 1.5
        rParts.push({ x1: px, x2: obj.cx, w1: pw, w2: nw })
        px = obj.cx; pw = nw
      })
      rParts.push({ x1: px, x2: eX, w1: pw, w2: pw + 2 })

      // Split at NOW
      const bef: typeof rParts = [], aft: typeof rParts = []
      rParts.forEach((s) => {
        if (s.x2 <= nowX) bef.push(s)
        else if (s.x1 >= nowX) aft.push(s)
        else {
          const f = (nowX - s.x1) / (s.x2 - s.x1)
          const mw = s.w1 + f * (s.w2 - s.w1)
          bef.push({ ...s, x2: nowX, w2: mw })
          aft.push({ ...s, x1: nowX, w1: mw })
        }
      })

      const result = { so, sX, eX, objs, tPos, ry, lH, bef, aft, yOff: curY }
      curY += lH + 24
      return result
    })
  }, [expandedMilestones, strategicObjectives])

  const totalH = layout.length > 0
    ? layout[layout.length - 1].yOff + layout[layout.length - 1].lH + 40
    : 300

  // ── Stats ──
  const totalTasks = strategicObjectives.reduce((s, so) =>
    s + so.objectives.reduce((a, o) => a + o.tasks.length, 0), 0)
  const doneTasks = strategicObjectives.reduce((s, so) =>
    s + so.objectives.reduce((a, o) => a + o.tasks.filter((t) => t.status === 'done').length, 0), 0)
  const ipTasks = strategicObjectives.reduce((s, so) =>
    s + so.objectives.reduce((a, o) => a + o.tasks.filter((t) => t.status === 'in_progress').length, 0), 0)

  // Are all milestones currently expanded?
  const allMilestoneIds = strategicObjectives.flatMap((so) => so.objectives.map((o) => o.id))
  const allExpanded = allMilestoneIds.length > 0 && allMilestoneIds.every((id) => expandedMilestones.has(id))

  const vbW = SVG_W / zoom

  // ── Drag-to-pan ──
  const onMD = (e: React.MouseEvent): void => {
    // Don't start pan if an item drag is active
    if (dragStateRef.current) return
    if (zoom > 1) dragRef.current = { x: e.clientX, startPan: pan }
  }
  const onMM = (e: React.MouseEvent): void => {
    if (!dragRef.current || dragStateRef.current) return
    setPan(clamp(dragRef.current.startPan + (dragRef.current.x - e.clientX) / zoom, -200, 800))
  }
  const onMU = (): void => { dragRef.current = null }

  // ── Client → SVG coordinate conversion ──
  const clientToSvgX = useCallback((clientX: number): number => {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    // Account for viewBox transform: viewBox starts at `pan`, width is `vbW`
    const fraction = (clientX - rect.left) / rect.width
    return pan + fraction * (SVG_W / zoom)
  }, [pan, zoom])

  // ── Drag start (called from task bar or milestone node mousedown) ──
  const handleDragStart = useCallback((
    e: React.MouseEvent,
    type: 'task' | 'milestone',
    id: string,
    originalStart: string | undefined,
    originalEnd: string,
    durationDays?: number,
  ): void => {
    // Only left mouse button
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const svgX = clientToSvgX(e.clientX)
    const newState: DragState = {
      type,
      id,
      startSvgX: svgX,
      currentSvgX: svgX,
      originalStart,
      originalEnd,
      durationDays,
      isDragging: false,
    }
    dragStateRef.current = newState
    setDragState(newState)
  }, [clientToSvgX])

  // ── Drag move (runs on wrapper div mousemove when dragging) ──
  // Uses ref to avoid stale closure issues with useCallback
  const handleDragMove = useCallback((e: React.MouseEvent): void => {
    const ds = dragStateRef.current
    if (!ds) return
    const svgX = clientToSvgX(e.clientX)
    const delta = Math.abs(svgX - ds.startSvgX)
    const updated: DragState = {
      ...ds,
      currentSvgX: svgX,
      isDragging: ds.isDragging || delta > DRAG_THRESHOLD,
    }
    dragStateRef.current = updated
    setDragState(updated)
  }, [clientToSvgX])

  // ── Drag end (commit the date change) ──
  const handleDragEnd = useCallback((): void => {
    const ds = dragStateRef.current
    if (!ds || !ds.isDragging) {
      dragStateRef.current = null
      setDragState(null)
      return
    }

    const deltaX = ds.currentSvgX - ds.startSvgX
    if (Math.abs(deltaX) < DRAG_THRESHOLD) {
      dragStateRef.current = null
      setDragState(null)
      return
    }

    if (ds.type === 'task' && onTaskDateChange && ds.originalStart) {
      // Shift both start and end by the same delta
      const origStartX = dateToX(ds.originalStart, globalStart, globalEnd, x0, x1)
      const origEndX = dateToX(ds.originalEnd, globalStart, globalEnd, x0, x1)
      const newStartX = clamp(origStartX + deltaX, x0, x1)
      const newEndX = clamp(origEndX + deltaX, x0, x1)
      const newStart = xToDate(newStartX, globalStart, globalEnd, x0, x1)
      const newEnd = xToDate(newEndX, globalStart, globalEnd, x0, x1)
      if (newStart !== ds.originalStart || newEnd !== ds.originalEnd) {
        onTaskDateChange(ds.id, newStart, newEnd)
      }
    } else if (ds.type === 'milestone' && onMilestoneDateChange) {
      const origX = dateToX(ds.originalEnd, globalStart, globalEnd, x0, x1)
      const newX = clamp(origX + deltaX, x0, x1)
      const newDate = xToDate(newX, globalStart, globalEnd, x0, x1)
      if (newDate !== ds.originalEnd) {
        onMilestoneDateChange(ds.id, newDate)
      }
    }

    dragStateRef.current = null
    setDragState(null)
  }, [onTaskDateChange, onMilestoneDateChange, globalStart, globalEnd, x0, x1])

  // Toggle ALL milestones within an SO
  const toggleExpand = (soId: string): void => {
    if (isControlled && onExpandToggle) {
      onExpandToggle(soId)
      return
    }
    const so = strategicObjectives.find((s) => s.id === soId)
    if (!so) return
    const msIds = so.objectives.map((o) => o.id)
    setInternalExpanded((prev) => {
      const next = new Set(prev)
      const anyExpanded = msIds.some((id) => next.has(id))
      if (anyExpanded) {
        msIds.forEach((id) => next.delete(id))
      } else {
        msIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  // Toggle a single milestone (clicking a milestone node on the river)
  const toggleMilestone = (milestoneId: string): void => {
    if (isControlled && onExpandToggle) {
      onExpandToggle(milestoneId)
      return
    }
    setInternalExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(milestoneId)) next.delete(milestoneId); else next.add(milestoneId)
      return next
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // ── Unified mouse move: handles both pan and item drag ──
  const handleMouseMove = (e: React.MouseEvent): void => {
    if (dragStateRef.current) {
      handleDragMove(e)
    } else {
      onMM(e)
    }
  }

  const handleMouseUp = (): void => {
    if (dragStateRef.current) {
      handleDragEnd()
    }
    onMU()
  }

  return (
    <div
      style={{ background: '#F8FAFC', fontFamily: FONT, position: 'relative' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Floating controls (top-right corner of the river) */}
      <div style={{
        position: 'absolute', top: 8, right: 12, zIndex: 10,
        display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 4,
        justifyContent: 'flex-end',
        maxWidth: 'calc(100% - 24px)',
      }}>
        {/* Expand / Collapse All toggle */}
        {(onExpandAll || onCollapseAll) && (
          <button
            onClick={allExpanded ? onCollapseAll : onExpandAll}
            title={allExpanded ? 'Collapse all milestones' : 'Expand all milestones'}
            style={{
              minHeight: 44, borderRadius: 7, border: '1px solid #E2E8F0',
              background: 'white', cursor: 'pointer', fontSize: 10, fontWeight: 700,
              color: '#64748B', display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: FONT, padding: '0 12px',
              boxShadow: '0 1px 3px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04)',
              whiteSpace: 'nowrap' as const,
            }}
          >
            <span style={{ fontSize: 12 }}>{allExpanded ? '▾' : '▸'}</span>
            {allExpanded ? 'Collapse' : 'Expand'}
          </button>
        )}

        {/* Zoom controls */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          background: 'white', borderRadius: 8, padding: '3px 4px',
          boxShadow: '0 1px 3px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04)',
        }}>
          <ZoomBtn onClick={() => setPan((p) => Math.max(p - 80, -200))}>◀</ZoomBtn>
          <ZoomBtn onClick={() => setZoom((z) => { const n = Math.max(z - 0.25, 0.5); if (n <= 1) setPan(0); return n })}>−</ZoomBtn>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B', minWidth: 28, textAlign: 'center' as const }}>
            {Math.round(zoom * 100)}%
          </span>
          <ZoomBtn onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}>+</ZoomBtn>
          <ZoomBtn onClick={() => setPan((p) => Math.min(p + 80, 800))}>▶</ZoomBtn>
          {zoom !== 1 && (
            <ZoomBtn onClick={() => { setZoom(1); setPan(0) }} style={{ fontSize: 8, width: 'auto', padding: '0 6px' }}>
              Reset
            </ZoomBtn>
          )}
        </div>
      </div>

      {/* Mobile hint: nudge users to use zoom/pan controls */}
      {isMobile && !mobileHintDismissed && (
        <div
          style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10, background: '#1E293B', color: 'white', borderRadius: 10,
            padding: '8px 16px', fontSize: 12, fontFamily: FONT, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,.15)',
            whiteSpace: 'nowrap' as const,
          }}
        >
          <span>Pinch or use controls to zoom &amp; pan</span>
          <button
            onClick={() => setMobileHintDismissed(true)}
            style={{
              background: 'transparent', border: 'none', color: '#94A3B8',
              cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '0 2px',
              lineHeight: 1,
            }}
            aria-label="Dismiss hint"
          >
            ×
          </button>
        </div>
      )}

      {/* SVG Canvas */}
      <div style={{ padding: '0 12px 40px', cursor: dragState?.isDragging ? 'grabbing' : (zoom > 1 ? 'grab' : 'default') }} onMouseDown={onMD}>
        <svg
          ref={svgRef}
          viewBox={`${pan} 0 ${vbW} ${totalH}`}
          style={{ width: '100%', height: totalH, display: 'block' }}
        >
          <defs>
            <filter id="strategy-ds">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity=".06" />
            </filter>
            {strategicObjectives.map((so) => [
              <linearGradient key={`rg-${so.id}`} id={`rg-${so.id}`} x1="0%" x2="100%">
                <stop offset="0%" stopColor={so.color} stopOpacity=".85" />
                <stop offset="100%" stopColor={so.color} stopOpacity=".6" />
              </linearGradient>,
              <linearGradient key={`rd-${so.id}`} id={`rd-${so.id}`} x1="0%" x2="100%">
                <stop offset="0%" stopColor={so.color} stopOpacity=".18" />
                <stop offset="100%" stopColor={so.color} stopOpacity=".1" />
              </linearGradient>,
            ])}
          </defs>

          {/* Month grid */}
          {months.map((m, i) => (
            <g key={i}>
              <line x1={m.x} y1={0} x2={m.x} y2={totalH} stroke="#CBD5E1" strokeWidth="1" strokeDasharray="4 4" opacity=".7" />
              <text x={m.x} y={16} textAnchor="middle" fill="#64748B" fontSize="11" fontFamily={FONT} fontWeight="700">{m.label}</text>
            </g>
          ))}

          {/* NOW marker */}
          <line x1={nowX} y1={0} x2={nowX} y2={totalH} stroke="#F97316" strokeWidth="1.5" strokeDasharray="5 4" opacity=".35" />
          <rect x={nowX - 16} y={4} width={32} height={16} rx={8} fill="#F97316" />
          <text x={nowX} y={13} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="7" fontFamily={FONT} fontWeight="800" letterSpacing=".5">NOW</text>

          {/* ═══ LANES ═══ */}
          {layout.map((lane, laneIdx) => {
            const { so, sX, eX, objs, tPos, ry, bef, aft } = lane
            const soTotal = so.objectives.reduce((s, o) => s + o.tasks.length, 0)
            const soDone = so.objectives.reduce((s, o) => s + o.tasks.filter((t) => t.status === 'done').length, 0)
            const pct = soTotal > 0 ? Math.round((soDone / soTotal) * 100) : 0

            // DECISION: Collision avoidance for milestone + endpoint labels.
            // Collect all label X positions, sort, and compute extra vertical nudge
            // when adjacent labels are closer than MIN_LABEL_DIST pixels.
            const MIN_LABEL_DIST = 80
            const labelItems: Array<{ cx: number; id: string }> = objs.map((o) => ({ cx: o.cx, id: o.id }))
            labelItems.push({ cx: eX, id: '__end__' })
            labelItems.sort((a, b) => a.cx - b.cx)
            const labelNudge = new Map<string, number>()
            for (let i = 1; i < labelItems.length; i++) {
              if (Math.abs(labelItems[i].cx - labelItems[i - 1].cx) < MIN_LABEL_DIST) {
                const prevNudge = labelNudge.get(labelItems[i - 1].id) ?? 0
                labelNudge.set(labelItems[i].id, prevNudge + 24)
              }
            }

            return (
              <g key={so.id}>
                {laneIdx > 0 && (
                  <line x1={10} y1={lane.yOff - 12} x2={SVG_W - 10} y2={lane.yOff - 12}
                    stroke="#E5E7EB" strokeWidth="1" strokeDasharray="4 4" opacity=".5" />
                )}

                {/* Tributaries — only for expanded milestones */}
                {objs.filter((obj) => obj.isExpanded).map((obj) => {
                  const objTasks = tPos.filter((t) => t.objId === obj.id).sort((a, b) => a.si - b.si)
                  const n = objTasks.length
                  const rH = obj.rw / 2
                  const slotCY = (t: (typeof objTasks)[0]): number => t.side === 'above'
                    ? (ry - rH) - n * BAND_W + t.si * BAND_W + BAND_W / 2
                    : (ry + rH) + (n - 1 - t.si) * BAND_W + BAND_W / 2

                  return (
                    <g key={obj.id}>
                      <defs>
                        <clipPath id={`clip-${obj.id}`}>
                          <rect x="0" y="0" width={SVG_W} height={ry - rH} />
                          <rect x="0" y={ry + rH} width={SVG_W} height={totalH} />
                        </clipPath>
                      </defs>
                      <g opacity="0.12" clipPath={`url(#clip-${obj.id})`} pointerEvents="none">
                        {objTasks.map((t) => (
                          <g key={t.id}>
                            <path d={tributaryPath(t.ex, t.y, obj.cx, slotCY(t))} fill="none" stroke={so.color} strokeWidth={BAND_W} />
                            <line x1={t.sx} y1={t.y} x2={t.ex} y2={t.y} stroke={so.color} strokeWidth={BAND_W} strokeLinecap="round" />
                          </g>
                        ))}
                      </g>

                      {/* Task bars + labels */}
                      {objTasks.map((t) => {
                        const st = STATUS_MAP[t.status]
                        const isBeingDragged = dragState?.isDragging && dragState.type === 'task' && dragState.id === t.id
                        const isH = hovTask === t.id || isBeingDragged
                        const above = t.side === 'above'
                        const avatarC = getAvatarColors(t.assigneeRole)
                        const canDrag = !!onTaskDateChange

                        // Compute visual offset if this task is being dragged
                        const dragDeltaX = isBeingDragged ? (dragState.currentSvgX - dragState.startSvgX) : 0
                        const visSx = t.sx + dragDeltaX
                        const visEx = t.ex + dragDeltaX

                        // Show projected dates during drag
                        const projStart = isBeingDragged ? xToDate(clamp(visSx, x0, x1), globalStart, globalEnd, x0, x1) : t.start
                        const projEnd = isBeingDragged ? xToDate(clamp(visEx, x0, x1), globalStart, globalEnd, x0, x1) : t.end

                        return (
                          <g
                            key={`${t.id}-ui`}
                            tabIndex={0}
                            role="button"
                            aria-label={`Task: ${t.title} — ${st.label}`}
                            onMouseEnter={() => { if (!dragState) setHovTask(t.id) }}
                            onMouseLeave={() => { if (!dragState) setHovTask(null) }}
                            onClick={() => { if (!dragState?.isDragging) onTaskClick?.(t.id) }}
                            onMouseDown={canDrag ? (e) => {
                              const dur = daysBetween(t.start, t.end)
                              handleDragStart(e, 'task', t.id, t.start, t.end, dur)
                            } : undefined}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTaskClick?.(t.id) } }}
                            style={{ cursor: canDrag ? (isBeingDragged ? 'grabbing' : 'grab') : 'pointer' }}
                          >
                            {/* Invisible hit area rect covering the full task region including label */}
                            <rect
                              x={visSx - 15}
                              y={t.y - 18}
                              width={visEx - visSx + 30}
                              height={36}
                              fill="transparent"
                              pointerEvents="all"
                            />
                            {/* Task bar */}
                            <line x1={visSx} y1={t.y} x2={visEx} y2={t.y} stroke={st.solid} strokeWidth={BAND_W - 1} strokeLinecap="round" opacity={isBeingDragged ? 0.85 : (isH ? 0.65 : 0.4)} />
                            {/* Assignee avatar */}
                            <circle cx={visSx - 13} cy={t.y} r={7} fill={avatarC.bg} />
                            <text x={visSx - 13} y={t.y + 0.5} textAnchor="middle" dominantBaseline="central" fill={avatarC.text} fontSize="5.5" fontFamily={FONT} fontWeight="800">{t.assignee}</text>
                            {/* Task title */}
                            <text x={visSx + 6} y={t.y + (above ? -9 : 13)} fill={isH ? '#0F172A' : '#64748B'} fontSize="8.5" fontFamily={FONT} fontWeight={isH ? '700' : '600'}>
                              <title>{t.title}</title>{truncText(t.title, 42)}
                            </text>
                            {/* Tooltip — shows projected dates during drag */}
                            {isH && (
                              <g>
                                <rect x={visSx - 10} y={t.y + (above ? -36 : 20)} width={170} height={22} rx={6} fill={isBeingDragged ? '#F97316' : '#1E293B'} filter="url(#strategy-ds)" />
                                <text x={visSx} y={t.y + (above ? -23 : 33)} fill="white" fontSize="8" fontFamily={FONT} fontWeight="600">
                                  {isBeingDragged ? '→ ' : ''}{new Date(projStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} → {new Date(projEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {st.label}
                                </text>
                              </g>
                            )}
                            {/* Drag indicator lines during active drag */}
                            {isBeingDragged && (
                              <>
                                <line x1={visSx} y1={t.y - 14} x2={visSx} y2={t.y + 14} stroke="#F97316" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
                                <line x1={visEx} y1={t.y - 14} x2={visEx} y2={t.y + 14} stroke="#F97316" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
                              </>
                            )}
                          </g>
                        )
                      })}
                    </g>
                  )
                })}

                {/* River — pointer-events: none so clicks pass through to tasks underneath */}
                {aft.map((s, i) => <path key={`aft-${i}`} d={riverSegPath(s.x1, ry, s.w1, s.x2, s.w2)} fill={`url(#rd-${so.id})`} pointerEvents="none" />)}
                {bef.map((s, i) => <path key={`bef-${i}`} d={riverSegPath(s.x1, ry, s.w1, s.x2, s.w2)} fill={`url(#rg-${so.id})`} pointerEvents="none" />)}

                {/* Milestones — with collision avoidance for labels */}
                {objs.map((obj) => {
                  const isMsDragged = dragState?.isDragging && dragState.type === 'milestone' && dragState.id === obj.id
                  const isH = hovObj === obj.id || isMsDragged
                  const past = new Date(obj.dueDate) <= NOW
                  const td = obj.tasks.filter((t) => t.status === 'done').length
                  const tp = obj.tasks.length > 0 ? Math.round((td / obj.tasks.length) * 100) : 0
                  const dir = obj.side === 'above' ? 1 : -1
                  const rH = obj.rw / 2
                  const msNudge = labelNudge.get(obj.id) ?? 0
                  const gap = Math.max(rH + 20, 26) + msNudge
                  const canDragMs = !!onMilestoneDateChange

                  // Visual position during drag
                  const msDragDelta = isMsDragged ? (dragState.currentSvgX - dragState.startSvgX) : 0
                  const visCx = obj.cx + msDragDelta
                  const projDate = isMsDragged ? xToDate(clamp(visCx, x0, x1), globalStart, globalEnd, x0, x1) : obj.dueDate

                  return (
                    <g
                      key={obj.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Milestone: ${obj.title} — ${tp}% complete, ${obj.tasks.length} tasks`}
                      onMouseEnter={() => { if (!dragState) setHovObj(obj.id) }}
                      onMouseLeave={() => { if (!dragState) setHovObj(null) }}
                      onClick={() => { if (!dragState?.isDragging) toggleMilestone(obj.id) }}
                      onMouseDown={canDragMs ? (e) => {
                        handleDragStart(e, 'milestone', obj.id, undefined, obj.dueDate)
                      } : undefined}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMilestone(obj.id) } }}
                      style={{ cursor: canDragMs ? (isMsDragged ? 'grabbing' : 'grab') : 'pointer' }}
                    >
                      {/* Invisible hit area for milestone */}
                      <rect
                        x={visCx - 25}
                        y={ry - 25}
                        width={50}
                        height={50}
                        fill="transparent"
                        pointerEvents="all"
                      />
                      {past && <circle cx={visCx} cy={ry} r={18} fill={so.color} opacity=".07" />}
                      <circle cx={visCx} cy={ry} r={isH ? 13 : 10} fill={obj.isExpanded ? so.color : 'white'} stroke={so.color} strokeWidth={past ? 3 : 2} filter="url(#strategy-ds)" />
                      <circle cx={visCx} cy={ry} r={past ? 4 : 2} fill={obj.isExpanded ? 'white' : (past ? so.color : '#CBD5E1')} />
                      {/* Milestone title — clickable for details */}
                      <text
                        x={visCx} y={ry + dir * gap} textAnchor="middle"
                        fill={isMsDragged ? '#F97316' : (isH ? '#0F172A' : '#475569')} fontSize="10" fontFamily={FONT} fontWeight="800"
                        style={{ cursor: 'pointer', textDecoration: isH ? 'underline' : 'none' }}
                        onClick={(e) => { e.stopPropagation(); if (!dragState?.isDragging) onMilestoneClick?.(obj.id) }}
                        role="link"
                        aria-label={`View details for milestone: ${obj.title}`}
                      ><title>{obj.title}</title>{truncText(obj.title, 28)}</text>
                      {/* Date + progress label */}
                      <text x={visCx} y={ry + dir * (gap + 12)} textAnchor="middle" fill={isMsDragged ? '#F97316' : '#94A3B8'} fontSize="8.5" fontFamily={FONT} fontWeight="600">
                        {isMsDragged ? '→ ' : ''}{new Date(projDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {tp}% · {obj.tasks.length} tasks
                      </text>
                      {/* Vertical snap line during drag */}
                      {isMsDragged && (
                        <line x1={visCx} y1={ry - 30} x2={visCx} y2={ry + 30} stroke="#F97316" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.5" />
                      )}
                    </g>
                  )
                })}

                {/* Start node */}
                <circle cx={sX} cy={ry} r={6} fill="white" stroke={so.color} strokeWidth="2" filter="url(#strategy-ds)" />
                <circle cx={sX} cy={ry} r={2} fill={so.color} />

                {/* End target */}
                <circle cx={eX} cy={ry} r={12} fill={so.color + '08'} stroke={so.color} strokeWidth="2" />
                <circle cx={eX} cy={ry} r={7} fill="white" stroke={so.color} strokeWidth="1.5" filter="url(#strategy-ds)" />
                <text x={eX} y={ry + 1} textAnchor="middle" dominantBaseline="central" fill={so.color} fontSize="8" fontFamily={FONT} fontWeight="900">◆</text>
                {(() => {
                  const endNudge = labelNudge.get('__end__') ?? 0
                  return (
                    <g tabIndex={0} role="button" aria-label={`Strategic goal: ${so.title}`} onClick={() => onGoalClick?.(so.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGoalClick?.(so.id) } }} style={{ cursor: 'pointer' }}>
                      <text x={eX} y={ry - 18 - endNudge} textAnchor="middle" fill="#0F172A" fontSize="10" fontFamily={FONT} fontWeight="800"><title>{so.title}</title>{truncText(so.title, 28)}</text>
                      <text x={eX} y={ry + 22 + endNudge} textAnchor="middle" fill={so.color} fontSize="9" fontFamily={FONT} fontWeight="700">
                        {new Date(so.targetDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </text>
                    </g>
                  )
                })()}

                {/* SO title (left column) — click toggles expand/collapse of all milestones in this SO */}
                <g tabIndex={0} role="button" aria-label={`Toggle milestones for ${so.title}`} onClick={() => toggleExpand(so.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(so.id) } }} style={{ cursor: 'pointer' }}>
                  <title>{so.title}</title>
                  <text x={14} y={ry - 5} fill="#0F172A" fontSize="12" fontFamily={FONT} fontWeight="800">{truncText(so.title, 22)}</text>
                  <text x={14} y={ry + 9} fill={so.color} fontSize="10" fontFamily={FONT} fontWeight="700">
                    {pct}% · {new Date(so.targetDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                  </text>
                </g>

                {/* Add-to-river "+" button next to SO label */}
                {onAddToRiver && (
                  <foreignObject x={PAD_L - 30} y={ry - 10} width={20} height={20}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAddToRiver(so.id) }}
                      title={`Add milestone to ${so.title}`}
                      style={{
                        width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${so.color}40`,
                        background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                        color: so.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: FONT, lineHeight: 1, padding: 0, transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = so.color + '12'; e.currentTarget.style.borderColor = so.color }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = so.color + '40' }}
                    >+</button>
                  </foreignObject>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export default StrategyRiver

/**
 * Computes task status counts from river data.
 *
 * @description Used by the parent shell to render status badges
 * in the tab bar without duplicating the toolbar inside the river.
 *
 * @param data - Array of river strategic objectives
 * @returns Object with done, inProgress, and notStarted counts
 */
export function computeRiverStats(data: RiverStrategicObjective[]): { done: number; inProgress: number; notStarted: number } {
  let done = 0, inProgress = 0, total = 0
  for (const so of data) {
    for (const obj of so.objectives) {
      for (const t of obj.tasks) {
        total++
        if (t.status === 'done') done++
        else if (t.status === 'in_progress') inProgress++
      }
    }
  }
  return { done, inProgress, notStarted: total - done - inProgress }
}

// ─── Zoom button ─────────────────────────────────────────────────────────────

function ZoomBtn({ onClick, children, style = {} }: { onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return (
    <button onClick={onClick} style={{
      minWidth: 44, minHeight: 44, borderRadius: 7, border: '1px solid #E2E8F0',
      background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700,
      color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT, lineHeight: 1, padding: 0, ...style,
    }}>{children}</button>
  )
}
