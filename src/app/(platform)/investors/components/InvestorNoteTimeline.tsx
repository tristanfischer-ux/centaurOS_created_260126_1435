/**
 * @file InvestorNoteTimeline.tsx
 *
 * @description Vertical timeline of notes for an investor detail page.
 * Each note shows: type icon, content, and relative timestamp.
 * Includes an add-note form at the top with type selector + textarea.
 */

'use client'

import { useState, useCallback, useEffect, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StickyNote, Calendar, Mail, Phone, Flag, Plus, Loader2 } from 'lucide-react'
import { addInvestorNote, getInvestorNotes } from '@/actions/investors'
import { toast } from 'sonner'
import type { InvestorNote } from '@/actions/investors'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOTE_TYPE_CONFIG: Record<string, { icon: typeof StickyNote; label: string }> = {
  note: { icon: StickyNote, label: 'Note' },
  meeting: { icon: Calendar, label: 'Meeting' },
  email: { icon: Mail, label: 'Email' },
  call: { icon: Phone, label: 'Call' },
  milestone: { icon: Flag, label: 'Milestone' },
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface InvestorNoteTimelineProps {
  listingId: string
}

export function InvestorNoteTimeline({ listingId }: InvestorNoteTimelineProps) {
  const [notes, setNotes] = useState<InvestorNote[]>([])
  const [loading, setLoading] = useState(true)
  const [noteType, setNoteType] = useState('note')
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getInvestorNotes(listingId)
      .then(({ notes: data }) => {
        setNotes(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('[InvestorNoteTimeline] Failed to load notes:', err)
        setLoading(false)
      })
  }, [listingId])

  const handleAdd = useCallback(() => {
    if (!content.trim()) return
    startTransition(async () => {
      const { error } = await addInvestorNote(listingId, content.trim(), noteType)
      if (error) {
        toast.error(error)
        return
      }
      toast.success('Note added')
      setContent('')
      // Refresh notes
      try {
        const { notes: fresh } = await getInvestorNotes(listingId)
        setNotes(fresh)
      } catch (err) {
        console.error('[InvestorNoteTimeline] Failed to refresh notes:', err)
      }
    })
  }, [listingId, content, noteType])

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          Notes & Activity
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add note form */}
        <div className="space-y-3 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Select value={noteType} onValueChange={setNoteType}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(NOTE_TYPE_CONFIG).map(([key, { label }]) => (
                  <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            placeholder="Add a note, meeting summary, or milestone..."
            value={content}
            onChange={e => setContent(e.target.value)}
            className="text-sm min-h-[60px] resize-none"
            maxLength={5000}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{content.length}/5000</span>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!content.trim() || isPending}
              className="text-xs"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1" />
              )}
              Add note
            </Button>
          </div>
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No notes yet. Add your first note above.
          </p>
        ) : (
          <div className="space-y-0">
            {notes.map((note, i) => {
              const config = NOTE_TYPE_CONFIG[note.note_type] ?? NOTE_TYPE_CONFIG.note
              const Icon = config.icon
              return (
                <div key={note.id} className="flex gap-3 group">
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    {i < notes.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="pb-4 flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-foreground">{config.label}</span>
                      <span className="text-[10px] text-muted-foreground">{relativeTime(note.created_at)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {note.content}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
