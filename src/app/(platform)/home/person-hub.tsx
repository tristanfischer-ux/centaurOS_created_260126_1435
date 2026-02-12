'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2,
  Users,
  Check,
  ChevronRight,
  Store,
  GraduationCap,
  UserCircle,
  Plus,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { typography } from '@/lib/design-system'
import { cn, getInitials } from '@/lib/utils'
import { switchFoundry } from '@/actions/foundry-switching'

interface FoundryInfo {
  foundryId: string
  foundryName: string
  role: string
  isPrimary: boolean
  isActive: boolean
  memberCount: number
  joinedAt: string
}

interface PersonHubProps {
  userName: string
  userEmail: string
  userRole: string
  userAvatar: string | null
  foundries: FoundryInfo[]
}

/**
 * Returns Tailwind classes for a role badge, using the orange hierarchy.
 */
function getRoleBadgeClasses(role: string): string {
  switch (role) {
    case 'Founder':
      return 'bg-orange-100 text-international-orange border-orange-200'
    case 'Executive':
      return 'bg-orange-50 text-international-orange border-orange-100'
    case 'Apprentice':
      return 'bg-muted text-muted-foreground border-border'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

/**
 * PersonHub — The user's personal home page showing company tiles and quick links.
 *
 * @description Renders a welcoming page with:
 * - A header greeting the user by first name
 * - A grid of company tiles (click to switch workspace)
 * - Quick links to person-level features (Marketplace, Guild, Profile)
 *
 * @param {PersonHubProps} props - User and foundry data
 */
export function PersonHub({
  userName,
  foundries,
}: PersonHubProps): React.ReactElement {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)

  const firstName = userName.split(' ')[0]
  const totalMembers = foundries.reduce((sum, f) => sum + f.memberCount, 0)

  /**
   * Handles clicking a company tile — switches foundry (if needed) and navigates to dashboard.
   */
  function handleCompanyClick(foundryId: string): void {
    const foundry = foundries.find((f) => f.foundryId === foundryId)
    if (!foundry) return

    setSwitchingTo(foundryId)
    startTransition(async () => {
      if (!foundry.isActive) {
        await switchFoundry(foundryId)
      }
      router.push('/updates')
    })
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-100">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Welcome back, {firstName}</h1>
        </div>
        <p className={typography.pageSubtitle}>
          Your personal hub — switch between companies, explore the marketplace,
          or manage your profile.
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          <span>
            {foundries.length}{' '}
            {foundries.length === 1 ? 'company' : 'companies'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>{totalMembers} total team members</span>
        </div>
      </div>

      {/* Company Tiles */}
      <section>
        <h2 className={cn(typography.label, 'mb-4')}>Your Companies</h2>

        {foundries.length === 0 ? (
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
                <Link href="/join/founder">
                  <Plus className="h-4 w-4 mr-2" />
                  Create a Company
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {foundries.map((foundry) => {
              const isCurrentlySwitching =
                switchingTo === foundry.foundryId && isPending

              return (
                <Card
                  key={foundry.foundryId}
                  className={cn(
                    'relative cursor-pointer transition-all duration-200 rounded-xl border shadow-sm',
                    'hover:shadow-lg hover:-translate-y-0.5',
                    foundry.isActive && 'ring-2 ring-international-orange',
                    isCurrentlySwitching && 'opacity-70 pointer-events-none'
                  )}
                  onClick={() => handleCompanyClick(foundry.foundryId)}
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
                            <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold text-status-success uppercase tracking-wider">
                              <Check className="h-3 w-3" />
                              Active
                            </span>
                          )}
                        </div>

                        {/* Role Badge */}
                        <div className="mt-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
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

      {/* Quick Links */}
      <section>
        <h2 className={cn(typography.label, 'mb-4')}>Quick Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <QuickLinkCard
            href="/marketplace"
            icon={Store}
            title="Marketplace"
            description="Find experts, suppliers, and services"
          />
          <QuickLinkCard
            href="/guild"
            icon={GraduationCap}
            title="Guild"
            description="Apprentice pool and community events"
          />
          <QuickLinkCard
            href="/my-profile"
            icon={UserCircle}
            title="My Profile"
            description="Manage your public profile and settings"
          />
        </div>
      </section>
    </div>
  )
}

/**
 * QuickLinkCard — A small card linking to a person-level feature.
 */
function QuickLinkCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}): React.ReactElement {
  return (
    <Link href={href}>
      <Card className="cursor-pointer transition-all duration-200 rounded-xl border shadow-sm hover:shadow-md hover:-translate-y-0.5">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
