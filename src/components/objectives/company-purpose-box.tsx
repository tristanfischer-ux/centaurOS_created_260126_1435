'use client'

/**
 * @file company-purpose-box.tsx
 * 
 * @description Displays the company's purpose, mission, and vision at the top of the 
 * Objectives page. Provides strategic context for all objectives.
 * 
 * @component CompanyPurposeBox
 */

import { useState } from 'react'
import { Compass, ChevronDown, ChevronUp, Info, Pencil } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { FoundryPurposeData } from '@/types/foundry'

interface CompanyPurposeBoxProps {
  /** Purpose data from foundries.purpose_data */
  purposeData: FoundryPurposeData | null
  /** Whether the current user is a founder (can edit) */
  isFounder: boolean
  /** Callback when user clicks "Define Purpose" or "Edit" */
  onOpenDialog: () => void
  /** Additional CSS classes */
  className?: string
}

/**
 * CompanyPurposeBox - Displays company purpose at top of Objectives page
 * 
 * @description Shows the company's purpose statement with collapsible mission/vision details.
 * Founders can define or edit the purpose via a questionnaire dialog.
 * 
 * **States:**
 * - Empty (Founder): Prominent CTA to "Define your company's purpose"
 * - Empty (Non-founder): Subtle message "Company purpose not yet defined"
 * - Filled: Displays purpose with expandable mission/vision
 * 
 * @example
 * // In objectives page
 * <CompanyPurposeBox
 *   purposeData={foundry?.purpose_data}
 *   isFounder={profile.role === 'Founder'}
 *   onOpenDialog={() => setIsDialogOpen(true)}
 * />
 */
export function CompanyPurposeBox({
  purposeData,
  isFounder,
  onOpenDialog,
  className,
}: CompanyPurposeBoxProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Show "Define Purpose" CTA for founders when purpose is empty
  if (!purposeData && isFounder) {
    return (
      <Card className={cn('border-l-4 border-l-international-orange', className)}>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center py-8 space-y-4">
            <div className="rounded-full bg-orange-50 p-4">
              <Compass className="h-8 w-8 text-international-orange" />
            </div>
            <div className="space-y-2 max-w-2xl">
              <h3 className="text-lg font-semibold text-foreground">
                Define Your Company's Purpose
              </h3>
              <p className="text-muted-foreground">
                What's your company's reason for existing? A clear purpose helps align 
                your objectives and inspire your team.
              </p>
            </div>
            <Button 
              onClick={onOpenDialog}
              className="bg-international-orange hover:bg-international-orange-hover"
            >
              <Compass className="h-4 w-4 mr-2" />
              Define Purpose
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  // Show subtle message for non-founders when purpose is empty
  if (!purposeData && !isFounder) {
    return (
      <Card className={cn('border-l-4 border-l-muted', className)}>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3 py-4">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Company purpose not yet defined
              </p>
              <p className="text-xs text-muted-foreground">
                Your founder can set this to provide strategic context for objectives.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  // Show purpose data (guaranteed to exist at this point)
  const hasMissionOrVision = purposeData!.mission || purposeData!.vision
  
  return (
    <Card className={cn('border-l-4 border-l-international-orange', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-international-orange" />
            Our Purpose
          </CardTitle>
          {isFounder && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onOpenDialog}
              aria-label="Edit company purpose"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main purpose statement */}
        <p className="text-lg font-medium text-foreground leading-relaxed">
          {purposeData!.purpose}
        </p>
        
        {/* Collapsible mission and vision */}
        {hasMissionOrVision && (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                aria-expanded={isExpanded}
                aria-label={isExpanded ? "Hide mission and vision" : "Show mission and vision"}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    Hide details
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Show mission & vision
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              {purposeData!.mission && (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Mission</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {purposeData!.mission}
                  </p>
                </div>
              )}
              {purposeData!.vision && (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Vision</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {purposeData!.vision}
                  </p>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
        
        {/* Last updated metadata (subtle) */}
        {purposeData!.updatedAt && (
          <p className="text-xs text-muted-foreground pt-2 border-t">
            Last updated {new Date(purposeData!.updatedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
