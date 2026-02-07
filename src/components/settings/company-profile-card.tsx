'use client'

/**
 * @file company-profile-card.tsx
 * 
 * @description Settings card displaying the company profile summary with edit button.
 * Shows key company metrics (team size, revenue, funding) and opens the
 * CompanyProfileDialog for editing.
 * 
 * @component CompanyProfileCard
 */

import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Building2, Pencil, Sparkles } from 'lucide-react'
import { CompanyProfileDialog } from './company-profile-dialog'
import type { CompanyProfile } from '@/types/foundry'
import {
  EMPLOYEE_COUNT_LABELS,
  REVENUE_RANGE_LABELS,
  FUNDING_STATUS_LABELS,
  BUSINESS_MODEL_LABELS,
} from '@/types/foundry'

interface CompanyProfileCardProps {
  /** Current company profile data (null if not yet set) */
  companyProfile: CompanyProfile | null
  /** Foundry ID */
  foundryId: string
  /** Current user ID */
  userId: string
  /** Whether the current user is a founder (can edit) */
  isFounder: boolean
}

export function CompanyProfileCard({
  companyProfile,
  foundryId,
  userId,
  isFounder,
}: CompanyProfileCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const hasProfile = companyProfile && (
    companyProfile.employee_count ||
    companyProfile.revenue_range ||
    companyProfile.funding_status ||
    companyProfile.business_model
  )

  return (
    <>
      <Card className="bg-background border-muted shadow-[0_2px_15px_rgba(0,0,0,0.03)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-international-orange" />
              <CardTitle>Company Profile</CardTitle>
            </div>
            {isFounder && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                {hasProfile ? 'Edit' : 'Set up'}
              </Button>
            )}
          </div>
          <CardDescription>
            Company context used to personalise AI recommendations across the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasProfile ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ProfileStat
                label="Team size"
                value={companyProfile.employee_count ? EMPLOYEE_COUNT_LABELS[companyProfile.employee_count] : null}
              />
              <ProfileStat
                label="Business model"
                value={companyProfile.business_model ? BUSINESS_MODEL_LABELS[companyProfile.business_model] : null}
              />
              <ProfileStat
                label="Revenue"
                value={companyProfile.revenue_range ? REVENUE_RANGE_LABELS[companyProfile.revenue_range] : null}
              />
              <ProfileStat
                label="Funding"
                value={companyProfile.funding_status ? FUNDING_STATUS_LABELS[companyProfile.funding_status] : null}
                badge={companyProfile.seeking_funding ? 'Seeking' : undefined}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-international-orange-light border border-international-orange/20">
              <Sparkles className="h-5 w-5 text-international-orange flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Tell us about your company
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Adding company details helps our AI give you more relevant advice, marketplace results, and workflow suggestions.
                </p>
              </div>
              {isFounder && (
                <Button
                  size="sm"
                  className="bg-international-orange hover:bg-international-orange-hover flex-shrink-0"
                  onClick={() => setDialogOpen(true)}
                >
                  Get started
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isFounder && (
        <CompanyProfileDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initialData={companyProfile}
          foundryId={foundryId}
          userId={userId}
        />
      )}
    </>
  )
}

function ProfileStat({
  label,
  value,
  badge,
}: {
  label: string
  value: string | null
  badge?: string
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium">
          {value || <span className="text-muted-foreground/50">—</span>}
        </p>
        {badge && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            {badge}
          </Badge>
        )}
      </div>
    </div>
  )
}
