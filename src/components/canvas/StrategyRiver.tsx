'use client'

/**
 * @file StrategyRiver.tsx
 *
 * @description Sankey-style river visualization for strategic objectives.
 * Replaces the previous Strategy Flow (Sankey) and Strategic Timeline (ReactFlow)
 * views with a single, pure-SVG component. Zero external dependencies beyond React.
 *
 * Each strategic objective is rendered as a "river" flowing left-to-right along
 * a shared global timeline. Milestones appear as confluence points where the river
 * widens, and tasks are shown as tributary streams that merge into the river at
 * each milestone. Status is colour-coded: green (done), orange (in progress),
 * grey (not started).
 *
 * @features
 * - Shared global timeline with month grid and NOW marker
 * - Expand/collapse per strategic objective
 * - Zoom (50%–400%) and drag-to-pan
 * - Hover tooltips on tasks (date range + status)
 * - Milestone circles with completion % and task count
 * - River width grows at each confluence point
 * - ClipPath rendering to prevent tributary overlap
 *
 * @related
 * - Adapter: src/lib/canvas/strategy-river-adapter.ts
 * - Shell: src/app/(platform)/canvas/canvas-shell.tsx
 * - Types: src/types/canvas.ts
 */

import { useState, useMemo, useRef, type FC } from 'react'

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
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Use the app's Inter font stack for all SVG text */
const FONT = 'var(--font-inter), system-ui, -apple-system, sans-serif'

const STATUS_MAP = {
  done: { color: '#059669', solid: '#34D399', bg: '#ECFDF5', label: 'Done' },
  in_progress: { color: '#EA580C', solid: '#FB923C', bg: '#FFF7ED', label: 'In Progress' },
  not_started: { color: '#94A3B8', solid: '#CBD5E1', bg: '#F8FAFC', label: 'Not Started' },
} as const

const BAND_W = 8
const LANE_GAP = 34
const PAD_L = 170
const PAD_R = 80
const SVG_W = 1200

// ─── Geometry helpers ────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 864e5
}

