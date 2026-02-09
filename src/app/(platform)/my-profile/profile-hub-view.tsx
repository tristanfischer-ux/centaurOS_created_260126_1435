'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { typography } from '@/lib/design-system'
import { HeroCard } from './components/hero-card'
import { OverviewTab } from './components/overview-tab'
import { MarketplaceTab } from './components/marketplace-tab'
import { LinksTab } from './components/links-tab'
import { MarketplaceEditWizard } from './components/marketplace-edit-wizard'

import type { ProfileHubData } from '@/actions/profile-hub'

/**
 * ProfileHubView - Main profile page orchestrator with tabs.
 *
 * @description Renders the profile hub with a hero card, tabbed content
 * (Overview, Marketplace, Links & Social), and the marketplace edit wizard.
 * Adapts to both provider and non-provider users.
 *
 * @component
 *
 * @example
 * <ProfileHubView data={profileHubData} />
 */
export function ProfileHubView({ data }: { data: ProfileHubData }) {
  const { profile, providerProfile, listing, strength, isProvider, foundryName, stats } = data
  const [isWizardOpen, setIsWizardOpen] = useState(false)

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
        linkedinUrl={providerProfile?.linkedin_url ?? null}
        websiteUrl={providerProfile?.website_url ?? null}
        profileSlug={providerProfile?.profile_slug ?? null}
        isProvider={isProvider}
      />

      {/* Tabbed Content */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {isProvider && (
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
            foundryId={profile?.foundry_id ?? null}
            stats={stats}
          />
        </TabsContent>

        {/* Marketplace Tab (providers only) */}
        {isProvider && providerProfile && (
          <TabsContent value="marketplace" className="mt-6">
            <MarketplaceTab
              providerProfile={providerProfile}
              listing={listing}
              strength={strength}
              onEditClick={() => setIsWizardOpen(true)}
            />
          </TabsContent>
        )}

        {/* Links & Social Tab */}
        <TabsContent value="links" className="mt-6">
          <LinksTab
            linkedinUrl={providerProfile?.linkedin_url ?? null}
            websiteUrl={providerProfile?.website_url ?? null}
            location={providerProfile?.location ?? null}
            timezone={providerProfile?.timezone ?? null}
            isProvider={isProvider}
            onEditClick={() => setIsWizardOpen(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Marketplace Edit Wizard */}
      {isProvider && (
        <MarketplaceEditWizard
          open={isWizardOpen}
          onOpenChange={setIsWizardOpen}
          providerProfile={providerProfile}
          userRole={profile?.role ?? 'Executive'}
        />
      )}
    </div>
  )
}
