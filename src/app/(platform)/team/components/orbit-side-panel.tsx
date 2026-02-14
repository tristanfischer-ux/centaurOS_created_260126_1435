'use client'

/**
 * OrbitSidePanel — detail panel on the right side of the orbital view.
 *
 * @description When no function is selected, shows a Team Capacity overview
 * with workload distribution bar, a full roster grouped by role (Founders,
 * Specialists, Executives, Apprentices), and an orbit legend. When a function
 * is selected, shows executives, apprentices, and marketplace candidates for
 * that function with real action links.
 *
 * @param props.selected - Currently selected function id (or null)
 * @param props.functions - The 7 business function definitions
 * @param props.teamCoverage - Coverage data per function id
 * @param props.marketplaceCandidates - All marketplace candidates
 * @param props.marketplaceListingMap - id → original listing for link wiring
 * @param props.teamData - Pre-computed team data including all members and stats
 * @param props.specialists - Specialist advisor nodes for roster display
 * @param props.onViewProfile - Callback to open profile modal for real members
 * @param props.onSpecialistClick - Callback when a specialist is clicked
 */

import { useMemo } from 'react'
import Link from 'next/link'
import {
  STATUS_COLORS, getCoverageStatus,
} from '../constants'
import type {
  FunctionId, CoverageStatus, BusinessFunction,
  FunctionCoverage, MarketplaceCandidate, MarketplacePersonListing,
  TeamMember, SpecialistNode,
} from '../types'
import type { TeamDataResult } from '../hooks/use-team-data'

interface OrbitSidePanelProps {
  selected: FunctionId | null
  functions: BusinessFunction[]
  teamCoverage: Record<string, FunctionCoverage>
  marketplaceCandidates: MarketplaceCandidate[]
  /** Mapping from marketplace listing id → original listing data */
  marketplaceListingMap: Record<string, MarketplacePersonListing>
  /** Pre-computed team data for capacity overview */
  teamData: TeamDataResult
  /** Specialist advisor nodes for roster display */
  specialists: SpecialistNode[]
  /** Callback to open the real profile modal for internal team members */
  onViewProfile?: (memberId: string) => void
  /** Callback when a specialist is clicked in the roster */
  onSpecialistClick?: (specialistId: string) => void
}

const STATUS_LABELS: Record<CoverageStatus, string> = {
  green: 'Covered',
  yellow: 'Founder Covering',
  red: 'Gap',
}

/**
 * Computes a bandwidth score for a team member.
 *
 * @description Higher score = more loaded. Based on active tasks (weight 20)
 * and pending tasks (weight 10), capped at 100.
 *
 * @param member - Team member with active/pending task counts
 * @returns Score from 0 (idle) to 100 (fully loaded)
 */
function getBandwidthScore(member: TeamMember): number {
  return Math.min(100, member.active * 20 + member.pending * 10)
}

