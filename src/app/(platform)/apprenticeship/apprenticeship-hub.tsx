'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DiscoverLanding } from '@/components/apprenticeship/discover-landing'
import { ProgrammeCatalog } from '@/components/apprenticeship/programme-catalog'
import { EnrollmentCreateDialog } from '@/components/apprenticeship/enrollment-create-dialog'
import { Sparkles, BookOpen } from 'lucide-react'
import type { Programme } from '@/components/apprenticeship/programme-detail-card'

interface ApprenticeshipHubProps {
  foundryId?: string
  canEnroll: boolean
  programmes: Programme[]
}

/**
 * Hub view for users who don't have an active apprenticeship enrollment.
 *
 * @description Shows two tabs: Discover (the employer landing page with value
 * proposition and CTAs) and Programmes (the full catalogue). Used for
 * Founders/Executives without apprentices and unenrolled Apprentices.
 */
export function ApprenticeshipHub({
  foundryId,
  canEnroll,
  programmes,
}: ApprenticeshipHubProps) {
  const [activeTab, setActiveTab] = useState('discover')
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-4 border-b border-border">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-8 w-1 bg-international-orange rounded-full" />
          <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
            Apprenticeships
          </h1>
        </div>
        <p className="text-muted-foreground text-sm font-medium pl-4">
          UK-accredited programmes to build your future workforce
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="discover">
            <Sparkles className="h-4 w-4 mr-1.5" />
            Discover
          </TabsTrigger>
          <TabsTrigger value="programmes">
            <BookOpen className="h-4 w-4 mr-1.5" />
            Programmes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discover">
          <DiscoverLanding
            foundryId={foundryId}
            canEnroll={canEnroll}
            programmeCount={programmes.length}
            onBrowseProgrammes={() => setActiveTab('programmes')}
          />
        </TabsContent>

        <TabsContent value="programmes">
          <ProgrammeCatalog
            programmes={programmes}
            canEnroll={canEnroll}
            onEnroll={() => setEnrollDialogOpen(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Enrollment Dialog */}
      {foundryId && (
        <EnrollmentCreateDialog
          foundryId={foundryId}
          open={enrollDialogOpen}
          onOpenChange={setEnrollDialogOpen}
        />
      )}
    </div>
  )
}
