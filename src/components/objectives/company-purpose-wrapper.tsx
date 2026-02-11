'use client'

/**
 * @file company-purpose-wrapper.tsx
 * 
 * @description Client-side wrapper for CompanyPurposeBox and CompanyPurposeDialog.
 * Manages dialog state.
 */

import { useState } from 'react'
import { CompanyPurposeBox } from './company-purpose-box'
import { CompanyPurposeDialog } from './company-purpose-dialog'
import type { FoundryPurposeData } from '@/types/foundry'

interface CompanyPurposeWrapperProps {
  purposeData: FoundryPurposeData | null
  isFounder: boolean
  foundryId: string
  userId: string
  /** Display variant: 'card' for full card (Objectives page), 'inline' for compact (Strategy page) */
  variant?: 'card' | 'inline'
}

/**
 * CompanyPurposeWrapper - Client wrapper for purpose box and dialog
 * 
 * @description Combines CompanyPurposeBox (display) and CompanyPurposeDialog (editing)
 * with shared dialog state management.
 */
export function CompanyPurposeWrapper({
  purposeData,
  isFounder,
  foundryId,
  userId,
  variant = 'card',
}: CompanyPurposeWrapperProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  return (
    <>
      <CompanyPurposeBox
        purposeData={purposeData}
        isFounder={isFounder}
        onOpenDialog={() => setIsDialogOpen(true)}
        variant={variant}
      />
      
      <CompanyPurposeDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        initialData={purposeData}
        foundryId={foundryId}
        userId={userId}
      />
    </>
  )
}