function dateToX(d: string, s: string, e: string, x0: number, x1: number): number {
  return x0 + (daysBetween(s, d) / daysBetween(s, e)) * (x1 - x0)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function tributaryPath(endX: number, taskY: number, confX: number, slotY: number): string {
  const dx = confX - endX
  const dy = slotY - taskY
  return `M${endX} ${taskY} C${endX + dx * 0.93} ${taskY},${confX} ${taskY + dy * 0.93},${confX} ${slotY}`
}

function riverSegPath(x1: number, y: number, w1: number, x2: number, w2: number): string {
  const h1 = w1 / 2
  const h2 = w2 / 2
  const cx = (x1 + x2) / 2
  return (
    `M${x1} ${y - h1}C${cx} ${y - h1},${cx} ${y - h2},${x2} ${y - h2}` +
    `L${x2} ${y + h2}C${cx} ${y + h2},${cx} ${y + h1},${x1} ${y + h1}Z`
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * StrategyRiver — Sankey-style strategic objective timeline.
 *
 * @description Renders all strategic objectives on a shared horizontal timeline
 * as flowing "rivers" with milestone confluence points and task tributaries.
 * Pure SVG rendering with no external chart library dependencies.
 *
 * @param props.strategicObjectives - Array of strategic objectives from the adapter
 * @param props.today - Optional date override for the NOW marker
 */
const StrategyRiver: FC<StrategyRiverProps> = ({ strategicObjectives, today }) => {
  const NOW = today ?? new Date()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(strategicObjectives.length > 0 ? [strategicObjectives[0].id] : [])
  )
  const [hovTask, setHovTask] = useState<string | null>(null)
  const [hovObj, setHovObj] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState(0)
  const dragRef = useRef<{ x: number; startPan: number } | null>(null)

  const x0 = PAD_L
  const x1 = SVG_W - PAD_R

  // ── Global timeline bounds ──
  const globalStart = useMemo(() => {
    const dates = strategicObjectives.map((s) => new Date(s.startDate).getTime())
    return new Date(Math.min(...dates)).toISOString().slice(0, 10)
  }, [strategicObjectives])

  const globalEnd = useMemo(() => {
    const dates = strategicObjectives.map((s) => new Date(s.targetDate).getTime())
    return new Date(Math.max(...dates)).toISOString().slice(0, 10)
  }, [strategicObjectives])

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

  // ── Layout computation ──
  const layout = useMemo(() => {
    let curY = 40
    return strategicObjectives.map((so) => {
      const expanded = expandedIds.has(so.id)
      const sX = tx(so.startDate)
      const eX = tx(so.targetDate)

      let rw = 8
      const objs = so.objectives.map((obj, i) => {
        rw += 2 + obj.tasks.length * 1.5
        return { ...obj, side: (i % 2 === 0 ? 'above' : 'below') as 'above' | 'below', cx: tx(obj.dueDate), rw }
      })

      let maxA = 0
      let maxB = 0
      const tasks: Array<
        RiverTask & {
          objId: string
          side: 'above' | 'below'
          si: number
          n: number
          cx: number
          rw: number
          sx: number
          ex: number
        }
      > = []

      if (expanded) {
        objs.forEach((obj) => {
          const sorted = [...obj.tasks].sort((a, b) => new Date(a.end).getTime() - new Date(b.end).getTime())
          const n = sorted.length
          if (obj.side === 'above') maxA = Math.max(maxA, n)
          else maxB = Math.max(maxB, n)
          sorted.forEach((t, i) =>
            tasks.push({
              ...t,
              objId: obj.id,
              side: obj.side,
              si: i,
              n,
              cx: obj.cx,
              rw: obj.rw,
              sx: tx(t.start),
              ex: tx(t.end),
            })
          )
        })
      }

      const aH = expanded ? maxA * LANE_GAP + 52 : 0
      const bH = expanded ? maxB * LANE_GAP + 52 : 0
      const mL = 64
      const topP = aH + mL
      const botP = bH + mL
      const lH = topP + botP + 10
      const ry = curY + topP

      const tPos = tasks.map((t) => {
        const dist = t.n - t.si
        return {
          ...t,
          y: t.side === 'above' ? ry - 44 - dist * LANE_GAP : ry + 44 + dist * LANE_GAP,
        }
      })

      // River width segments
      const rParts: { x1: number; x2: number; w1: number; w2: number }[] = []
      let px = sX
      let pw = 8
      objs.forEach((obj) => {
        const nw = pw + 2 + obj.tasks.length * 1.5
        rParts.push({ x1: px, x2: obj.cx, w1: pw, w2: nw })
        px = obj.cx
        pw = nw
      })
      rParts.push({ x1: px, x2: eX, w1: pw, w2: pw + 2 })

      // Split at NOW
      const bef: typeof rParts = []
      const aft: typeof rParts = []
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

      const result = { so, expanded, sX, eX, objs, tPos, ry, lH, bef, aft, yOff: curY }
      curY += lH + 24
      return result
    })
  }, [expandedIds, strategicObjectives])

  const totalH = layout.length > 0 ? layout[layout.length - 1].yOff + layout[layout.length - 1].lH + 40 : 300

  // ── Stats ──
  const totalTasks = strategicObjectives.reduce(
    (s, so) => s + so.objectives.reduce((a, o) => a + o.tasks.length, 0),
    0
  )
  const doneTasks = strategicObjectives.reduce(
    (s, so) => s + so.objectives.reduce((a, o) => a + o.tasks.filter((t) => t.status === 'done').length, 0),
    0
  )
  const ipTasks = strategicObjectives.reduce(
    (s, so) => s + so.objectives.reduce((a, o) => a + o.tasks.filter((t) => t.status === 'in_progress').length, 0),
    0
  )

  const vbW = SVG_W / zoom

  // ── Drag-to-pan ──
  const onMD = (e: React.MouseEvent): void => {
    if (zoom > 1) dragRef.current = { x: e.clientX, startPan: pan }
  }
  const onMM = (e: React.MouseEvent): void => {
    if (!dragRef.current) return
    setPan(clamp(dragRef.current.startPan + (dragRef.current.x - e.clientX) / zoom, -200, 800))
  }
  const onMU = (): void => {
    dragRef.current = null
  }

  const toggleExpand = (id: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-muted/30 font-sans" onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3.5 bg-background border-b">
        {/* Stats row */}
        <div className="flex items-center gap-3 mb-2.5 flex-wrap">
          <span className="text-[11px] font-bold py-1 px-3 rounded-full bg-status-success-light text-status-success">
            ✓ {doneTasks} done
          </span>
          <span className="text-[11px] font-bold py-1 px-3 rounded-full bg-status-warning-light text-status-warning">
            ⚡ {ipTasks} in progress
          </span>
          <span className="text-[11px] font-bold py-1 px-3 rounded-full bg-muted text-muted-foreground">
            ○ {totalTasks - doneTasks - ipTasks} not started
          </span>

          {/* Zoom controls */}
          <div className="ml-auto flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            <ZoomBtn onClick={() => setPan((p) => Math.max(p - 80, -200))}>◀</ZoomBtn>
            <ZoomBtn
              onClick={() =>
                setZoom((z) => {
                  const n = Math.max(z - 0.25, 0.5)
                  if (n <= 1) setPan(0)
                  return n
                })
              }
            >
              −
            </ZoomBtn>
            <span className="text-[10px] font-bold text-muted-foreground min-w-[32px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <ZoomBtn onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}>+</ZoomBtn>
            <ZoomBtn onClick={() => setPan((p) => Math.min(p + 80, 800))}>▶</ZoomBtn>
            {zoom !== 1 && (
              <ZoomBtn
                onClick={() => {
                  setZoom(1)
                  setPan(0)
                }}
                style={{ fontSize: 8, width: 'auto', padding: '0 6px' }}
              >
                Reset
              </ZoomBtn>
            )}
          </div>
        </div>

        {/* SO toggle buttons */}
        <div className="flex gap-2 flex-wrap">
          {strategicObjectives.map((so) => {
            const isExp = expandedIds.has(so.id)
            return (
              <button
                key={so.id}
                onClick={() => toggleExpand(so.id)}
                className="flex items-center gap-1.5 py-1.5 px-3.5 rounded-[10px] cursor-pointer text-xs font-bold text-foreground transition-colors"
                style={{
                  border: `2px solid ${so.color}${isExp ? '40' : '18'}`,
                  background: isExp ? so.color + '08' : 'white',
                }}
              >
                <div className="w-[7px] h-[7px] rounded-full" style={{ background: so.color }} />
                {so.title}
                <span
                  className="text-[11px] text-muted-foreground transition-transform duration-200"
                  style={{ transform: isExp ? 'rotate(180deg)' : 'none' }}
                >
                  ▾
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="px-5 pb-10" style={{ cursor: zoom > 1 ? 'grab' : 'default' }} onMouseDown={onMD}>
        <svg viewBox={`${pan} 0 ${vbW} ${totalH}`} style={{ width: '100%', height: totalH, display: 'block' }}>
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
              <text x={m.x} y={16} textAnchor="middle" fill="#64748B" fontSize="11" fontFamily={FONT} fontWeight="700">
                {m.label}
              </text>
            </g>
          ))}

          {/* NOW marker */}
          <line x1={nowX} y1={0} x2={nowX} y2={totalH} stroke="#F97316" strokeWidth="1.5" strokeDasharray="5 4" opacity=".35" />
          <rect x={nowX - 16} y={4} width={32} height={16} rx={8} fill="#F97316" />
          <text
            x={nowX}
            y={13}
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontSize="7"
            fontFamily={FONT}
            fontWeight="800"
            letterSpacing=".5"
          >
            NOW
          </text>

          {/* ═══ LANES ═══ */}
          {layout.map((lane, laneIdx) => {
            const { so, expanded, sX, eX, objs, tPos, ry, bef, aft } = lane
            const soTotal = so.objectives.reduce((s, o) => s + o.tasks.length, 0)
            const soDone = so.objectives.reduce((s, o) => s + o.tasks.filter((t) => t.status === 'done').length, 0)
            const pct = soTotal > 0 ? Math.round((soDone / soTotal) * 100) : 0

            return (
              <g key={so.id}>
                {laneIdx > 0 && (
                  <line
                    x1={10}
                    y1={lane.yOff - 12}
                    x2={SVG_W - 10}
                    y2={lane.yOff - 12}
                    stroke="#E5E7EB"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    opacity=".5"
                  />
                )}

                {/* Tributaries (expanded tasks) */}
                {expanded &&
                  objs.map((obj) => {
                    const objTasks = tPos.filter((t) => t.objId === obj.id).sort((a, b) => a.si - b.si)
                    const n = objTasks.length
                    const rH = obj.rw / 2
                    const slotCY = (t: (typeof objTasks)[0]): number =>
                      t.side === 'above'
                        ? ry - rH - n * BAND_W + t.si * BAND_W + BAND_W / 2
                        : ry + rH + (n - 1 - t.si) * BAND_W + BAND_W / 2

                    return (
                      <g key={obj.id}>
                        <defs>
                          <clipPath id={`clip-${obj.id}`}>
                            <rect x="0" y="0" width={SVG_W} height={ry - rH} />
                            <rect x="0" y={ry + rH} width={SVG_W} height={totalH} />
                          </clipPath>
                        </defs>
                        <g opacity="0.12" clipPath={`url(#clip-${obj.id})`}>
                          {objTasks.map((t) => (
                            <g key={t.id}>
                              <path
                                d={tributaryPath(t.ex, t.y, obj.cx, slotCY(t))}
                                fill="none"
                                stroke={so.color}
                                strokeWidth={BAND_W}
                              />
                              <line
                                x1={t.sx}
                                y1={t.y}
                                x2={t.ex}
                                y2={t.y}
                                stroke={so.color}
                                strokeWidth={BAND_W}
                                strokeLinecap="round"
                              />
                            </g>
                          ))}
                        </g>

                        {/* Task bars + labels */}
                        {objTasks.map((t) => {
                          const st = STATUS_MAP[t.status]
                          const isH = hovTask === t.id
                          const above = t.side === 'above'
                          return (
                            <g
                              key={`${t.id}-ui`}
                              onMouseEnter={() => setHovTask(t.id)}
                              onMouseLeave={() => setHovTask(null)}
                              style={{ cursor: 'pointer' }}
                            >
                              <line
                                x1={t.sx}
                                y1={t.y}
                                x2={t.ex}
                                y2={t.y}
                                stroke={st.solid}
                                strokeWidth={BAND_W - 1}
                                strokeLinecap="round"
                                opacity={isH ? 0.65 : 0.4}
                              />
                              <line x1={t.sx} y1={t.y} x2={t.ex} y2={t.y} stroke="transparent" strokeWidth={BAND_W + 10} />
                              <circle cx={t.sx - 13} cy={t.y} r={7} fill={st.bg} stroke={st.color} strokeWidth={1.2} />
                              <text
                                x={t.sx - 13}
                                y={t.y + 0.5}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fill={st.color}
                                fontSize="5.5"
                                fontFamily={FONT}
                                fontWeight="800"
                              >
                                {t.assignee}
                              </text>
                              <text
                                x={t.sx + 6}
                                y={t.y + (above ? -9 : 13)}
                                fill={isH ? '#0F172A' : '#64748B'}
                                fontSize="8.5"
                                fontFamily={FONT}
                                fontWeight={isH ? '700' : '600'}
                              >
                                {t.title}
                              </text>
                              {isH && (
                                <g>
                                  <rect
                                    x={t.sx - 10}
                                    y={t.y + (above ? -36 : 20)}
                                    width={170}
                                    height={22}
                                    rx={6}
                                    fill="#1E293B"
                                    filter="url(#strategy-ds)"
                                  />
                                  <text
                                    x={t.sx}
                                    y={t.y + (above ? -23 : 33)}
                                    fill="#E2E8F0"
                                    fontSize="8"
                                    fontFamily={FONT}
                                    fontWeight="600"
                                  >
                                    {new Date(t.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} →{' '}
                                    {new Date(t.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {st.label}
                                  </text>
                                </g>
                              )}
                            </g>
                          )
                        })}
                      </g>
                    )
                  })}

                {/* River (future segments) */}
                {aft.map((s, i) => (
                  <path key={`aft-${i}`} d={riverSegPath(s.x1, ry, s.w1, s.x2, s.w2)} fill={`url(#rd-${so.id})`} />
                ))}
                {/* River (past segments) */}
                {bef.map((s, i) => (
                  <path key={`bef-${i}`} d={riverSegPath(s.x1, ry, s.w1, s.x2, s.w2)} fill={`url(#rg-${so.id})`} />
                ))}

                {/* Milestones */}
                {objs.map((obj) => {
                  const isH = hovObj === obj.id
                  const past = new Date(obj.dueDate) <= NOW
                  const td = obj.tasks.filter((t) => t.status === 'done').length
                  const tp = Math.round((td / obj.tasks.length) * 100)
                  const dir = obj.side === 'above' ? 1 : -1
                  const rH = obj.rw / 2
                  const gap = Math.max(rH + 20, 26)
                  return (
                    <g
                      key={obj.id}
                      onMouseEnter={() => setHovObj(obj.id)}
                      onMouseLeave={() => setHovObj(null)}
                      style={{ cursor: 'pointer' }}
                    >
                      {past && <circle cx={obj.cx} cy={ry} r={18} fill={so.color} opacity=".07" />}
                      <circle
                        cx={obj.cx}
                        cy={ry}
                        r={isH ? 13 : 10}
                        fill="white"
                        stroke={so.color}
                        strokeWidth={past ? 3 : 2}
                        filter="url(#strategy-ds)"
                      />
                      <circle cx={obj.cx} cy={ry} r={past ? 4 : 2} fill={past ? so.color : '#CBD5E1'} />
                      <text
                        x={obj.cx}
                        y={ry + dir * gap}
                        textAnchor="middle"
                        fill={isH ? '#0F172A' : '#475569'}
                        fontSize="10"
                        fontFamily={FONT}
                        fontWeight="800"
                      >
                        {obj.title}
                      </text>
                      <text
                        x={obj.cx}
                        y={ry + dir * (gap + 12)}
                        textAnchor="middle"
                        fill="#94A3B8"
                        fontSize="8.5"
                        fontFamily={FONT}
                        fontWeight="600"
                      >
                        {new Date(obj.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {tp}% ·{' '}
                        {obj.tasks.length} tasks
                      </text>
                    </g>
                  )
                })}

                {/* Start node */}
                <circle cx={sX} cy={ry} r={6} fill="white" stroke={so.color} strokeWidth="2" filter="url(#strategy-ds)" />
                <circle cx={sX} cy={ry} r={2} fill={so.color} />

                {/* End target */}
                <circle cx={eX} cy={ry} r={12} fill={so.color + '08'} stroke={so.color} strokeWidth="2" />
                <circle cx={eX} cy={ry} r={7} fill="white" stroke={so.color} strokeWidth="1.5" filter="url(#strategy-ds)" />
                <text
                  x={eX}
                  y={ry + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={so.color}
                  fontSize="8"
                  fontFamily={FONT}
                  fontWeight="900"
                >
                  ◆
                </text>
                <text x={eX} y={ry - 18} textAnchor="middle" fill="#0F172A" fontSize="10" fontFamily={FONT} fontWeight="800">
                  {so.title}
                </text>
                <text x={eX} y={ry + 22} textAnchor="middle" fill={so.color} fontSize="9" fontFamily={FONT} fontWeight="700">
                  {new Date(so.targetDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </text>

                {/* SO title (left column) */}
                <text x={14} y={ry - 5} fill="#0F172A" fontSize="12" fontFamily={FONT} fontWeight="800">
                  {so.title}
                </text>
                <text x={14} y={ry + 9} fill={so.color} fontSize="10" fontFamily={FONT} fontWeight="700">
                  {pct}% ·{' '}
                  {new Date(so.targetDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export default StrategyRiver

// ─── Zoom button ─────────────────────────────────────────────────────────────

function ZoomBtn({
  onClick,
  children,
  style = {},
}: {
  onClick: () => void
  children: React.ReactNode
  style?: React.CSSProperties
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="w-[26px] h-[26px] rounded-[7px] border bg-background cursor-pointer text-[13px] font-bold text-muted-foreground flex items-center justify-center font-sans leading-none p-0"
      style={style}
    >
      {children}
    </button>
  )
}
