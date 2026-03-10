'use client'

import { RFQWizard, type RFQWizardProps } from './RFQWizard'

interface RFQCreatorProps {
  initialCategory?: string
  initialDescription?: string
  targetSupplierId?: string
  defaultPreviewOpen?: boolean
  showPreviewToggle?: boolean
  onSuccess?: (rfqId: string) => void
  onCancel?: () => void
  className?: string
}

/**
 * Thin shim over RFQWizard. Preserves existing imports from
 * cad-lab-contracting.tsx and techniques-explorer.tsx.
 */
export function RFQCreator({
  initialCategory,
  initialDescription,
  targetSupplierId,
  onSuccess,
  onCancel,
  className,
}: RFQCreatorProps) {
  return (
    <RFQWizard
      initialCategory={initialCategory}
      initialDescription={initialDescription}
      targetSupplierId={targetSupplierId}
      onSuccess={onSuccess}
      onCancel={onCancel}
      className={className}
    />
  )
}
