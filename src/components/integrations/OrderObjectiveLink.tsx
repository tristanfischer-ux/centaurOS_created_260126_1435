'use client'

/**
 * OrderObjectiveLink Component
 * Link orders to objectives for tracking and spend visibility
 */

import { useState, useEffect } from 'react'
import { Target, Link2, Unlink, Loader2, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  linkOrderToObjective,
  unlinkOrderFromObjective,
  getIntegrationSuggestions,
} from '@/actions/integrations'

interface Objective {
  id: string
  title: string
  description?: string | null
}

interface ObjectiveSuggestion {
  id: string
  title: string
  description: string | null
  matchScore: number
  matchReason: string
}

interface OrderObjectiveLinkProps {
  orderId: string
  currentObjective?: {
    id: string
    title: string
  } | null
  objectives: Objective[]
  onLinkChange?: (objectiveId: string | null) => void
}

export function OrderObjectiveLink({
  orderId,
  currentObjective,
  objectives,
  onLinkChange,
}: OrderObjectiveLinkProps) {
  const [linkedObjective, setLinkedObjective] = useState(currentObjective)
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string>('')
  const [suggestions, setSuggestions] = useState<ObjectiveSuggestion[]>([])
  const [isLinking, setIsLinking] = useState(false)
  const [isUnlinking, setIsUnlinking] = useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)

  // Load suggestions when no objective is linked
  useEffect(() => {
    const fetchSuggestions = async () => {
      setIsLoadingSuggestions(true)
      try {
        const result = await getIntegrationSuggestions(orderId)
        if (result.objectiveSuggestions) {
          setSuggestions(result.objectiveSuggestions)
        }
      } catch (err) {
        console.error('Failed to load suggestions:', err)
      } finally {
        setIsLoadingSuggestions(false)
      }
    }

    if (!linkedObjective) {
      fetchSuggestions()
    }
  }, [linkedObjective, orderId])

  const handleLink = async (objectiveId: string) => {
    if (!objectiveId) return

    setIsLinking(true)
    try {
      const result = await linkOrderToObjective(orderId, objectiveId)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      const objective = objectives.find(o => o.id === objectiveId)
      if (objective) {
        setLinkedObjective({ id: objective.id, title: objective.title })
        onLinkChange?.(objectiveId)
        toast.success('Order linked to objective')
      }
    } catch (error) {
      toast.error('Failed to link order to objective')
    } finally {
      setIsLinking(false)
      setSelectedObjectiveId('')
    }
  }

  const handleUnlink = async () => {
    setIsUnlinking(true)
    try {
      const result = await unlinkOrderFromObjective(orderId)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }

      setLinkedObjective(null)
      onLinkChange?.(null)
      toast.success('Order unlinked from objective')
    } catch (error) {
      toast.error('Failed to unlink order')
    } finally {
      setIsUnlinking(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Objective Link</CardTitle>
        </div>
        <CardDescription>
          Link this order to an objective for spend tracking and progress
        </CardDescription>
      </CardHeader>
      <CardContent>
        {linkedObjective ? (
          // Show linked objective
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <Link2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{linkedObjective.title}</p>
                  <p className="text-xs text-muted-foreground">Linked objective</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUnlink}
                disabled={isUnlinking}
              >
                {isUnlinking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This order&apos;s spend will be tracked under this objective.
            </p>
          </div>
        ) : (
          // Show selection UI
          <div className="space-y-4">
            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Suggested objectives</span>
                </div>
                <div className="space-y-2">
                  {suggestions.slice(0, 3).map((suggestion) => (
                    <button
                      key={suggestion.id}
                      onClick={() => handleLink(suggestion.id)}
                      disabled={isLinking}
                      className="w-full text-left p-2 border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{suggestion.title}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {suggestion.matchScore}% match
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {suggestion.matchReason}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isLoadingSuggestions && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Finding matching objectives...</span>
              </div>
            )}

            {/* Manual selection */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Or select manually:</p>
              <div className="flex gap-2">
                <Select
                  value={selectedObjectiveId}
                  onValueChange={setSelectedObjectiveId}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select objective..." />
                  </SelectTrigger>
                  <SelectContent>
                    {objectives.map((objective) => (
                      <SelectItem key={objective.id} value={objective.id}>
                        {objective.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => handleLink(selectedObjectiveId)}
                  disabled={!selectedObjectiveId || isLinking}
                  size="default"
                >
                  {isLinking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
