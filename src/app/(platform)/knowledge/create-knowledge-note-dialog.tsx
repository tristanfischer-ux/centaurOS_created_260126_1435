'use client'

/**
 * CreateKnowledgeNoteDialog — Dialog for manually adding knowledge.
 *
 * @description Allows users to add knowledge notes manually (not extracted
 * from specialist conversations). Simple form with title, content, type,
 * domain, and tags.
 *
 * @component
 */

import React, { useState } from 'react'
import {
  Quote,
  Gavel,
  Lightbulb,
  CheckCircle2,
  Heart,
  GraduationCap,
  Eye,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createNote } from '@/actions/knowledge'
import type { KnowledgeDomain, KnowledgeNoteType } from '@/lib/knowledge-vault/types'

const NOTE_TYPES: Array<{
  value: KnowledgeNoteType
  label: string
  description: string
  icon: React.ReactNode
}> = [
  { value: 'insight', label: 'Insight', description: 'An analytical finding or synthesis', icon: <Lightbulb className="h-4 w-4" /> },
  { value: 'decision', label: 'Decision', description: 'A choice that was made with rationale', icon: <Gavel className="h-4 w-4" /> },
  { value: 'fact', label: 'Fact', description: 'A verified piece of information', icon: <CheckCircle2 className="h-4 w-4" /> },
  { value: 'claim', label: 'Claim', description: 'A factual assertion about business/market', icon: <Quote className="h-4 w-4" /> },
  { value: 'lesson', label: 'Lesson', description: 'Something learned from experience', icon: <GraduationCap className="h-4 w-4" /> },
  { value: 'observation', label: 'Observation', description: 'A pattern or trend noticed', icon: <Eye className="h-4 w-4" /> },
  { value: 'preference', label: 'Preference', description: 'An organizational preference', icon: <Heart className="h-4 w-4" /> },
]

interface CreateKnowledgeNoteDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Called when the dialog should close */
  onOpenChange: (open: boolean) => void
  /** Available domains */
  domains: KnowledgeDomain[]
  /** Called after a note is created */
  onCreated: () => void
}

export function CreateKnowledgeNoteDialog({
  open,
  onOpenChange,
  domains,
  onCreated,
}: CreateKnowledgeNoteDialogProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [description, setDescription] = useState('')
  const [noteType, setNoteType] = useState<KnowledgeNoteType>('insight')
  const [domainId, setDomainId] = useState<string | null>(null)
  const [tagsInput, setTagsInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setError(null)

    // VALIDATION: Title is required
    if (!title.trim()) {
      setError('Please enter a title for this knowledge note.')
      return
    }

    // VALIDATION: Content is required
    if (!content.trim()) {
      setError('Please enter the content of this knowledge note.')
      return
    }

    setIsSubmitting(true)

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)

    const result = await createNote({
      title: title.trim(),
      content: content.trim(),
      description: description.trim() || undefined,
      note_type: noteType,
      domain_id: domainId,
      tags,
    })

    setIsSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    // Reset form
    setTitle('')
    setContent('')
    setDescription('')
    setNoteType('insight')
    setDomainId(null)
    setTagsInput('')
    setError(null)

    onCreated()
  }

  const handleClose = () => {
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add Knowledge</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="note-title">
              Title <span className="text-destructive" aria-label="required">*</span>
            </Label>
            <Input
              id="note-title"
              placeholder="e.g., Our target market is mid-market SaaS companies"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              aria-required
            />
            <p className="text-xs text-muted-foreground">
              {title.length} / 200 characters
            </p>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="note-content">
              Content <span className="text-destructive" aria-label="required">*</span>
            </Label>
            <Textarea
              id="note-content"
              placeholder="What should be remembered? Include specifics: numbers, names, dates, rationale..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              maxLength={2000}
              aria-required
            />
            <p className="text-xs text-muted-foreground">
              {content.length} / 2000 characters
            </p>
          </div>

          {/* Description (optional) */}
          <div className="space-y-2">
            <Label htmlFor="note-description">
              Summary <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="note-description"
              placeholder="One-line summary for quick scanning"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Type */}
            <div className="space-y-2">
              <Label htmlFor="note-type">Type</Label>
              <Select value={noteType} onValueChange={(v) => setNoteType(v as KnowledgeNoteType)}>
                <SelectTrigger id="note-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        {t.icon}
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Domain */}
            <div className="space-y-2">
              <Label htmlFor="note-domain">Domain</Label>
              <Select
                value={domainId ?? 'none'}
                onValueChange={(v) => setDomainId(v === 'none' ? null : v)}
              >
                <SelectTrigger id="note-domain">
                  <SelectValue placeholder="Select domain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No domain</SelectItem>
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="note-tags">
              Tags <span className="text-muted-foreground text-xs">(comma-separated)</span>
            </Label>
            <Input
              id="note-tags"
              placeholder="e.g., pricing, strategy, q1-2026"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Knowledge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
