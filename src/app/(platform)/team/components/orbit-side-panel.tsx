'use client'

/**
 * OrbitSidePanel — detail panel on the right side of the orbital view.
 *
 * @description When no function is selected, shows legend + description.
 * When a function is selected, shows executives, apprentices, and
 * marketplace candidates for that function.
 *
 * @param props.selected - Currently selected function id (or null)
 */

import {
  FUNCTIONS, TEAM_COVERAGE, MARKETPLACE_CANDIDATES,
  STATUS_COLORS, getCoverageStatus,
} from '../constants'
import type { FunctionId, CoverageStatus } from '../types'

interface OrbitSidePanelProps {
  selected: FunctionId | null
}

const STATUS_LABELS: Record<CoverageStatus, string> = {
  green: 'Covered',
  yellow: 'Founder Covering',
  red: 'Gap',
}

export function OrbitSidePanel({ selected }: OrbitSidePanelProps) {
  // ── Default state (nothing selected) ───────────────────────
  if (!selected) {
    return (
      <div className="p-8">
        <div className="text-[22px] font-extrabold text-foreground mb-2">
          Company Orbit
        </div>
        <div className="text-[13px] text-muted-foreground leading-relaxed mb-6">
          Click any function segment to see team details and marketplace
          candidates.
        </div>
        {([
          { sc: STATUS_COLORS.green, label: 'Covered', desc: 'Executive(s) assigned' },
          { sc: STATUS_COLORS.yellow, label: 'Founder covering', desc: "You're handling this" },
          { sc: STATUS_COLORS.red, label: 'Gap', desc: 'Nobody covering' },
        ] as const).map((s) => (
          <div key={s.label} className="flex gap-3 mb-2.5">
            <div
              className="w-8 h-3.5 rounded-[7px] shrink-0 mt-0.5"
              style={{ background: s.sc.fill, border: `2px solid ${s.sc.arc}` }}
            />
            <div>
              <div className="text-[13px] font-bold text-foreground">{s.label}</div>
              <div className="text-[11px] text-muted-foreground">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Function selected ──────────────────────────────────────
  const fn = FUNCTIONS.find((f) => f.id === selected)
  if (!fn) return null

  const comp = TEAM_COVERAGE[selected] || { execs: [], apprentices: [], founderCovering: false }
  const status = getCoverageStatus(comp)
  const sc = STATUS_COLORS[status]
  const mktAll = MARKETPLACE_CANDIDATES.filter((m) => m.forFunction === selected)

  return (
    <div className="p-7 overflow-y-auto h-full">
      {/* Status badge */}
      <div
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-3"
        style={{ background: sc.fill, border: `2px solid ${sc.border}` }}
      >
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: sc.arc }} />
        <span
          className="text-[11px] font-extrabold tracking-wide uppercase"
          style={{ color: sc.text }}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* Function name */}
      <div className="text-[22px] text-foreground font-extrabold mb-5">
        {fn.label}
      </div>

      {/* Executives */}
      <div className="text-[10px] text-muted-foreground tracking-[1.5px] uppercase font-bold mb-2.5">
        Executives ({comp.execs.length})
      </div>
      {comp.execs.length > 0 ? (
        comp.execs.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-3 p-3 rounded-xl mb-2"
            style={{ background: sc.fill, border: `2px solid ${sc.border}` }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-extrabold bg-background"
              style={{ border: `2.5px solid ${sc.arc}`, color: sc.text }}
            >
              {e.initials}
            </div>
            <div>
              <div className="text-sm font-bold text-foreground">{e.name}</div>
              <div className="text-[11px] font-semibold" style={{ color: sc.text }}>
                {e.title}
              </div>
            </div>
          </div>
        ))
      ) : (
        <div
          className="p-3 rounded-xl text-[13px] font-bold mb-2"
          style={{
            background: sc.fill,
            border: `2px ${comp.founderCovering ? 'dashed' : 'solid'} ${sc.border}`,
            color: sc.text,
          }}
        >
          {comp.founderCovering ? 'You (Founder)' : 'No executive — gap'}
        </div>
      )}

      {/* Apprentices */}
      <div className="text-[10px] text-muted-foreground tracking-[1.5px] uppercase font-bold mb-2.5 mt-4">
        Apprentices ({comp.apprentices.length})
      </div>
      {comp.apprentices.length > 0 ? (
        comp.apprentices.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2.5 p-2.5 rounded-xl mb-1.5 bg-muted/40 border border-border"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-extrabold bg-background border-2 border-indigo-200 text-indigo-500">
              {a.initials}
            </div>
            <div>
              <div className="text-[13px] font-bold text-foreground">{a.name}</div>
              <div className="text-[11px] text-muted-foreground">{a.title}</div>
            </div>
          </div>
        ))
      ) : (
        <div className="p-3 rounded-xl bg-muted/40 border border-dashed border-border text-muted-foreground text-[13px]">
          No apprentices
        </div>
      )}

      {/* Marketplace */}
      {mktAll.length > 0 && (
        <>
          <div className="relative h-px bg-indigo-200 my-4">
            <span className="absolute -top-2 left-0 bg-muted/50 pr-2 text-[9px] text-indigo-500 font-bold tracking-[1.5px]">
              MARKETPLACE
            </span>
          </div>
          {mktAll.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2.5 p-3 rounded-xl mb-2 bg-background border border-indigo-100 cursor-pointer hover:border-indigo-300 transition-colors"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-extrabold"
                style={{
                  background: c.type === 'exec' ? '#EEF2FF' : '#F5F3FF',
                  border: `2px solid ${c.type === 'exec' ? '#A5B4FC' : '#C4B5FD'}`,
                  color: c.type === 'exec' ? '#4F46E5' : '#7C3AED',
                }}
              >
                {c.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-foreground">{c.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {c.role} · ★{c.rating}
                </div>
              </div>
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded-lg"
                style={{
                  background: c.type === 'exec' ? '#EEF2FF' : '#F5F3FF',
                  color: c.type === 'exec' ? '#4F46E5' : '#7C3AED',
                }}
              >
                {c.type === 'exec' ? 'EXEC' : 'APPR'}
              </span>
            </div>
          ))}
          <button className="w-full mt-2.5 py-3 bg-indigo-600 border-none rounded-xl text-white text-[13px] font-bold cursor-pointer hover:bg-indigo-700 transition-colors">
            Onboard →
          </button>
        </>
      )}
    </div>
  )
}
