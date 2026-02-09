'use client'

/**
 * PersonCard — reusable card for founders, executives, apprentices, and marketplace candidates.
 *
 * @description Renders a team member or marketplace candidate card with avatar,
 * role badge, task stats or marketplace info, and action buttons. Used in the
 * list view across all sections.
 *
 * @param props.person - The team member or marketplace candidate to display
 * @param props.showAddToTeam - Whether to show the "Add to Team" button (default true)
 * @param props.isMarketplace - Renders marketplace-specific fields (rating, hourly rate, tags)
 * @param props.functionLabel - Optional function label shown next to role badge
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { TeamMember, MarketplaceCandidate } from '../types'

// ─── Sub-components ──────────────────────────────────────────────────────────

type RoleKey = 'FOUNDER' | 'EXECUTIVE' | 'APPRENTICE' | 'MARKETPLACE'

const ROLE_STYLES = {
  FOUNDER: 'bg-orange-50 text-orange-700 border-orange-300',
  EXECUTIVE: 'bg-orange-50 text-orange-700 border-orange-300',
  APPRENTICE: 'bg-blue-50 text-blue-700 border-blue-300',
  MARKETPLACE: 'bg-purple-50 text-purple-700 border-purple-300',
} satisfies Record<RoleKey, string>

function RoleBadge({ role }: { role: RoleKey }) {
  return (
    <span
      className={cn(
        'text-[9px] font-extrabold tracking-wider px-2 py-0.5 rounded border',
        ROLE_STYLES[role]
      )}
    >
      {role}
    </span>
  )
}

function CapacityBadge({ status }: { status: 'has_capacity' | 'at_capacity' }) {
  const isAtCap = status === 'at_capacity'
  return (
    <span
      className={cn(
        'text-[11px] font-bold px-2.5 py-1 rounded-md',
        isAtCap ? 'text-orange-600 bg-orange-50' : 'text-emerald-600 bg-emerald-50'
      )}
    >
      {isAtCap ? 'At capacity' : 'Has capacity'}
    </span>
  )
}

function StatItem({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
      <span className="text-[10px]">{icon}</span> {value} {label}
    </span>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface PersonCardProps {
  /** The person to render — either a TeamMember or MarketplaceCandidate with a title field */
  person: (TeamMember | (MarketplaceCandidate & { title?: string }))
  /** Show "Add to Team" button for company members (default true) */
  showAddToTeam?: boolean
  /** Render marketplace-specific fields instead of task stats */
  isMarketplace?: boolean
  /** Optional function label next to role badge */
  functionLabel?: string | null
}

export function PersonCard({
  person,
  showAddToTeam = true,
  isMarketplace = false,
  functionLabel = null,
}: PersonCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  const roleBadgeKey: RoleKey = isMarketplace
    ? 'MARKETPLACE'
    : (person.role as RoleKey) || 'APPRENTICE'

  // Type narrowing for marketplace-specific fields
  const mkt = isMarketplace ? (person as MarketplaceCandidate & { title?: string }) : null

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'bg-background rounded-[14px] border-[1.5px] p-5 flex flex-col gap-3',
        'transition-all duration-200 min-w-[260px]',
        isHovered
          ? 'border-international-orange shadow-[0_4px_16px_rgba(249,115,22,0.1)]'
          : 'border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3.5">
        {/* Avatar */}
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-extrabold text-white shrink-0"
          style={{ backgroundColor: person.color || '#F97316' }}
        >
          {person.initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <RoleBadge role={roleBadgeKey} />
            {functionLabel && (
              <span className="text-[9px] font-bold text-muted-foreground tracking-wide">
                {functionLabel}
              </span>
            )}
          </div>
          <div className="text-[15px] font-bold text-foreground">{person.name}</div>
          {'title' in person && person.title && (
            <div className="text-xs text-muted-foreground mt-0.5">{person.title}</div>
          )}
        </div>

        {/* Action button */}
        {showAddToTeam && !isMarketplace && (
          <button
            className={cn(
              'text-xs font-semibold text-muted-foreground bg-background',
              'border-[1.5px] border-border rounded-lg px-3.5 py-1.5',
              'cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap',
              'transition-all duration-150 hover:border-international-orange hover:text-foreground'
            )}
          >
            <span className="text-sm">👤</span> Add to Team
          </button>
        )}
        {isMarketplace && (
          <button
            className={cn(
              'text-xs font-bold text-white bg-international-orange',
              'border-none rounded-lg px-3.5 py-1.5 cursor-pointer',
              'whitespace-nowrap transition-all duration-150',
              'shadow-[0_2px_8px_rgba(249,115,22,0.25)]',
              'hover:opacity-90'
            )}
          >
            Onboard →
          </button>
        )}
      </div>

      {/* Stats or Marketplace info */}
      {!isMarketplace ? (
        <div className="flex gap-4 flex-wrap">
          <StatItem icon="✅" label="done" value={(person as TeamMember).done} />
          <StatItem icon="🏗" label="active" value={(person as TeamMember).active} />
          <StatItem icon="⏳" label="pending" value={(person as TeamMember).pending} />
        </div>
      ) : (
        <div className="flex gap-4 flex-wrap items-center">
          <span className="text-xs text-amber-500 font-bold">★ {mkt?.rating}</span>
          <span className="text-xs text-muted-foreground">{mkt?.hourlyRate}</span>
          <span className="text-[11px] text-muted-foreground">
            {mkt?.type === 'exec' ? 'Executive' : 'Apprentice'}
          </span>
        </div>
      )}

      {/* Tags for marketplace */}
      {isMarketplace && mkt?.tags && (
        <div className="flex gap-1.5 flex-wrap">
          {mkt.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] px-2.5 py-0.5 bg-muted rounded-md text-muted-foreground font-semibold border border-border/50"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Footer — company members only */}
      {!isMarketplace && (
        <>
          <CapacityBadge status={(person as TeamMember).capacity} />
          <div className="flex justify-between items-center border-t border-border/40 pt-3 mt-0.5">
            <span className="text-xs text-muted-foreground cursor-pointer">
              {(person as TeamMember).tasksInQueue} tasks in queue{' '}
              <span className="text-[10px]">▾</span>
            </span>
            <button
              className={cn(
                'text-xs font-bold text-white bg-emerald-500',
                'border-none rounded-lg px-4 py-[7px] cursor-pointer',
                'inline-flex items-center gap-1.5',
                'shadow-[0_2px_6px_rgba(16,185,129,0.25)]',
                'transition-all duration-150 hover:bg-emerald-600'
              )}
            >
              👁 View
            </button>
          </div>
        </>
      )}
    </div>
  )
}
