'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { typography } from '@/lib/design-system'
import { HeroCard } from './components/hero-card'
import { OverviewTab } from './components/overview-tab'
import { MarketplaceTab } from './components/marketplace-tab'
import { LinksTab } from './components/links-tab'
import { MarketplaceEditWizard } from './components/marketplace-edit-wizard'
import { EditProfileDialog } from './components/edit-profile-dialog'

import type { ProfileHubData } from '@/actions/profile-hub'

/**
 * ProfileHubView - Main profile page orchestrator with tabs.
 *
 * @description Renders the profile hub with a hero card, tabbed content
 * (Overview, Marketplace, Links & Social), and edit dialogs.
 * Adapts to all user roles: Founders, Executives, and Apprentices.
 *
 * @component
 *
 * @example
 * <ProfileHubView data={profileHubData} />
 */
export function ProfileHubView({ data }: { data: ProfileHubData }) {
  const { profile, providerProfile, listing, strength, isProvider, foundryName, stats } = data
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false)

  // Determine if user is an Apprentice (can access marketplace even without provider profile)
  const isApprentice = profile?.role === 'Apprentice'
  const showMarketplaceTab = isProvider || isApprentice

  // LinkedIn URL: prefer provider profile, fall back to profiles table
  const linkedinUrl = providerProfile?.linkedin_url ?? profile?.linkedin_url ?? null

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
        foundryName={foundryName}
        linkedinUrl={linkedinUrl}
        websiteUrl={providerProfile?.website_url ?? null}
        profileSlug={providerProfile?.profile_slug ?? null}
        isProvider={isProvider}
        onEditClick={() => setIsEditProfileOpen(true)}
      />

      {/* Tabbed Content */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {showMarketplaceTab && (
            <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          )}
          <TabsTrigger value="links">Links & Social</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <OverviewTab
            fullName={profile?.full_name ?? null}
            email={profile?.email ?? ''}
            role={profile?.role ?? 'Member'}
            foundryName={foundryName}
            bio={profile?.bio ?? null}
            phoneNumber={profile?.phone_number ?? null}
            linkedinUrl={linkedinUrl}
            stats={stats}
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
