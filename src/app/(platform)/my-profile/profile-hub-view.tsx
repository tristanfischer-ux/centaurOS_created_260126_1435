'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { typography } from '@/lib/design-system'
import { HeroCard } from './components/hero-card'
import { OverviewTab } from './components/overview-tab'
import { MarketplaceTab } from './components/marketplace-tab'
import { LinksTab } from './components/links-tab'
import { MarketplaceEditWizard } from './components/marketplace-edit-wizard'
import { EditProfileDialog } from './components/edit-profile-dialog'
import { CompanySwitcher } from './components/company-switcher'
import { toast } from 'sonner'
import { TelegramLink } from '@/components/settings/telegram-link'
import { ReportPreferences } from '@/components/settings/report-preferences'
import { switchFoundry } from '@/actions/foundry-switching'

import type { ProfileHubData } from '@/actions/profile-hub'

interface FoundryInfo {
  foundryId: string
  foundryName: string
  role: string
  isPrimary: boolean
  isActive: boolean
  memberCount: number
  joinedAt: string
}

/** Enrichment data for the overview tab (sparkline, trends). */
export interface ProfileEnrichment {
  /** Daily task completion counts for sparkline (last 30 days) */
  sparklineData: Array<{ date: string; count: number }>
  /** Tasks completed this week */
  completedThisWeek: number
  /** Tasks completed last week (for comparison) */
  completedLastWeek: number
}

interface ProfileHubViewProps {
  data: ProfileHubData
  foundries: FoundryInfo[]
  /** Error message if foundries RPC failed, null if successful */
  foundriesError?: string | null
  /** Existing Telegram link data, or null if not linked */
  telegramLink: {
    id: string
    platform_username: string | null
    verified_at: string | null
  } | null
  /** Telegram bot username for generating link */
  botUsername: string
  /** Optional enrichment data for activity sparkline + trends */
  enrichment?: ProfileEnrichment
}

/**
 * ProfileHubView - Main profile page orchestrator with tabs.
 *
 * @description Renders the profile hub with a hero card, company switcher,
 * tabbed content (Overview, Marketplace, Links & Social, Preferences),
 * and edit dialogs. Adapts to all user roles: Founders, Executives, and Apprentices.
 *
 * @component
 *
 * @example
 * <ProfileHubView data={profileHubData} foundries={foundries} telegramLink={null} botUsername="ForgeOSBot" />
 */
