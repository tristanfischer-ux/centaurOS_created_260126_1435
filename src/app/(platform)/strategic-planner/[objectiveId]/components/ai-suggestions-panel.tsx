"use client"

/**
 * @description AI Suggestions panel with contextual recommendations
 * that can be applied with one click or dismissed.
 */

import { useState } from "react"
import { Sparkles, X, Check, XCircle, Plus, UserPlus, ShoppingBag, Clock, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { updateStrategicGoalMeta } from "@/actions/strategic-planner"
import type { AISuggestion, SuggestionType } from "@/types/strategic-planner"

interface AISuggestionsPanelProps {
  suggestions: AISuggestion[]
  objectiveId: string
  onRefresh: () => void
  onClose: () => void
}

const TYPE_ICONS = {
  add_task: Plus,
  assign_person: UserPlus,
  hire_resource: ShoppingBag,
  timeline_warning: Clock,
  dependency: Link2,
} satisfies Record<SuggestionType, React.ElementType>

const TYPE_LABELS = {
  add_task: 'Add Task',
  assign_person: 'Assign',
  hire_resource: 'Hire',
  timeline_warning: 'Warning',
  dependency: 'Dependency',
} satisfies Record<SuggestionType, string>

export function AISuggestionsPanel({
  suggestions,
  objectiveId,
  onRefresh,
  onClose,
}: AISuggestionsPanelProps) {
  const [dismissing, setDismissing] = useState<string | null>(null)
  const activeSuggestions = suggestions.filter((s) => !s.dismissed)

  async function handleDismiss(suggestionId: string): Promise<void> {
    setDismissing(suggestionId)

    const updated = suggestions.map((s) =>
      s.id === suggestionId ? { ...s, dismissed: true } : s
    )

    await updateStrategicGoalMeta(objectiveId, { ai_suggestions: updated })
    onRefresh()
    setDismissing(null)
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-electric-blue" />
          <h3 className="text-sm font-semibold text-foreground">AI Suggestions</h3>
          <span className="text-xs text-muted-foreground">({activeSuggestions.length})</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close suggestions panel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-2">
        {activeSuggestions.map((suggestion) => {
          const Icon = TYPE_ICONS[suggestion.type] || Plus
          const label = TYPE_LABELS[suggestion.type] || 'Suggestion'
          const isDismissing = dismissing === suggestion.id

          return (
            <Card key={suggestion.id} className="border">
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-electric-blue/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-3.5 h-3.5 text-electric-blue" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold text-electric-blue uppercase tracking-wider">
                        {label}
                      </span>
                      {suggestion.relatedPhase && (
                        <span className="text-[10px] text-muted-foreground">
                          &middot; {suggestion.relatedPhase}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">
                      {suggestion.message}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDismiss(suggestion.id)}
                      disabled={isDismissing}
                      aria-label="Dismiss suggestion"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {activeSuggestions.length === 0 && (
        <div className="text-center py-6">
          <Check className="h-6 w-6 text-status-success mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">All suggestions addressed</p>
        </div>
      )}
    </div>
  )
}
