'use client'

import Link from 'next/link'
import {
  Building2,
  Users,
  Check,
  ChevronRight,
  Plus,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { typography } from '@/lib/design-system'
import { cn, getInitials } from '@/lib/utils'

interface FoundryInfo {
  foundryId: string
  foundryName: string
  role: string
  isPrimary: boolean
  isActive: boolean
  memberCount: number
  joinedAt: string
}

interface CompanySwitcherProps {
  foundries: FoundryInfo[]
  /** Error message if foundries could not be loaded, null if no error */
  error: string | null
  switchingTo: string | null
  isPending: boolean
  onCompanyClick: (foundryId: string) => void
}

/**
 * Returns Tailwind classes for a role badge, using the orange hierarchy.
 */
function getRoleBadgeClasses(role: string): string {
  switch (role) {
    case 'Founder':
      return 'bg-international-orange-light text-international-orange border-international-orange/20'
    case 'Executive':
      return 'bg-international-orange-light/50 text-international-orange border-international-orange/10'
    case 'Apprentice':
      return 'bg-muted text-muted-foreground border-border'
    case 'Supplier':
      return 'bg-info/10 text-info border-info/20'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

/**
 * CompanySwitcher — Displays company tiles for switching between workspaces.
 *
 * @description Shows the user's companies as clickable cards. Clicking a card
 * switches the active foundry and navigates to the dashboard.
 * If no companies exist, shows an encouraging empty state with a CTA.
 *
 * @param {CompanySwitcherProps} props - Company data and click handler
 */
export function CompanySwitcher({
  foundries,
  error,
  switchingTo,
  isPending,
  onCompanyClick,
}: CompanySwitcherProps): React.ReactElement {
  return (
    <section>
      <h2 className={cn(typography.label, 'mb-4')}>Your Companies</h2>

      {error ? (
        <Card className="rounded-xl border border-status-warning-light shadow-sm">
          <CardContent className="py-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-status-warning-light flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-status-warning" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Couldn&apos;t load your companies
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
              Something went wrong loading your company data. Try refreshing
              the page. If the problem persists, contact support.
            </p>
            <Button
              variant="secondary"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardContent>
        </Card>
      ) : foundries.length === 0 ? (
        <Card className="rounded-xl border border-dashed shadow-sm">
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No companies yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
              You&apos;re not part of any company yet. Ask a founder to invite
              you, or start your own company to get going.
            </p>
            <Button asChild className="bg-international-orange hover:bg-international-orange/90">
              <Link href="/signup?role=founder">
                <Plus className="h-4 w-4 mr-2" />
                Create a Company
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {foundries.map((foundry) => {
            const isCurrentlySwitching =
              switchingTo === foundry.foundryId && isPending

            return (
              <Card
                key={foundry.foundryId}
                role="button"
                tabIndex={0}
                aria-label={`Switch to ${foundry.foundryName}${foundry.isActive ? ' (currently active)' : ''}`}
                className={cn(
                  'relative cursor-pointer transition-all duration-200 rounded-xl border shadow-sm',
                  'hover:shadow-lg hover:-translate-y-0.5',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  foundry.isActive && 'ring-1 ring-international-orange/60',
                  isCurrentlySwitching && 'opacity-70 pointer-events-none'
                )}
                onClick={() => onCompanyClick(foundry.foundryId)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCompanyClick(foundry.foundryId) } }}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    {/* Company Monogram */}
                    <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-muted text-foreground font-display font-bold text-lg">
                      {getInitials(foundry.foundryName)}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Company Name */}
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground truncate">
                          {foundry.foundryName}
                        </h3>
                        {foundry.isActive && (
                          <span className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-status-success uppercase tracking-wider">
                            <Check className="h-3 w-3" />
                            Active
                          </span>
                        )}
                      </div>

                      {/* Role Badge */}
                      <div className="mt-1.5">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border',
                            getRoleBadgeClasses(foundry.role)
                          )}
                        >
                          {foundry.role}
                        </span>
                      </div>

                      {/* Status Line */}
                      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {foundry.memberCount}{' '}
                          {foundry.memberCount === 1 ? 'member' : 'members'}
                        </span>
                      </div>
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-3" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