export function ProfileHubView({ data, foundries, foundriesError, telegramLink, botUsername, enrichment }: ProfileHubViewProps) {
  const { profile, providerProfile, listing, strength, isProvider, foundryName, stats } = data
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)

  /**
   * Handles clicking a company tile — switches foundry (if needed) and navigates to dashboard.
   */
  function handleCompanyClick(foundryId: string): void {
    const foundry = foundries.find((f) => f.foundryId === foundryId)
    if (!foundry) return

    setSwitchingTo(foundryId)
    startTransition(async () => {
      try {
        if (!foundry.isActive) {
          await switchFoundry(foundryId)
        }
        router.push('/updates')
      } catch (error) {
        console.error('[ProfileHub] Failed to switch foundry:', { foundryId, error: error instanceof Error ? error.message : 'Unknown error' })
        toast.error('Failed to switch company. Please try again.')
        setSwitchingTo(null)
      }
    })
  }

  // Determine if user is an Apprentice (can access marketplace even without provider profile)
  const isApprentice = profile?.role === 'Apprentice'
  const showMarketplaceTab = isProvider || isApprentice

  // LinkedIn URL: prefer provider profile, fall back to profiles table
  const linkedinUrl = providerProfile?.linkedin_url ?? profile?.linkedin_url ?? null

  // Company name: prefer profile-hub data, fall back to foundries list (fixes RLS/missing lookup)
  const resolvedFoundryName =
    data.foundryName ??
    foundries.find((f) => f.isActive)?.foundryName ??
    foundries[0]?.foundryName ??
    null

  return (
    <div className="max-w-4xl space-y-8">
      {/* Page Header */}
      <div className="pb-4 border-b border-muted">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>My Profile</h1>
        </div>
        <p className={typography.pageSubtitle}>
          Manage your presence on the platform
        </p>
      </div>

      {/* Hero Card */}
      <HeroCard
        name={profile?.full_name ?? null}
        headline={providerProfile?.headline ?? null}
        role={profile?.role ?? 'Member'}
        avatarUrl={profile?.avatar_url ?? null}
        location={providerProfile?.location ?? null}
        memberSince={profile?.created_at ?? new Date().toISOString()}
        foundryName={resolvedFoundryName}
        linkedinUrl={linkedinUrl}
        websiteUrl={providerProfile?.website_url ?? null}
        profileSlug={providerProfile?.profile_slug ?? null}
        isProvider={isProvider}
        onEditClick={() => setIsEditProfileOpen(true)}
      />

      {/* Company Switcher */}
      <CompanySwitcher
        foundries={foundries}
        error={foundriesError ?? null}
        switchingTo={switchingTo}
        isPending={isPending}
        onCompanyClick={handleCompanyClick}
      />

      {/* Tabbed Content */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full flex-wrap">
          <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
          {showMarketplaceTab && (
            <TabsTrigger value="marketplace" className="flex-1">Marketplace</TabsTrigger>
          )}
          <TabsTrigger value="links" className="flex-1">
            <span className="sm:hidden">Links</span>
            <span className="hidden sm:inline">Links &amp; Social</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex-1">Preferences</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <OverviewTab
            fullName={profile?.full_name ?? null}
            email={profile?.email ?? ''}
            role={profile?.role ?? 'Member'}
            foundryName={resolvedFoundryName}
            bio={profile?.bio ?? null}
            phoneNumber={profile?.phone_number ?? null}
            linkedinUrl={linkedinUrl}
            stats={stats}
            enrichment={enrichment}
            onEditClick={() => setIsEditProfileOpen(true)}
          />
        </TabsContent>

        {/* Marketplace Tab (providers + Apprentices) */}
        {showMarketplaceTab && (
          <TabsContent value="marketplace" className="mt-6">
            {isProvider && providerProfile ? (
              <MarketplaceTab
                providerProfile={providerProfile}
                listing={listing}
                strength={strength}
                onEditClick={() => setIsWizardOpen(true)}
              />
            ) : (
              <MarketplaceOnboardingCTA
                onSetupClick={() => setIsWizardOpen(true)}
              />
            )}
          </TabsContent>
        )}

        {/* Links & Social Tab */}
        <TabsContent value="links" className="mt-6">
          <LinksTab
            linkedinUrl={linkedinUrl}
            websiteUrl={providerProfile?.website_url ?? null}
            location={providerProfile?.location ?? null}
            timezone={providerProfile?.timezone ?? null}
            phoneNumber={profile?.phone_number ?? null}
            isProvider={isProvider}
            onEditClick={isProvider ? () => setIsWizardOpen(true) : () => setIsEditProfileOpen(true)}
          />
        </TabsContent>

        {/* Preferences Tab (Telegram + Daily Pulse) */}
        <TabsContent value="preferences" className="mt-6">
          <div className="space-y-6">
            <TelegramLink
              initialLink={telegramLink}
              botUsername={botUsername}
            />
            <ReportPreferences
              hasTelegramLinked={!!telegramLink?.verified_at}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Profile Dialog (basic fields, all roles) */}
      {profile && (
        <EditProfileDialog
          open={isEditProfileOpen}
          onOpenChange={setIsEditProfileOpen}
          profile={{
            id: profile.id,
            full_name: profile.full_name,
            bio: profile.bio,
            phone_number: profile.phone_number,
            linkedin_url: profile.linkedin_url,
            professional_background: profile.professional_background as {
              summary?: string | null
              previous_companies?: string | null
              education?: string | null
            } | null,
          }}
        />
      )}

      {/* Marketplace Edit Wizard (marketplace fields) */}
      <MarketplaceEditWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        providerProfile={providerProfile}
        userRole={profile?.role ?? 'Executive'}
      />
    </div>
  )
}

/* ─── Marketplace Onboarding CTA ──────────────────────────────────── */

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Store, ArrowRight } from 'lucide-react'

/**
 * MarketplaceOnboardingCTA - Shown to Apprentices who don't yet have a provider profile.
 *
 * @description Encouraging CTA that explains the marketplace and invites the user
 * to set up their marketplace profile. Clicking opens the marketplace edit wizard
 * which will auto-create the provider_profiles record.
 */
function MarketplaceOnboardingCTA({ onSetupClick }: { onSetupClick: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Store className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Get discovered in the Marketplace
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
          Set up your marketplace profile so companies can find you, see your skills,
          and hire you for projects. It only takes a few minutes.
        </p>
        <Button
          onClick={onSetupClick}
          className="bg-international-orange hover:bg-international-orange/90"
        >
          Set Up Marketplace Profile
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  )
}
