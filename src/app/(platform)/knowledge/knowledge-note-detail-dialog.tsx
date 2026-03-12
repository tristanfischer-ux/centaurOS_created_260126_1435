'use client'

/**
 * KnowledgeNoteDetailDialog — Full detail view for a knowledge note.
 *
 * @description Shows the complete note content, metadata, provenance,
 * connected notes, and quick actions. Supports inline edit-on-verify,
 * task creation, and contradiction flagging.
 *
 * @component
 */

import React, { useState, useEffect } from 'react'
import {
  Pin,
  CheckCircle2,
  Eye,
  Link2,
  Archive,
  Quote,
  Gavel,
  Lightbulb,
  Heart,
  GraduationCap,
  Clock,
  User,
  Sparkles,
  ExternalLink,
  ArrowRight,
  Pencil,
  ListTodo,
  Flag,
  Search,
  X,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  fetchKnowledgeNoteDetail,
  fetchKnowledgeNotes,
  verifyAndUpdateNote,
  linkNotes,
} from '@/actions/knowledge'
import type {
  KnowledgeNote,
  KnowledgeLinkWithNote,
  KnowledgeNoteType,
  KnowledgeLinkRelationship,
} from '@/lib/knowledge-vault/types'

// ─── Type labels ─────────────────────────────────────────────────────

