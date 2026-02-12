'use client'

/**
 * ActOnThisButton - Reusable CTA that opens the QuickCaptureDialog with context.
 *
 * @description Drop this button on any browsing surface (marketplace, blueprints,
 * agents, etc.) to let users instantly turn what they see into an objective or task.
 * Pre-fills the capture dialog with entity context for smarter AI refinement.
 *
 * @component
 *
 * @example
 * <ActOnThisButton
 *   context={{ source: 'marketplace', entityTitle: 'SEO Expert', entityDescription: 'Full-stack SEO...' }}
 *   variant="subtle"
 * />
 */

import { useState, useCallback } from 'react'
import { Plus, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { QuickCaptureDialog } from '@/components/smart/quick-capture-dialog'
import { cn } from '@/lib/utils'

import type { SmartGoalContext, SmartGoalSuggestion } from '@/actions/smart-goals'

interface ActOnThisButtonProps {
  /** Context about what the user is looking at */
  context: SmartGoalContext
  /** Visual style: "prominent" for primary CTA, "subtle" for secondary */
  variant?: 'prominent' | 'subtle'
  /** Button label override */
  label?: string
  /** Additional CSS classes */
  className?: string
}

export function ActOnThisButton({
  context,
  variant = 'subtle',
  label,
  className,
}: ActOnThisButtonProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  const defaultLabel = label || 'Act on this'

  /** When user creates an objective from the capture dialog */
  const handleCreateObjective = useCallback(
    (rawIdea: string, suggestion?: SmartGoalSuggestion) => {
      // Navigate to objectives page with prefill
      const prefillText = suggestion?.title || rawIdea
      router.push(`/new-objectives?prefill=${encodeURIComponent(prefillText)}`)
    },
    [router]
  )

  /** When user creates a task from the capture dialog */
  const handleCreateTask = useCallback(
    (rawIdea: string, suggestion?: SmartGoalSuggestion) => {
      // Navigate to tasks page with prefill
      const prefillText = suggestion?.title || rawIdea
      router.push(`/new-tasks?prefill=${encodeURIComponent(prefillText)}`)
    },
    [router]
  )

  // Build pre-fill text from context
  const prefillText = context.entityTitle
    ? `${context.entityTitle}${context.entityDescription ? ` — ${context.entityDescription.slice(0, 200)}` : ''}`
    : ''

  return (
    <>
      <Button
        variant={variant === 'prominent' ? 'default' : 'ghost'}
        size="sm"
        className={cn(
          variant === 'subtle' && 'text-muted-foreground hover:text-foreground',
          variant === 'prominent' && 'bg-international-orange hover:bg-international-orange-hover',
          className
        )}
        onClick={() => setIsOpen(true)}
      >
        {variant === 'prominent' ? (
          <Zap className="h-3.5 w-3.5" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        {defaultLabel}
      </Button>

      <QuickCaptureDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        context={context}
        prefillText={prefillText}
        onCreateObjective={handleCreateObjective}
        onCreateTask={handleCreateTask}
      />
    </>
  )
}
