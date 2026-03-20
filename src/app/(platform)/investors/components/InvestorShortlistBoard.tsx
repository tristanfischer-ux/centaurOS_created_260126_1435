/**
 * @file InvestorShortlistBoard.tsx
 *
 * @description Kanban board showing shortlisted investors across 6 pipeline columns.
 * Drag-and-drop via @dnd-kit to move firms between stages.
 */

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, MapPin, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getShortlist, updateShortlistStage } from '@/actions/investors'
import { toast } from 'sonner'
import Link from 'next/link'
import type { InvestorFirm, ShortlistStage } from '@/actions/investors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShortlistItem = InvestorFirm & {
  shortlistStage: ShortlistStage
  shortlistUpdatedAt: string
}

const STAGES: { id: ShortlistStage; label: string; color: string }[] = [
  { id: 'researching', label: 'Researching', color: 'bg-muted' },
  { id: 'contacted', label: 'Contacted', color: 'bg-info/10' },
  { id: 'meeting', label: 'Meeting', color: 'bg-warning/10' },
  { id: 'in_discussion', label: 'In Discussion', color: 'bg-international-orange/10' },
  { id: 'closed_won', label: 'Closed Won', color: 'bg-success/10' },
  { id: 'closed_lost', label: 'Closed Lost', color: 'bg-destructive/10' },
]

// GOTCHA: closestCorners collision detection can resolve over.id to a draggable card UUID
// (not just a droppable column stage ID). Must validate before casting.
const VALID_STAGE_IDS = new Set<string>(STAGES.map(s => s.id))

// ---------------------------------------------------------------------------
// Droppable Column
// ---------------------------------------------------------------------------

function BoardColumn({
  stage,
  items,
  children,
}: {
  stage: typeof STAGES[number]
  items: ShortlistItem[]
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  return (
    <div className="flex flex-col min-w-[220px] max-w-[280px] flex-1">
      <div className={cn('rounded-t-lg px-3 py-2 border border-b-0 border-border', stage.color)}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">{stage.label}</span>
          <Badge variant="secondary" className="text-[10px] h-5 min-w-[20px] justify-center">
            {items.length}
          </Badge>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-b-lg border border-border p-2 space-y-2 min-h-[200px] transition-colors',
          isOver && 'bg-international-orange/5 border-international-orange/30'
        )}
      >
        {children}
        {items.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-8">
            Drag investors here
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Draggable Card
// ---------------------------------------------------------------------------

function DraggableCard({ item }: { item: ShortlistItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn('cursor-grab active:cursor-grabbing', isDragging && 'opacity-30')}
    >
      <CompactInvestorCard item={item} />
    </div>
  )
}

function CompactInvestorCard({ item, isDragOverlay }: { item: ShortlistItem; isDragOverlay?: boolean }) {
  const attrs = item.attributes
  return (
    <Card className={cn(
      'transition-all',
      isDragOverlay && 'shadow-lg rotate-2 scale-105'
    )}>
      <CardContent className="p-3 space-y-1.5">
        <Link
          href={`/investors/${item.id}`}
          className="text-sm font-medium text-foreground hover:text-international-orange transition-colors line-clamp-1"
          onClick={e => isDragOverlay && e.preventDefault()}
        >
          {item.title}
        </Link>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {attrs.firm_type && (
            <Badge variant="outline" className="text-[10px] py-0">{attrs.firm_type}</Badge>
          )}
          {attrs.hq_city && (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-2.5 w-2.5" />
              {attrs.hq_city}
            </span>
          )}
        </div>
        {attrs.fund_size_gbp != null && (
          <p className="text-[10px] text-muted-foreground">
            Fund: £{(attrs.fund_size_gbp / 1_000_000).toFixed(0)}M
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Board
// ---------------------------------------------------------------------------

export function InvestorShortlistBoard() {
  const [items, setItems] = useState<ShortlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeItem, setActiveItem] = useState<ShortlistItem | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Load shortlist on mount
  useEffect(() => {
    getShortlist()
      .then(({ items: data }) => {
        setItems(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('[InvestorShortlistBoard] Failed to load shortlist:', err)
        setLoading(false)
      })
  }, [])

  const itemsRef = useRef(items)
  itemsRef.current = items

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const item = itemsRef.current.find(i => i.id === event.active.id)
    if (item) setActiveItem(item)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveItem(null)
    const { active, over } = event
    if (!over) return

    // GOTCHA: closestCorners can resolve over.id to another draggable card's UUID,
    // not just a droppable column stage ID. Validate before using.
    let targetStage: ShortlistStage
    if (VALID_STAGE_IDS.has(over.id as string)) {
      targetStage = over.id as ShortlistStage
    } else {
      // over.id is a card UUID — find which stage column it belongs to
      const overItem = itemsRef.current.find(i => i.id === over.id)
      if (!overItem) return
      targetStage = overItem.shortlistStage
    }
    const itemId = active.id as string

    // Read previous stage from current state to avoid stale closure
    let previousStage: ShortlistStage | null = null
    setItems(prev => {
      const item = prev.find(i => i.id === itemId)
      if (!item || item.shortlistStage === targetStage) {
        previousStage = null
        return prev
      }
      previousStage = item.shortlistStage
      return prev.map(i => i.id === itemId ? { ...i, shortlistStage: targetStage } : i)
    })

    if (previousStage === null) return

    const { error } = await updateShortlistStage(itemId, targetStage)
    if (error) {
      // Revert using captured previousStage (not closure)
      const revertStage = previousStage
      setItems(prev => prev.map(i =>
        i.id === itemId ? { ...i, shortlistStage: revertStage } : i
      ))
      toast.error('Failed to move investor')
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent mx-auto" />
          <p className="text-sm">Loading your pipeline…</p>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
        <div className="rounded-full bg-muted p-4">
          <Heart className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-base font-semibold text-foreground">No investors shortlisted</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Click the heart icon on investor cards to start building your fundraise pipeline.
        </p>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map(stage => {
          const stageItems = items.filter(i => i.shortlistStage === stage.id)
          return (
            <BoardColumn key={stage.id} stage={stage} items={stageItems}>
              {stageItems.map(item => (
                <DraggableCard key={item.id} item={item} />
              ))}
            </BoardColumn>
          )
        })}
      </div>

      <DragOverlay>
        {activeItem ? <CompactInvestorCard item={activeItem} isDragOverlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}