const TYPE_LABELS: Record<KnowledgeNoteType, { label: string; icon: React.ReactNode; color: string }> = {
  claim: { label: 'Claim', icon: <Quote className="h-4 w-4" />, color: 'text-status-info' },
  decision: { label: 'Decision', icon: <Gavel className="h-4 w-4" />, color: 'text-status-warning' },
  insight: { label: 'Insight', icon: <Lightbulb className="h-4 w-4" />, color: 'text-chart-5' },
  fact: { label: 'Fact', icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-status-success' },
  preference: { label: 'Preference', icon: <Heart className="h-4 w-4" />, color: 'text-chart-6' },
  lesson: { label: 'Lesson', icon: <GraduationCap className="h-4 w-4" />, color: 'text-international-orange' },
  observation: { label: 'Observation', icon: <Eye className="h-4 w-4" />, color: 'text-muted-foreground' },
}

const RELATIONSHIP_LABELS: Record<KnowledgeLinkRelationship, string> = {
  related: 'Related to',
  supports: 'Supports',
  contradicts: 'Contradicts',
  extends: 'Extends',
  supersedes: 'Supersedes',
  caused_by: 'Caused by',
  led_to: 'Led to',
}

const SPECIALIST_NAMES: Record<string, string> = {
  'strategist': 'Sage (Strategy)',
  'cto': 'Max (CTO)',
  'vp-engineering': 'Jian (VP Engineering)',
  'vp-manufacturing': 'Fang (VP Manufacturing)',
  'vp-supply-chain': 'Chase (VP Supply Chain)',
  'product-lead': 'Priya (Product)',
  'growth-marketer': 'Mia (Marketing)',
  'sales-lead': 'Sal (Sales)',
  'chief-of-staff': 'Cal (Chief of Staff)',
  'finance-lead': 'Finn (Finance)',
  'fundraising-advisor': 'Fiona (Fundraising)',
  'hiring-team': 'Harper (People)',
  'legal-counsel': 'Leo (Legal)',
}

const ALL_NOTE_TYPES: KnowledgeNoteType[] = [
  'claim', 'decision', 'insight', 'fact', 'preference', 'lesson', 'observation',
]

interface KnowledgeNoteDetailDialogProps {
  /** The note ID to display */
  noteId: string
  /** Whether the dialog is open */
  open: boolean
  /** Called when the dialog should close */
  onOpenChange: (open: boolean) => void
  /** Called when pin is toggled */
  onPin: (noteId: string, pinned: boolean) => void
  /** Called when verify is toggled */
  onVerify: (noteId: string, verified: boolean) => void
  /** Called when archive is triggered */
  onArchive: (noteId: string) => void
  /** Called when note is updated (for refresh) */
  onUpdate: () => void
  /** Current user ID */
  userId: string
}

export function KnowledgeNoteDetailDialog({
  noteId,
  open,
  onOpenChange,
  onPin,
  onVerify,
  onArchive,
  onUpdate,
  userId,
}: KnowledgeNoteDetailDialogProps) {
  const [note, setNote] = useState<KnowledgeNote | null>(null)
  const [links, setLinks] = useState<KnowledgeLinkWithNote[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Edit-on-verify state
  const [isEditMode, setIsEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editType, setEditType] = useState<KnowledgeNoteType>('claim')
  const [isSaving, setIsSaving] = useState(false)

  // Contradiction flagging state
  const [showContradictionSearch, setShowContradictionSearch] = useState(false)
  const [contradictionQuery, setContradictionQuery] = useState('')
  const [contradictionResults, setContradictionResults] = useState<Array<{ id: string; title: string; note_type: KnowledgeNoteType }>>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    if (open && noteId) {
      setIsLoading(true)
      setIsEditMode(false)
      setShowContradictionSearch(false)
      fetchKnowledgeNoteDetail(noteId).then((result) => {
        if (result.data) {
          setNote(result.data.note)
          setLinks(result.data.links)
        }
        setIsLoading(false)
      })
    }
  }, [open, noteId])

  if (!open) return null

  const typeInfo = note ? TYPE_LABELS[note.note_type] : null

  // ─── Edit-on-Verify Handlers ────────────────────────────────────

  const enterEditMode = () => {
    if (!note) return
    setEditTitle(note.title)
    setEditContent(note.content)
    setEditType(note.note_type)
    setIsEditMode(true)
  }

  const handleConfirmAndVerify = async () => {
    if (!note) return
    setIsSaving(true)
    const result = await verifyAndUpdateNote(note.id, {
      title: editTitle,
      content: editContent,
      note_type: editType,
    })
    setIsSaving(false)

    if (result.data) {
      setNote(result.data)
      setIsEditMode(false)
      toast.success('Note verified and updated')
      onUpdate()
    } else {
      toast.error(result.error ?? 'Failed to verify note')
    }
  }

  // ─── Contradiction Search Handlers ──────────────────────────────

  const searchForContradiction = async () => {
    if (!contradictionQuery.trim()) return
    setIsSearching(true)
    const result = await fetchKnowledgeNotes({
      filters: {
        searchQuery: contradictionQuery,
        includeArchived: false,
      },
      pageSize: 10,
      sortBy: 'created_at',
      sortOrder: 'desc',
    })
    setIsSearching(false)

    if (result.data) {
      setContradictionResults(
        result.data.notes
          .filter((n) => n.id !== noteId)
          .map((n) => ({ id: n.id, title: n.title, note_type: n.note_type }))
      )
    }
  }

  const handleFlagContradiction = async (targetId: string) => {
    const result = await linkNotes(noteId, targetId, 'contradicts', 'User-flagged contradiction')
    if (!result.error) {
      toast.success('Contradiction flagged')
      setShowContradictionSearch(false)
      setContradictionQuery('')
      setContradictionResults([])
      // Refresh links
      const detail = await fetchKnowledgeNoteDetail(noteId)
      if (detail.data) {
        setLinks(detail.data.links)
      }
      onUpdate()
    } else {
      toast.error(result.error)
    }
  }

  // ─── Create Task Handler ────────────────────────────────────────

  const handleCreateTask = () => {
    if (!note) return
    const params = new URLSearchParams({
      create: 'true',
      title: `Review: ${note.title}`,
      description: note.content,
    })
    window.open(`/the-forge/tasks?${params.toString()}`, '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh]" aria-describedby={undefined}>
        {isLoading || !note ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 min-w-0 flex-1">
                  {/* Type badge */}
                  {typeInfo && (
                    <div className="flex items-center gap-2">
                      <span className={cn('flex items-center gap-1.5', typeInfo.color)}>
                        {typeInfo.icon}
                        <span className="text-sm font-medium">{typeInfo.label}</span>
                      </span>
                      {note.is_verified && (
                        <Badge variant="success" className="text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      )}
                      {note.is_pinned && (
                        <Badge variant="warning" className="text-xs">
                          <Pin className="h-3 w-3 mr-1" />
                          Pinned
                        </Badge>
                      )}
                    </div>
                  )}
                  {isEditMode ? (
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="text-xl font-semibold"
                    />
                  ) : (
                    <DialogTitle className="text-xl leading-tight">
                      {note.title}
                    </DialogTitle>
                  )}
                  {!isEditMode && note.description && (
                    <p className="text-sm text-muted-foreground">{note.description}</p>
                  )}
                </div>
              </div>
            </DialogHeader>

            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-6 pr-4">
                {/* Content */}
                {isEditMode ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={6}
                      className="text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Type:</span>
                      <Select value={editType} onValueChange={(v) => setEditType(v as KnowledgeNoteType)}>
                        <SelectTrigger className="w-[160px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_NOTE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {TYPE_LABELS[t].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none">
                    <div className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                      {note.content}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {!isEditMode && note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {note.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs font-mono">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <Separator />

                {/* Provenance */}
                <div className="space-y-3">
                  <h4 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    Provenance
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {note.source_specialist && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>
                          {SPECIALIST_NAMES[note.source_specialist] ?? note.source_specialist}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {new Date(note.created_at).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" />
                      <span>
                        Confidence: {Math.round(note.confidence * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Link2 className="h-3.5 w-3.5" />
                      <span>
                        {note.link_count} {note.link_count === 1 ? 'connection' : 'connections'}
                      </span>
                    </div>
                    {note.is_verified && note.verified_at && (
                      <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                        <span>
                          Verified on{' '}
                          {new Date(note.verified_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Connected Notes */}
                {links.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                        Connected Knowledge ({links.length})
                      </h4>
                      <div className="space-y-2">
                        {links.map((link) => {
                          const isOutgoing = link.source_note_id === noteId
                          const connectedNote = link.connected_note
                          const connectedTypeInfo = TYPE_LABELS[connectedNote.note_type]

                          return (
                            <div
                              key={link.id}
                              className="flex items-start gap-3 p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                            >
                              <div className={cn('mt-0.5', connectedTypeInfo.color)}>
                                {connectedTypeInfo.icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    {isOutgoing
                                      ? RELATIONSHIP_LABELS[link.relationship]
                                      : `← ${RELATIONSHIP_LABELS[link.relationship]}`}
                                  </span>
                                </div>
                                <p className="text-sm font-medium text-foreground line-clamp-1">
                                  {connectedNote.title}
                                </p>
                                {connectedNote.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                    {connectedNote.description}
                                  </p>
                                )}
                              </div>
                              {connectedNote.is_verified && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-status-success flex-shrink-0" />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* Contradiction Search */}
                {showContradictionSearch && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                          Flag Contradiction
                        </h4>
                        <button
                          onClick={() => { setShowContradictionSearch(false); setContradictionResults([]) }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Search for contradicting note..."
                            value={contradictionQuery}
                            onChange={(e) => setContradictionQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') searchForContradiction() }}
                            className="pl-9 h-9 text-sm"
                          />
                        </div>
                        <Button size="sm" onClick={searchForContradiction} disabled={isSearching}>
                          {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Search'}
                        </Button>
                      </div>
                      {contradictionResults.length > 0 && (
                        <div className="space-y-1">
                          {contradictionResults.map((result) => {
                            const resultTypeInfo = TYPE_LABELS[result.note_type]
                            return (
                              <button
                                key={result.id}
                                onClick={() => handleFlagContradiction(result.id)}
                                className="flex items-center gap-2 w-full text-left p-2 rounded-md hover:bg-muted transition-colors text-sm"
                              >
                                <span className={resultTypeInfo.color}>{resultTypeInfo.icon}</span>
                                <span className="text-foreground truncate flex-1">{result.title}</span>
                                <Flag className="h-3 w-3 text-destructive flex-shrink-0" />
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>

            {/* Actions Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-1 sm:gap-2">
                {isEditMode ? (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleConfirmAndVerify}
                      disabled={isSaving || !editTitle.trim()}
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                      Confirm & Verify
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditMode(false)}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onPin(note.id, !note.is_pinned)
                        setNote({ ...note, is_pinned: !note.is_pinned })
                      }}
                      className={cn(
                        note.is_pinned && 'text-international-orange'
                      )}
                    >
                      <Pin className={cn('h-4 w-4 mr-1.5', note.is_pinned && 'fill-current')} />
                      {note.is_pinned ? 'Unpin' : 'Pin'}
                    </Button>

                    {!note.is_verified ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={enterEditMode}
                      >
                        <Pencil className="h-4 w-4 mr-1.5" />
                        Verify & Edit
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onVerify(note.id, false)
                          setNote({ ...note, is_verified: false, verified_at: null })
                        }}
                        className="text-status-success"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        Unverify
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCreateTask}
                    >
                      <ListTodo className="h-4 w-4 mr-1.5" />
                      Create Task
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowContradictionSearch(true)}
                    >
                      <Flag className="h-4 w-4 mr-1.5" />
                      Flag Contradiction
                    </Button>
                  </>
                )}
              </div>

              {!isEditMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onArchive(note.id)
                    onOpenChange(false)
                  }}
                  className="text-destructive hover:text-destructive"
                >
                  <Archive className="h-4 w-4 mr-1.5" />
                  Archive
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
