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
  /** Display variant: 'card' for full card (Objectives page), 'inline' for compact (Strategy page) */
  variant?: 'card' | 'inline'
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
  variant = 'card',
  className,
}: CompanyPurposeBoxProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // ── Inline variant (compact, for Strategy page header) ──
  if (variant === 'inline') {
    return <CompanyPurposeInline purposeData={purposeData} isFounder={isFounder} onOpenDialog={onOpenDialog} className={className} />
  }
  
  // Show "Define Purpose" CTA for founders when purpose is empty
  if (!purposeData && isFounder) {
    return (
      <Card className={cn('rounded-xl border-l-4 border-l-international-orange shadow-sm', className)}>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center py-10 space-y-4">
            <div className="rounded-full bg-international-orange/10 p-5">
              <Compass className="h-10 w-10 text-international-orange" />
            </div>
            <div className="space-y-2 max-w-2xl">
              <h3 className="text-xl font-semibold text-foreground">
                Define Your Company's Purpose
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                What's your company's reason for existing? A clear purpose helps align 
                your objectives and inspire your team.
              </p>
            </div>
            <Button 
              onClick={onOpenDialog}
              className="bg-international-orange hover:bg-international-orange-hover transition-colors"
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
      <Card className={cn('rounded-xl border-l-4 border-l-muted shadow-sm', className)}>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4 py-4">
            <div className="p-2 rounded-lg bg-muted/50">
              <Info className="h-5 w-5 text-muted-foreground" />
            </div>
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
    <Card className={cn('rounded-xl border-l-4 border-l-international-orange shadow-sm', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-lg">
            <div className="p-2 rounded-lg bg-international-orange/10">
              <Compass className="h-5 w-5 text-international-orange" />
            </div>
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
            <CollapsibleContent className="space-y-4 pt-4">
              {purposeData!.mission && (
                <div className="bg-muted/30 rounded-lg p-4 space-y-1">
                  <p className="text-sm font-semibold text-foreground">Mission</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {purposeData!.mission}
                  </p>
                </div>
              )}
              {purposeData!.vision && (
                <div className="bg-muted/30 rounded-lg p-4 space-y-1">
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

// ============================================================================
// INLINE VARIANT (compact, for Strategy page header)
// ============================================================================

/**
 * CompanyPurposeInline - Compact inline display for the Strategy page header.
 *
 * @description Renders purpose as a slim element instead of a full card.
 * Empty state shows a small CTA button; filled state shows a collapsible
 * single-line summary. Saves ~60px of vertical space vs. the card variant.
 */
function CompanyPurposeInline({
  purposeData,
  isFounder,
  onOpenDialog,
  className,
}: Omit<CompanyPurposeBoxProps, 'variant'>) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Empty state: show compact CTA or subtle hint
  if (!purposeData) {
    if (isFounder) {
      return (
        <button
          onClick={onOpenDialog}
          className={cn(
            'flex items-center gap-2 text-sm text-international-orange hover:text-international-orange-hover transition-colors font-medium',
            className
          )}
        >
          <Compass className="h-4 w-4" />
          Define Purpose
        </button>
      )
    }
    return (
      <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
        <Info className="h-3.5 w-3.5" />
        <span>Company purpose not yet defined</span>
      </div>
    )
  }

  // Filled state: collapsible single-line summary
  const hasMissionOrVision = purposeData.mission || purposeData.vision

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={cn('flex items-center gap-3', className)}>
        <Compass className="h-4 w-4 text-international-orange flex-shrink-0" />
        <CollapsibleTrigger asChild>
          <button className="text-sm text-foreground font-medium hover:text-international-orange transition-colors truncate max-w-full sm:max-w-xl text-left">
            {purposeData.purpose}
          </button>
        </CollapsibleTrigger>
        {hasMissionOrVision && (
          <CollapsibleTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label={isExpanded ? 'Collapse purpose details' : 'Expand purpose details'}>
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </CollapsibleTrigger>
        )}
        {isFounder && (
          <button
            onClick={onOpenDialog}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            aria-label="Edit company purpose"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {hasMissionOrVision && (
        <CollapsibleContent className="mt-2 ml-7 space-y-2">
          {purposeData.mission && (
            <div className="bg-muted/30 rounded-md px-3 py-2">
              <p className="text-xs font-semibold text-foreground">Mission</p>
              <p className="text-xs text-muted-foreground">{purposeData.mission}</p>
            </div>
          )}
          {purposeData.vision && (
            <div className="bg-muted/30 rounded-md px-3 py-2">
              <p className="text-xs font-semibold text-foreground">Vision</p>
              <p className="text-xs text-muted-foreground">{purposeData.vision}</p>
            </div>
          )}
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}
