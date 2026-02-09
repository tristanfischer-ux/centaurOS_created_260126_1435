'use client'

/**
 * OrbitSVG — pure React SVG rendering of the company orbital diagram.
 *
 * @description Renders concentric rings for functions, executives, apprentices,
 * and marketplace candidates using polar coordinate math. No D3 dependency.
 * viewBox is 0 0 840 840.
 *
 * @param props.selected - Currently selected function id (or null)
 * @param props.onSelect - Callback when a function slice is clicked
 */

import { useState, useMemo } from 'react'
import {
  CX, CY, GAP_DEG, SLICE_DEG,
  FUNC_R1, FUNC_R2, EXEC_R, APPR_R,
  BOUNDARY_R, MKT_R, OUTER_R,
  STATUS_COLORS,
  getCoverageStatus,
} from '../constants'
import type {
  FunctionId, TeamMember, MarketplaceCandidate,
  StatusColorSet, SliceData, BusinessFunction, FunctionCoverage,
} from '../types'

// ═══════════════════════════════════════════════════════════════════════════════
// GEOMETRY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function polar(r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

function arcD(r: number, s: number, e: number): string {
  const p1 = polar(r, s)
  const p2 = polar(r, e)
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${p2.x} ${p2.y}`
}

function bandD(r1: number, r2: number, s: number, e: number): string {
  const a = polar(r1, s)
  const b = polar(r1, e)
  const c = polar(r2, e)
  const d = polar(r2, s)
  const lg = e - s > 180 ? 1 : 0
  return `M ${a.x} ${a.y} A ${r1} ${r1} 0 ${lg} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${r2} ${r2} 0 ${lg} 0 ${d.x} ${d.y} Z`
}

function spreadPos(
  r: number,
  midDeg: number,
  count: number,
  maxSp: number
): { x: number; y: number }[] {
  if (!count) return []
  if (count === 1) return [polar(r, midDeg)]
  const sp = Math.min(maxSp, (SLICE_DEG - 8) / count)
  return Array.from({ length: count }, (_, i) =>
    polar(r, midDeg + (i - (count - 1) / 2) * sp)
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROLE-BASED SVG COLOURS (matches UserAvatar orange hierarchy)
// ═══════════════════════════════════════════════════════════════════════════════

const SVG_ROLE_COLORS: Record<string, { bg: string; text: string; stroke: string }> = {
  FOUNDER:    { bg: '#FFEDD5', text: '#C2410C', stroke: '#F97316' },
  EXECUTIVE:  { bg: '#FFF7ED', text: '#EA580C', stroke: '#FB923C' },
  APPRENTICE: { bg: '#F1F5F9', text: '#64748B', stroke: '#94A3B8' },
}

function getRoleSvgColors(role: string) {
  return SVG_ROLE_COLORS[role] || SVG_ROLE_COLORS.APPRENTICE
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLOT COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface OSlotProps {
  x: number
  y: number
  r: number
  person: TeamMember | null
  isEmpty: boolean
  isFounder: boolean
  sc: StatusColorSet
  onClick: () => void
}

function OSlot({ x, y, r, person, isEmpty, isFounder, sc, onClick }: OSlotProps) {
  const [isHovered, setIsHovered] = useState(false)

  // ── Filled slot: pure SVG circle with role-based colors ────
  if (person) {
    const rc = getRoleSvgColors(person.role)
    return (
      <g
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ cursor: 'pointer' }}
      >
        {/* White background ring */}
        <circle cx={x} cy={y} r={r + 3} fill="white" />

        {/* Role-colored circle */}
        <circle
          cx={x} cy={y} r={r}
          fill={rc.bg} stroke={rc.stroke}
          strokeWidth={isHovered ? 3 : 2.2}
          style={{
            transition: 'all .15s',
            filter: isHovered ? `drop-shadow(0 2px 8px ${rc.stroke}44)` : 'none',
          }}
        />

        {/* Initials text */}
        <text
          x={x} y={y + 1}
          textAnchor="middle" dominantBaseline="central"
          fill={rc.text}
          fontSize={r > 16 ? 12 : 9}
          fontWeight="800"
        >
          {person.initials}
        </text>

        {/* Tooltip on hover */}
        {isHovered && (
          <g>
            <rect x={x - 52} y={y - r - 30} width={104} height={24} rx={7} fill="#1E293B" />
            <text
              x={x} y={y - r - 15}
              textAnchor="middle" dominantBaseline="central"
              fill="white" fontSize="10" fontWeight="600"
            >
              {person.name}
            </text>
          </g>
        )}
      </g>
    )
  }

  // ── Founder-covering placeholder (dashed "YOU" circle) ─────
  if (isFounder) {
    return (
      <g
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ cursor: 'pointer' }}
      >
        <circle cx={x} cy={y} r={r + 3} fill="white" />
        <circle
          cx={x} cy={y} r={r}
          fill={isHovered ? '#FFEDD5' : '#FFF7ED'}
          stroke="#F97316" strokeWidth="2" strokeDasharray="5 3"
        />
        <text
          x={x} y={y}
          textAnchor="middle" dominantBaseline="central"
          fill="#C2410C"
          fontSize={r > 16 ? 10 : 8}
          fontWeight="800"
        >
          YOU
        </text>
        {isHovered && (
          <g>
            <rect x={x - 44} y={y - r - 30} width={88} height={24} rx={7} fill="#1E293B" />
            <text
              x={x} y={y - r - 15}
              textAnchor="middle" dominantBaseline="central"
              fill="#F97316" fontSize="10" fontWeight="600"
            >
              Founder
            </text>
          </g>
        )}
      </g>
    )
  }

  // ── Empty slot (dashed "+") ────────────────────────────────
  return (
    <g
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      <circle cx={x} cy={y} r={r + 3} fill="white" />
      <circle
        cx={x} cy={y} r={r}
        fill={isHovered ? sc.fill : '#FAFBFD'}
        stroke={isHovered ? sc.border : '#D1D5DB'}
        strokeWidth="2" strokeDasharray="5 3"
      />
      <text
        x={x} y={y + 1}
        textAnchor="middle" dominantBaseline="central"
        fill={isHovered ? sc.arc : '#CBD5E1'}
        fontSize={r > 16 ? 20 : 15}
        fontWeight="300"
      >
        +
      </text>
    </g>
  )
}

// ─── Marketplace Slot ────────────────────────────────────────────────────────

interface OMktSlotProps {
  x: number
  y: number
  r: number
  person: MarketplaceCandidate
  onClick: () => void
}

function OMktSlot({ x, y, r, person, onClick }: OMktSlotProps) {
  const [isHovered, setIsHovered] = useState(false)
  const isExec = person.type === 'exec'

  return (
    <g
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      <circle cx={x} cy={y} r={r + 2.5} fill="white" />
      <circle
        cx={x} cy={y} r={r}
        fill={isHovered ? '#EEF2FF' : 'white'}
        stroke={isHovered ? '#818CF8' : isExec ? '#A5B4FC' : '#C7D2FE'}
        strokeWidth={isHovered ? 2.2 : 1.5}
        style={{ transition: 'all .15s' }}
      />
      <text
        x={x} y={y + 1}
        textAnchor="middle" dominantBaseline="central"
        fill={isHovered ? '#4F46E5' : isExec ? '#6366F1' : '#818CF8'}
        fontSize={r > 12 ? 9 : 7.5}
        fontWeight="700"
      >
        {person.initials}
      </text>
      {isHovered && (
        <g>
          <rect x={x - 60} y={y - r - 40} width={120} height={34} rx={7} fill="#1E293B" />
          <text
            x={x} y={y - r - 28}
            textAnchor="middle" dominantBaseline="central"
            fill="white" fontSize="9.5" fontWeight="700"
          >
            {person.name}
          </text>
          <text
            x={x} y={y - r - 14}
            textAnchor="middle" dominantBaseline="central"
            fill="#A5B4FC" fontSize="8.5" fontWeight="500"
          >
            {person.role} · ★{person.rating}
          </text>
        </g>
      )}
    </g>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SVG
// ═══════════════════════════════════════════════════════════════════════════════

interface OrbitSVGProps {
  selected: FunctionId | null
  onSelect: (id: FunctionId) => void
  /** The 7 business function definitions */
  functions: BusinessFunction[]
  /** Coverage data per function id */
  teamCoverage: Record<string, FunctionCoverage>
  /** Founders to show in center hub */
  founders: TeamMember[]
  /** All marketplace candidates */
  marketplaceCandidates: MarketplaceCandidate[]
}

export function OrbitSVG({
  selected,
  onSelect,
  functions,
  teamCoverage,
  founders,
  marketplaceCandidates,
}: OrbitSVGProps) {
  const [hoveredFn, setHoveredFn] = useState<string | null>(null)

  const sliceData: SliceData[] = useMemo(
    () =>
      functions.map((fn, i) => {
        const s0 = i * (SLICE_DEG + GAP_DEG)
        const s1 = s0 + SLICE_DEG
        const mid = (s0 + s1) / 2
        const comp = teamCoverage[fn.id] || { execs: [], apprentices: [], founderCovering: false }
        const status = getCoverageStatus(comp)
        return {
          fn,
          s0,
          s1,
          mid,
          comp,
          hasExec: comp.execs.length > 0,
          status,
          mktAll: marketplaceCandidates.filter((m) => m.forFunction === fn.id),
        }
      }),
    [functions, teamCoverage, marketplaceCandidates]
  )

  return (
    <svg viewBox="0 0 840 840" style={{ width: '100%', height: '100%' }}>
      <defs>
        <radialGradient id="cg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF" />
          <stop offset="100%" stopColor="#F8FAFC" />
        </radialGradient>
        <filter id="cs">
          <feDropShadow dx="0" dy="1" stdDeviation="5" floodColor="#000" floodOpacity=".08" />
        </filter>
      </defs>

      {/* Background rings */}
      <circle cx={CX} cy={CY} r={OUTER_R} fill="#F5F7FF" stroke="#E0E7FF" strokeWidth="1" />
      <circle cx={CX} cy={CY} r={BOUNDARY_R} fill="#FAFBFE" />
      <circle cx={CX} cy={CY} r={(EXEC_R + APPR_R) / 2 - 2} fill="#FEFEFE" />
      <circle cx={CX} cy={CY} r={(FUNC_R2 + EXEC_R) / 2} fill="white" />

      {/* Boundary dashed ring */}
      <circle cx={CX} cy={CY} r={BOUNDARY_R} fill="none" stroke="#6366F1" strokeWidth="3" strokeDasharray="8 4" opacity=".35" />
      <circle cx={CX} cy={CY} r={(EXEC_R + APPR_R) / 2 - 2} fill="none" stroke="#6366F1" strokeWidth="1.8" strokeDasharray="1 3" opacity=".22" />
      <circle cx={CX} cy={CY} r={(FUNC_R2 + EXEC_R) / 2} fill="none" stroke="#94A3B8" strokeWidth="1.2" strokeDasharray="2 4" opacity=".25" />

      {/* Ring labels */}
      <rect x={CX - 42} y={CY - EXEC_R - 2} width={84} height={14} rx={7} fill="white" opacity=".85" />
      <text x={CX} y={CY - EXEC_R + 8} textAnchor="middle" fill="#475569" fontSize="8.5" fontWeight="800" letterSpacing="2.5">EXECUTIVES</text>

      <rect x={CX - 46} y={CY - APPR_R - 2} width={92} height={14} rx={7} fill="white" opacity=".85" />
      <text x={CX} y={CY - APPR_R + 8} textAnchor="middle" fill="#475569" fontSize="8.5" fontWeight="800" letterSpacing="2.5">APPRENTICES</text>

      <rect x={CX - 46} y={CY - BOUNDARY_R - 18} width={92} height={14} rx={7} fill="#EEF2FF" opacity=".9" />
      <text x={CX} y={CY - BOUNDARY_R - 8} textAnchor="middle" fill="#4F46E5" fontSize="9" fontWeight="800" letterSpacing="3">MARKETPLACE</text>
      <text x={CX} y={CY - BOUNDARY_R + 16} textAnchor="middle" fill="#94A3B8" fontSize="7" fontWeight="700" letterSpacing="2">YOUR COMPANY</text>

      {/* ── Slices ──────────────────────────────────────────── */}
      {sliceData.map(({ fn, s0, s1, mid, comp, status, mktAll }) => {
        const isSel = selected === fn.id
        const isHov = hoveredFn === fn.id
        const active = isSel || isHov
        const sc = STATUS_COLORS[status]
        const funcMid = polar((FUNC_R1 + FUNC_R2) / 2, mid)

        const execPs = spreadPos(EXEC_R, mid, Math.max(comp.execs.length, 1), 14)
        const apprPs = spreadPos(APPR_R, mid, Math.max(comp.apprentices.length, 1), 11)
        const mktShow = mktAll.slice(0, 4)
        const mktPs = spreadPos(MKT_R, mid, mktShow.length, 10)

        return (
          <g key={fn.id}>
            {/* Wedge highlights */}
            <path d={bandD(FUNC_R2, BOUNDARY_R, s0, s1)} fill={active ? sc.fill : `${sc.fill}88`} opacity={active ? 0.45 : 0.15} />
            <path d={bandD(BOUNDARY_R, OUTER_R, s0, s1)} fill={active ? '#EEF2FF' : '#F5F7FF'} opacity={active ? 0.6 : 0.3} />

            {/* Function label band */}
            <path
              d={bandD(FUNC_R1, FUNC_R2, s0, s1)}
              fill={active ? sc.fillH : sc.fill}
              stroke={sc.arc}
              strokeWidth={isSel ? 2 : 1}
              onClick={() => onSelect(fn.id)}
              onMouseEnter={() => setHoveredFn(fn.id)}
              onMouseLeave={() => setHoveredFn(null)}
              style={{ cursor: 'pointer' }}
            />

            {/* Status arc */}
            <path
              d={arcD(FUNC_R1, s0, s1)}
              fill="none" stroke={sc.arc}
              strokeWidth={isSel ? 6 : active ? 5 : 4}
              strokeLinecap="round"
            />

            {/* Selected outer arc */}
            {isSel && (
              <path
                d={arcD(OUTER_R, s0, s1)}
                fill="none" stroke={sc.arc}
                strokeWidth="2.5" strokeLinecap="round" opacity=".3"
              />
            )}

            {/* Function short name */}
            <text
              x={funcMid.x} y={funcMid.y + 1}
              textAnchor="middle" dominantBaseline="central"
              fill={sc.text}
              fontSize="11.5" fontWeight="800" letterSpacing=".5"
              onClick={() => onSelect(fn.id)}
              onMouseEnter={() => setHoveredFn(fn.id)}
              onMouseLeave={() => setHoveredFn(null)}
              style={{ cursor: 'pointer', pointerEvents: 'all' }}
            >
              {fn.short}
            </text>

            {/* Connection lines: function → execs */}
            {execPs.map((ep, ei) => {
              const from = polar(FUNC_R2, mid)
              return (
                <line
                  key={`fe${ei}`}
                  x1={from.x} y1={from.y} x2={ep.x} y2={ep.y}
                  stroke={sc.conn} strokeWidth="1.5"
                  strokeDasharray={comp.execs[ei] || comp.founderCovering ? 'none' : '4 3'}
                  opacity=".5"
                />
              )
            })}

            {/* Connection lines: execs → apprentices */}
            {apprPs.map((ap, ai) => {
              const from = execPs[0] || polar(EXEC_R, mid)
              return (
                <line
                  key={`ea${ai}`}
                  x1={from.x} y1={from.y} x2={ap.x} y2={ap.y}
                  stroke={comp.apprentices[ai] ? '#C4B5FD' : '#E2E8F0'}
                  strokeWidth="1.2"
                  strokeDasharray={comp.apprentices[ai] ? 'none' : '3 3'}
                  opacity=".4"
                />
              )
            })}

            {/* Connection lines: marketplace → target slots */}
            {mktPs.map((mp, mi) => {
              const target =
                mktShow[mi].type === 'exec'
                  ? execPs[0] || polar(EXEC_R, mid)
                  : apprPs[0] || execPs[0] || polar(EXEC_R, mid)
              return (
                <line
                  key={`ml${mi}`}
                  x1={mp.x} y1={mp.y} x2={target.x} y2={target.y}
                  stroke="#C7D2FE" strokeWidth="1" strokeDasharray="3 4" opacity=".25"
                />
              )
            })}

            {/* Executive slots */}
            {execPs.map((ep, ei) => (
              <OSlot
                key={`e${ei}`}
                x={ep.x} y={ep.y} r={20}
                person={comp.execs[ei] || null}
                isEmpty={!comp.execs[ei] && !comp.founderCovering}
                isFounder={!comp.execs[ei] && comp.founderCovering && ei === 0}
                sc={sc}
                onClick={() => onSelect(fn.id)}
              />
            ))}

            {/* Apprentice slots */}
            {apprPs.map((ap, ai) => (
              <OSlot
                key={`a${ai}`}
                x={ap.x} y={ap.y} r={14}
                person={comp.apprentices[ai] || null}
                isEmpty={!comp.apprentices[ai]}
                isFounder={false}
                sc={sc}
                onClick={() => onSelect(fn.id)}
              />
            ))}

            {/* Marketplace slots */}
            {mktPs.map((mp, mi) => (
              <OMktSlot
                key={`m${mi}`}
                x={mp.x} y={mp.y} r={14}
                person={mktShow[mi]}
                onClick={() => onSelect(fn.id)}
              />
            ))}
          </g>
        )
      })}

      {/* ── Center Hub ──────────────────────────────────────── */}
      <circle cx={CX} cy={CY} r={66} fill="url(#cg)" stroke="#D1D5DB" strokeWidth="1.5" filter="url(#cs)" />
      <text x={CX} y={CY - 28} textAnchor="middle" fill="#94A3B8" fontSize="8" fontWeight="700" letterSpacing="2">
        FOUNDERS
      </text>

      {/* Founder avatars — pure SVG circles */}
      {founders.map((f, fi) => {
        const avatarR = 16
        const fg = 6
        const totalW = founders.length * avatarR * 2 + (founders.length - 1) * fg
        const fx = CX - totalW / 2 + fi * (avatarR * 2 + fg) + avatarR
        const fy = CY - 8
        const rc = SVG_ROLE_COLORS.FOUNDER
        return (
          <g key={f.id}>
            <circle cx={fx} cy={fy} r={avatarR + 2} fill="white" />
            <circle cx={fx} cy={fy} r={avatarR} fill={rc.bg} stroke={rc.stroke} strokeWidth="2" />
            <text
              x={fx} y={fy + 1}
              textAnchor="middle" dominantBaseline="central"
              fill={rc.text} fontSize="10" fontWeight="800"
            >
              {f.initials}
            </text>
          </g>
        )
      })}

      {/* Divider */}
      <line x1={CX - 38} y1={CY + 12} x2={CX + 38} y2={CY + 12} stroke="#E2E8F0" strokeWidth="1" />

      {/* Status chips */}
      {(() => {
        const c = { green: 0, yellow: 0, red: 0 }
        sliceData.forEach((s) => c[s.status]++)
        const chips = [
          { k: 'green', n: c.green, l: 'COVERED', sc: STATUS_COLORS.green },
          { k: 'yellow', n: c.yellow, l: 'YOU', sc: STATUS_COLORS.yellow },
          { k: 'red', n: c.red, l: 'GAPS', sc: STATUS_COLORS.red },
        ] as const
        const cw = 54
        const cg = 6
        const tw = 3 * cw + 2 * cg
        const sx = CX - tw / 2

        return chips.map((ch, ci) => {
          const cx2 = sx + ci * (cw + cg) + cw / 2
          const cy2 = CY + 24
          return (
            <g key={ch.k}>
              <rect
                x={cx2 - cw / 2} y={cy2 - 11}
                width={cw} height={22} rx={11}
                fill={ch.sc.fill} stroke={ch.sc.border} strokeWidth="1.5"
              />
              <circle cx={cx2 - 15} cy={cy2} r={4} fill={ch.sc.arc} />
              <text
                x={cx2 + 3} y={cy2 + 1}
                textAnchor="middle" dominantBaseline="central"
                fill={ch.sc.text} fontSize="11" fontWeight="800"
              >
                {ch.n}
              </text>
              <text
                x={cx2} y={cy2 + 22}
                textAnchor="middle"
                fill={ch.sc.text} fontSize="7" fontWeight="700" letterSpacing=".5" opacity=".7"
              >
                {ch.l}
              </text>
            </g>
          )
        })
      })()}
    </svg>
  )
}
