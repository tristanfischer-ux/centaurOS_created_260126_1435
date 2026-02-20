'use client'

import { useState } from 'react'
import { CheckCircle2, GitMerge, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { applyMergeReview } from '@/actions/business-plan'
import { toast } from 'sonner'
import type { MergeReviewState, ObjectiveMergeSuggestion, MergeDisposition } from '@/lib/business-plan-types'

interface MergeReviewDialogProps {
  open: boolean
  mergeState: MergeReviewState
  onClose: () => void
  onApplied: () => void
}

/**
 * @description Smart merge review dialog. Shows AI-suggested objectives compared
 * against existing ones, letting the user adopt, merge, or skip each suggestion.
 */
export function MergeReviewDialog({ open, mergeState, onClose, onApplied }: MergeReviewDialogProps) {
  const [suggestions, setSuggestions] = useState(mergeState.objectiveSuggestions)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  const adopted = suggestions.filter(s => s.disposition === 'adopt').length
  const merged = suggestions.filter(s => s.disposition === 'merge').length
  const skipped = suggestions.filter(s => s.disposition === 'skip').length

  function setDisposition(id: string, disposition: MergeDisposition): void {
    setSuggestions(prev =>
      prev.map(s => s.id === id ? { ...s, disposition } : s)
    )
  }

  async function handleApply(): Promise<void> {
    setApplying(true)
    const finalState = { ...mergeState, objectiveSuggestions: suggestions }
    const result = await applyMergeReview(finalState)
    setApplying(false)

    if (result.error) {
      toast.error('Failed to apply changes', { description: result.error })
      return
    }

    toast.success('Strategy updated', {
      description: `${adopted} new objective${adopted !== 1 ? 's' : ''} created, ${merged} merged with existing.`,
    })
    onApplied()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Review Business Plan Suggestions</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Your business plan suggests {suggestions.length} strategic objectives.
            Review each and choose how to handle it.
          </p>
        </DialogHeader>

        <div className="flex items-center gap-4 px-3 py-2 bg-muted/40 rounded-lg text-sm">
          <span className="flex items-center gap-1.5 text-status-success font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {adopted} new
          </span>
          <span className="flex items-center gap-1.5 text-status-info font-medium">
            <GitMerge className="h-4 w-4" />
            {merged} merge
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <X className="h-4 w-4" />
            {skipped} skip
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            +{mergeState.hiringRequirements.length} hires · +{mergeState.fundingRequirements.length} funding events
          </span>
        </div>

        <ScrollArea className="max-h-[52vh] pr-2">
          <div className="space-y-3">
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                expanded={expandedId === s.id}
                onToggleExpand={() => setExpandedId(prev => prev === s.id ? null : s.id)}
                onDisposition={(d) => setDisposition(s.id, d)}
              />
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply} disabled={applying}>
            {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply {adopted + merged} change{adopted + merged !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SuggestionCard({
  suggestion,
  expanded,
  onToggleExpand,
  onDisposition,
}: {
  suggestion: ObjectiveMergeSuggestion
  expanded: boolean
  onToggleExpand: () => void
  onDisposition: (d: MergeDisposition) => void
}): React.JSX.Element {
  const { aiObjective, existingObjectiveTitle, disposition } = suggestion

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all',
        disposition === 'skip' && 'opacity-50',
        disposition === 'adopt' && 'border-status-success/40 bg-status-success-light/20',
        disposition === 'merge' && 'border-status-info/40 bg-status-info-light/20',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground text-sm">{aiObjective.title}</p>
          {aiObjective.phase && (
            <p className="text-xs text-muted-foreground mt-0.5">Phase: {aiObjective.phase}</p>
          )}
          {existingObjectiveTitle && (
            <p className="text-xs text-status-info mt-1">
              Similar to existing: &ldquo;{existingObjectiveTitle}&rdquo;
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <DispositionButton
            active={disposition === 'adopt'}
            onClick={() => onDisposition('adopt')}
            label="New"
            color="success"
          />
          {existingObjectiveTitle && (
            <DispositionButton
              active={disposition === 'merge'}
              onClick={() => onDisposition('merge')}
              label="Merge"
              color="info"
            />
          )}
          <DispositionButton
            active={disposition === 'skip'}
            onClick={() => onDisposition('skip')}
            label="Skip"
            color="neutral"
          />
          <button
            onClick={onToggleExpand}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-sm text-muted-foreground">{aiObjective.description}</p>
          <p className="text-xs font-medium text-foreground">{aiObjective.tasks.length} tasks:</p>
          <ul className="space-y-1">
            {aiObjective.tasks.map((task, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] shrink-0 mt-0.5">{task.role}</Badge>
                <span>{task.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DispositionButton({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  color: 'success' | 'info' | 'neutral'
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
        active && color === 'success' && 'bg-status-success-light text-status-success border-status-success/30',
        active && color === 'info' && 'bg-status-info-light text-status-info border-status-info/30',
        active && color === 'neutral' && 'bg-muted text-muted-foreground border-border',
        !active && 'bg-transparent text-muted-foreground border-transparent hover:border-border hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}
