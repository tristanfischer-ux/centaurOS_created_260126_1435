'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { FileText, ExternalLink } from 'lucide-react'
import { CadLabRFQHandoff } from '@/components/rfq/CadLabRFQHandoff'
import { cn } from '@/lib/utils'
import type { CadLabDesignBrief, CadLabModule } from '@/lib/cad-lab-types'

type PipelineStage = 'design' | 'specify' | 'source' | 'assemble' | 'complete'

interface GetQuoteButtonProps {
  projectId?: string | null
  pipelineStage: PipelineStage
  modules: CadLabModule[]
  diagnosticAnswers: Record<string, Record<string, string>>
  designBrief?: CadLabDesignBrief
  assumptionNotes?: string
  projectName: string
  linkedRfqId?: string | null
  onRfqLinked?: (rfqId: string) => Promise<void>
  size?: 'default' | 'sm'
  className?: string
}

const ENABLED_STAGES: PipelineStage[] = ['specify', 'source', 'assemble', 'complete']

export function GetQuoteButton({
  projectId,
  pipelineStage,
  modules,
  diagnosticAnswers,
  designBrief,
  assumptionNotes,
  projectName,
  linkedRfqId,
  onRfqLinked,
  size = 'default',
  className,
}: GetQuoteButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  const isEnabled = ENABLED_STAGES.includes(pipelineStage)
  const specifiedModules = modules.filter(
    (m) => m.status === 'specified' || m.status === 'generated',
  )
  const hasModules = specifiedModules.length > 0

  // Already linked — show status badge instead
  if (linkedRfqId) {
    return (
      <Badge
        variant="success"
        className={cn('gap-1 cursor-pointer', className)}
        onClick={() => window.open(`/marketplace/rfqs/${linkedRfqId}`, '_blank')}
      >
        <ExternalLink className="h-3 w-3" />
        Quote Requested
      </Badge>
    )
  }

  const button = (
    <Button
      size={size}
      variant="default"
      disabled={!isEnabled || !hasModules}
      onClick={() => setIsOpen(true)}
      className={cn('gap-1.5', className)}
    >
      <FileText className="h-4 w-4" />
      Get Quote
    </Button>
  )

  return (
    <>
      {!isEnabled ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>{button}</span>
          </TooltipTrigger>
          <TooltipContent>
            Complete module diagnostics in Specify before requesting a quote.
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-international-orange" />
              Request Manufacturing Quote
            </DialogTitle>
          </DialogHeader>

          <CadLabRFQHandoff
            projectName={projectName}
            modules={specifiedModules}
            diagnosticAnswers={diagnosticAnswers}
            designBrief={designBrief as Record<string, unknown> | undefined}
            assumptionNotes={assumptionNotes}
            projectId={projectId ?? undefined}
            onRfqLinked={onRfqLinked}
            onSuccess={() => {
              setIsOpen(false)
              // INTENT: No toast here — CadLabRFQHandoff already shows one in handleSubmit.
              // No onRfqLinked call either — CadLabRFQHandoff handles that too.
            }}
            onCancel={() => setIsOpen(false)}
            className="border-0 shadow-none"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
