'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Heart,
  Clock,
  CheckCircle2,
  CheckSquare,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ObjectivePack } from '@/actions/packs'
import { savePack, unsavePack } from '@/actions/packs'
import { toast } from 'sonner'
import { UsePackDialog } from '@/components/blueprints/use-pack-dialog'
import { getDifficultyColor, getPackIcon } from './utils'

// ---------------------------------------------------------------------------
// PackCard – a single objective pack card.
// Click anywhere → opens UsePackDialog.  Heart button → save / unsave.
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string
  full_name: string
  role: string
  email: string
  avatar_url?: string | null
}

interface PackCardProps {
  pack: ObjectivePack
  isSaved?: boolean
  onSaveToggle?: (packId: string, isSaved: boolean) => void
  /** Short contextual line explaining why this pack is relevant to the user */
  whyTag?: string
  /** Team members available for task assignment */
  members?: TeamMember[]
  /** Whether this pack has already been used to create an objective in the current foundry */
  alreadyUsed?: boolean
}

export function PackCard({ pack, isSaved = false, onSaveToggle, whyTag, members = [], alreadyUsed = false }: PackCardProps) {
  const Icon = getPackIcon(pack.icon_name)
  const taskCount = pack.items?.length || 0
  const previewTasks = pack.items?.slice(0, 3) || []

  // Local optimistic saved state
  const [localSaved, setLocalSaved] = useState(isSaved)
  const [isSaving, setIsSaving] = useState(false)

  // Sync with parent when prop changes
  useEffect(() => { setLocalSaved(isSaved) }, [isSaved])

  const handleSaveToggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (isSaving) return

    setIsSaving(true)
    const next = !localSaved
    setLocalSaved(next) // optimistic

    try {
      const result = next ? await savePack(pack.id) : await unsavePack(pack.id)
      if (result.error) {
        setLocalSaved(!next)
        toast.error(result.error)
      } else {
        toast.success(next ? 'Saved to favorites' : 'Removed from favorites')
        onSaveToggle?.(pack.id, next)
      }
    } catch {
      setLocalSaved(!next)
      toast.error('Failed to update')
    } finally {
      setIsSaving(false)
    }
  }, [pack.id, localSaved, isSaving, onSaveToggle])

  // Dialog open state — controlled from this component to avoid nested interactive elements
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleCardClick = useCallback(() => {
    setDialogOpen(true)
  }, [])

  // ------------------------------------------------------------------

  return (
    <>
      <Card
        className="group relative flex flex-col h-full cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-electric-blue/40 hover:-translate-y-0.5"
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick() } }}
      >
        {/* ---- Save / heart button ---- */}
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={handleSaveToggle}
            disabled={isSaving}
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200',
              localSaved
                ? 'bg-international-orange/10 text-international-orange'
                : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-background/80 text-muted-foreground hover:text-international-orange border shadow-sm',
            )}
            title={localSaved ? 'Remove from saved' : 'Save for later'}
          >
            <Heart className={cn('w-4 h-4', localSaved && 'fill-current')} />
          </button>
        </div>

        {/* ---- Header: icon + badges ---- */}
        <CardHeader className="pb-3 pr-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-electric-blue/10 flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-electric-blue" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {pack.difficulty && (
                <Badge className={cn('text-[10px]', getDifficultyColor(pack.difficulty))}>
                  {pack.difficulty}
                </Badge>
              )}
              {alreadyUsed && (
                <Badge variant="secondary" className="text-[10px]">
                  Already used
                </Badge>
              )}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckSquare className="h-3 w-3" />
                {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
              </span>
            </div>
          </div>

          <CardTitle className="text-base leading-snug">{pack.title}</CardTitle>

          {pack.estimated_duration && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
              <Clock className="h-3 w-3" />
              <span>{pack.estimated_duration}</span>
            </div>
          )}
        </CardHeader>

        {/* ---- Body: description + why tag + sample tasks ---- */}
        <CardContent className="flex-1 flex flex-col pt-0">
          {pack.description && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
              {pack.description}
            </p>
          )}

          {whyTag && (
            <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-md bg-international-orange/5 border border-international-orange/10">
              <Sparkles className="h-3 w-3 text-international-orange shrink-0" />
              <span className="text-xs text-international-orange font-medium line-clamp-1">{whyTag}</span>
            </div>
          )}

          {previewTasks.length > 0 && (
            <div className="space-y-1.5 mb-4">
              {previewTasks.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-success shrink-0 mt-0.5" />
                  <span className="text-muted-foreground line-clamp-1">{item.title}</span>
                </div>
              ))}
              {taskCount > 3 && (
                <p className="text-xs text-muted-foreground italic pl-5">
                  +{taskCount - 3} more
                </p>
              )}
            </div>
          )}

          {/* ---- Footer CTA ---- */}
          <div className="mt-auto pt-3 border-t border-muted">
            <div className="flex items-center gap-2 text-sm font-medium text-electric-blue group-hover:text-electric-blue/80 transition-colors">
              Use This Pack
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </CardContent>
      </Card>

      <UsePackDialog
        pack={pack}
        members={members}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}