export function OrbitSidePanel({
  selected,
  functions,
  teamCoverage,
  marketplaceCandidates,
  marketplaceListingMap,
  teamData,
  specialists,
  onViewProfile,
  onSpecialistClick,
}: OrbitSidePanelProps) {
  // ── Capacity data (computed once for default view) ─────────
  const capacityData = useMemo(() => {
    const allMembers = [
      ...teamData.founders,
      ...teamData.allExecs,
      ...teamData.allApprentices,
    ]

    // Categorize members by workload
    const withCapacity: TeamMember[] = []
    const atCapacity: TeamMember[] = []
    const overloaded: TeamMember[] = []

    allMembers.forEach((m) => {
      const score = getBandwidthScore(m)
      if (score <= 40) {
        withCapacity.push(m)
      } else if (score <= 70) {
        atCapacity.push(m)
      } else {
        overloaded.push(m)
      }
    })

    const total = allMembers.length

    return { withCapacity, atCapacity, overloaded, total }
  }, [teamData])

  // ── Default state (nothing selected) — Team Roster ─────────
  if (!selected) {
    const { withCapacity, atCapacity, overloaded, total } = capacityData

    // Bar segment widths as percentages
    const greenPct = total > 0 ? (withCapacity.length / total) * 100 : 0
    const yellowPct = total > 0 ? (atCapacity.length / total) * 100 : 0
    const redPct = total > 0 ? (overloaded.length / total) * 100 : 0

    return (
      <div className="p-7 space-y-6">
        {/* Header */}
        <div>
          <div className="text-[22px] font-extrabold text-foreground mb-1">
            Team Capacity
          </div>
          <div className="text-[13px] text-muted-foreground">
            {total} member{total !== 1 ? 's' : ''} · avg {teamData.stats.avgCapacity} available
          </div>
        </div>

        {/* Capacity bar */}
        <div>
          <div className="flex h-3 rounded-full overflow-hidden bg-muted">
            {greenPct > 0 && (
              <div
                className="h-full bg-status-success transition-all"
                style={{ width: `${greenPct}%` }}
              />
            )}
            {yellowPct > 0 && (
              <div
                className="h-full bg-status-warning transition-all"
                style={{ width: `${yellowPct}%` }}
              />
            )}
            {redPct > 0 && (
              <div
                className="h-full bg-destructive transition-all"
                style={{ width: `${redPct}%` }}
              />
            )}
          </div>
          <div className="flex items-center gap-4 mt-2.5 text-[11px]">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-status-success" />
              <span className="text-muted-foreground">
                <span className="font-bold text-foreground">{withCapacity.length}</span> available
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-status-warning" />
              <span className="text-muted-foreground">
                <span className="font-bold text-foreground">{atCapacity.length}</span> busy
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive" />
              <span className="text-muted-foreground">
                <span className="font-bold text-foreground">{overloaded.length}</span> maxed
              </span>
            </div>
          </div>
        </div>

        {/* ── Full Roster by Role ──────────────────────────── */}

        {/* Founders */}
        {teamData.founders.length > 0 && (
          <div>
            <div className="text-[10px] text-muted-foreground tracking-[1.5px] uppercase font-bold mb-2.5">
              Founders ({teamData.founders.length})
            </div>
            <div className="space-y-1.5">
              {teamData.founders.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onViewProfile?.(m.id)}
                  className="flex items-center gap-3 p-2.5 rounded-xl w-full text-left cursor-pointer hover:bg-muted/60 transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 bg-international-orange/10 border-2 border-international-orange text-foreground"
                  >
                    {m.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-foreground truncate">{m.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {m.active} active · {m.pending} pending
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Specialists */}
        {specialists.length > 0 && (
          <div>
            <div className="text-[10px] text-muted-foreground tracking-[1.5px] uppercase font-bold mb-2.5">
              Specialists ({specialists.length})
            </div>
            <div className="space-y-1.5">
              {specialists.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSpecialistClick?.(s.id)}
                  className="flex items-center gap-3 p-2.5 rounded-xl w-full text-left cursor-pointer hover:bg-muted/60 transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 bg-chart-5/10 border-2 border-chart-5 text-chart-5"
                  >
                    {s.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-foreground truncate">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{s.title}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Executives */}
        {teamData.allExecs.length > 0 && (
          <div>
            <div className="text-[10px] text-muted-foreground tracking-[1.5px] uppercase font-bold mb-2.5">
              Executives ({teamData.allExecs.length})
            </div>
            <div className="space-y-1.5">
              {teamData.allExecs.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onViewProfile?.(m.id)}
                  className="flex items-center gap-3 p-2.5 rounded-xl w-full text-left cursor-pointer hover:bg-muted/60 transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 bg-international-orange/5 border-2 border-international-orange text-foreground"
                  >
                    {m.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-foreground truncate">{m.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {m.title}{m.functionLabel ? ` · ${m.functionLabel}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Apprentices */}
        {teamData.allApprentices.length > 0 && (
          <div>
            <div className="text-[10px] text-muted-foreground tracking-[1.5px] uppercase font-bold mb-2.5">
              Apprentices ({teamData.allApprentices.length})
            </div>
            <div className="space-y-1.5">
              {teamData.allApprentices.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onViewProfile?.(m.id)}
                  className="flex items-center gap-3 p-2.5 rounded-xl w-full text-left cursor-pointer hover:bg-muted/60 transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 bg-muted border-2 border-border text-muted-foreground"
                  >
                    {m.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-foreground truncate">{m.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {m.title}{m.functionLabel ? ` · ${m.functionLabel}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Compact legend */}
        <div className="pt-2 border-t border-border">
          <div className="text-[10px] text-muted-foreground tracking-[1.5px] uppercase font-bold mb-2">
            Orbit Legend
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {([
              { sc: STATUS_COLORS.green, label: 'Covered' },
              { sc: STATUS_COLORS.yellow, label: 'Founder' },
              { sc: STATUS_COLORS.red, label: 'Gap' },
            ] as const).map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: s.sc.arc }}
                />
                <span className="text-[11px] text-muted-foreground font-medium">{s.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: '#A78BFA' }}
              />
              <span className="text-[11px] text-muted-foreground font-medium">Specialist</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Function selected ──────────────────────────────────────
  const fn = functions.find((f) => f.id === selected)
  if (!fn) return null

  const comp = teamCoverage[selected] || { execs: [], apprentices: [], founderCovering: false }
  const status = getCoverageStatus(comp)
  const sc = STATUS_COLORS[status]
  const mktAll = marketplaceCandidates.filter((m) => m.forFunction === selected)

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
          <button
            key={e.id}
            type="button"
            onClick={() => onViewProfile?.(e.id)}
            className="flex items-center gap-3 p-3 rounded-xl mb-2 w-full text-left cursor-pointer hover:brightness-95 transition-all"
            style={{ background: sc.fill, border: `2px solid ${sc.border}` }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-extrabold bg-background"
              style={{ border: `2.5px solid ${sc.arc}`, color: sc.text }}
            >
              {e.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-foreground">{e.name}</div>
              <div className="text-[11px] font-semibold" style={{ color: sc.text }}>
                {e.title}
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground">View →</span>
          </button>
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

      {/* Find in Marketplace (for gaps / founder-covering) */}
      {status !== 'green' && (
        <Link
          href={`/marketplace?category=People&subcategory=Executive`}
          className="block w-full mt-1 mb-3 py-2.5 bg-status-warning-light border border-status-warning rounded-xl text-status-warning-dark text-[12px] font-bold text-center cursor-pointer hover:brightness-95 transition-all"
        >
          Find Executive in Marketplace →
        </Link>
      )}

      {/* Apprentices */}
      <div className="text-[10px] text-muted-foreground tracking-[1.5px] uppercase font-bold mb-2.5 mt-4">
        Apprentices ({comp.apprentices.length})
      </div>
      {comp.apprentices.length > 0 ? (
        comp.apprentices.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onViewProfile?.(a.id)}
            className="flex items-center gap-2.5 p-2.5 rounded-xl mb-1.5 bg-muted/40 border border-border w-full text-left cursor-pointer hover:bg-muted/60 transition-colors"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-extrabold bg-background border-2 border-chart-5/30 text-chart-5">
              {a.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-foreground">{a.name}</div>
              <div className="text-[11px] text-muted-foreground">{a.title}</div>
            </div>
            <span className="text-[10px] text-muted-foreground">View →</span>
          </button>
        ))
      ) : (
        <div className="p-3 rounded-xl bg-muted/40 border border-dashed border-border text-muted-foreground text-[13px]">
          No apprentices
        </div>
      )}

      {/* Marketplace Candidates */}
      {mktAll.length > 0 && (
        <>
          <div className="relative h-px bg-chart-5/20 my-4">
            <span className="absolute -top-2 left-0 bg-muted/50 pr-2 text-[9px] text-chart-5 font-bold tracking-[1.5px]">
              MARKETPLACE
            </span>
          </div>
          {mktAll.map((c) => {
            const hasListing = !!marketplaceListingMap[c.id]
            return (
              <div key={c.id} className="mb-2">
                <div
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-background border border-chart-5/20"
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
                      {c.role} · {c.hourlyRate}
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
                {/* Action buttons for each candidate */}
                {hasListing && (
                  <div className="flex gap-2 mt-1.5 ml-11">
                    <Link
                      href={`/marketplace/${c.id}`}
                      className="text-[11px] text-electric-blue font-semibold hover:underline"
                    >
                      View Profile
                    </Link>
                    <span className="text-muted-foreground text-[11px]">·</span>
                    <Link
                      href={`/marketplace/${c.id}/book`}
                      className="text-[11px] text-international-orange font-semibold hover:underline"
                    >
                      Onboard
                    </Link>
                  </div>
                )}
              </div>
            )
          })}
          <Link
            href={`/marketplace?category=People`}
            className="block w-full mt-2.5 py-3 bg-accent border-none rounded-xl text-accent-foreground text-[13px] font-bold text-center cursor-pointer hover:opacity-90 transition-colors"
          >
            Browse All Marketplace →
          </Link>
        </>
      )}
    </div>
  )
}
