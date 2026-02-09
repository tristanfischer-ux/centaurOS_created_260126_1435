'use client'

/**
 * ListView — enhanced list view with stats, coverage alerts, role sections,
 * and a marketplace section separated by a dashed indigo border.
 *
 * @description Top-to-bottom scrollable layout: stats bar → status pills →
 * coverage alerts → founders → executives → apprentices → marketplace.
 */

import { FUNCTIONS, TEAM_COVERAGE, getCoverageStatus } from '../constants'
import { useTeamData } from '../hooks/use-team-data'
import { PersonCard } from './person-card'
import { GapAlert } from './gap-alert'
import { FunctionSection } from './function-section'

export function ListView() {
  const {
    founders,
    allExecs,
    allApprentices,
    gaps,
    marketplaceByFunction,
    stats,
  } = useTeamData()

  return (
    <div className="flex-1 overflow-y-auto px-8 pb-10">
      {/* ── Stats Bar ─────────────────────────────────────────── */}
      <div className="flex gap-6 mb-6">
        {[
          { icon: '👥', value: stats.totalPeople, label: 'People' },
          { icon: '🏢', value: stats.totalFunctions, label: 'Functions' },
          { icon: '📊', value: stats.avgCapacity, label: 'Avg Capacity' },
        ].map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 px-6 py-4 bg-background rounded-xl border border-border min-w-[150px]"
          >
            <span className="text-[22px]">{s.icon}</span>
            <div>
              <div className="text-2xl font-extrabold text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Status Pills ──────────────────────────────────────── */}
      <div className="flex gap-2.5 mb-7">
        <span className="text-xs font-bold px-4 py-2 rounded-full bg-emerald-50 text-emerald-600 inline-flex items-center gap-1.5">
          😴 {stats.totalIdle} members idle
        </span>
        <span className="text-xs font-bold px-4 py-2 rounded-full bg-orange-50 text-orange-600 inline-flex items-center gap-1.5">
          ⚡ {stats.gapCount} function gaps
        </span>
        <span className="text-xs font-bold px-4 py-2 rounded-full bg-amber-50 text-amber-600 inline-flex items-center gap-1.5">
          🙋 Founder covering {stats.founderCoveringCount}
        </span>
      </div>

      {/* ── Coverage Alerts ───────────────────────────────────── */}
      {gaps.length > 0 && (
        <div className="mb-7">
          <div className="text-[11px] font-bold text-muted-foreground tracking-[1.5px] uppercase mb-3">
            Coverage Alerts
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {gaps.map((g) => (
              <GapAlert
                key={g.fn.id}
                functionName={g.fn.label}
                status={g.status}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Founders ──────────────────────────────────────────── */}
      <SectionHeader
        accentColor="#F97316"
        title="Founders"
        count={founders.length}
        subtitle="Decision makers"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 mb-8">
        {founders.map((f) => (
          <PersonCard key={f.id} person={f} showAddToTeam={false} />
        ))}
      </div>

      {/* ── Executives ────────────────────────────────────────── */}
      <SectionHeader
        accentColor="#F97316"
        title="Executives"
        count={allExecs.length}
        subtitle="Evaluators"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 mb-8">
        {allExecs.map((e) => (
          <PersonCard key={e.id} person={e} />
        ))}
      </div>

      {/* ── Apprentices ───────────────────────────────────────── */}
      <SectionHeader
        accentColor="#3B82F6"
        title="Apprentices"
        count={allApprentices.length}
        subtitle="Executors"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 mb-8">
        {allApprentices.map((a) => (
          <PersonCard key={a.id} person={a} />
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════
           MARKETPLACE — separated by dashed indigo border
         ═══════════════════════════════════════════════════════ */}
      <div className="mt-2 pt-8 border-t-[3px] border-dashed border-indigo-200 relative">
        {/* Floating label on the border */}
        <div className="absolute -top-3.5 left-6 bg-muted/50 px-4 py-1">
          <span className="text-[10px] font-extrabold text-indigo-500 tracking-[2px]">
            MARKETPLACE
          </span>
        </div>

        <SectionHeader
          accentColor="#6366F1"
          title="Available Candidates"
          count={Object.values(marketplaceByFunction).flat().length}
          subtitle="Ready to onboard"
        />
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Candidates matched to your capability gaps. Onboard them to fill red
          and yellow zones in your company orbit.
        </p>

        {/* Grouped by function */}
        {FUNCTIONS.map((fn) => {
          const candidates = marketplaceByFunction[fn.id]
          if (!candidates || candidates.length === 0) return null

          const comp = TEAM_COVERAGE[fn.id]
          const status = comp ? getCoverageStatus(comp) : 'red'

          return (
            <div key={fn.id} className="mb-7">
              <FunctionSection label={fn.label} status={status}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                  {candidates.map((c) => (
                    <PersonCard
                      key={c.id}
                      person={{ ...c, title: c.role }}
                      isMarketplace
                      functionLabel={fn.label}
                    />
                  ))}
                </div>
              </FunctionSection>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Shared Section Header ───────────────────────────────────────────────────

function SectionHeader({
  accentColor,
  title,
  count,
  subtitle,
}: {
  accentColor: string
  title: string
  count: number
  subtitle: string
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="w-1 h-7 rounded-sm"
        style={{ background: accentColor }}
      />
      <span className="text-xl font-extrabold text-foreground">{title}</span>
      <span className="text-[13px] font-bold text-muted-foreground bg-muted px-2.5 py-0.5 rounded-xl">
        {count}
      </span>
      <span className="text-[13px] text-muted-foreground">{subtitle}</span>
    </div>
  )
}
