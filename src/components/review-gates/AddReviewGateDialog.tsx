'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  ShieldCheck,
  Plus,
  Loader2,
  X,
  ExternalLink,
} from 'lucide-react'
import { createReviewGate } from '@/actions/review-gates'
import { toast } from 'sonner'
import Link from 'next/link'
import type { ReviewGateType } from '@/types/review-gates'
import { REVIEW_GATE_TYPES, SECTORS, SECTOR_LABELS } from '@/types/review-gates'

interface AddReviewGateDialogProps {
  taskId?: string
  objectiveId?: string
  teamMembers?: { id: string; full_name: string | null; role: string }[]
  onCreated?: () => void
  trigger?: React.ReactNode
}

export function AddReviewGateDialog({
  taskId,
  objectiveId,
  teamMembers = [],
  onCreated,
  trigger,
}: AddReviewGateDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [gateType, setGateType] = useState<ReviewGateType>('expert_review')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [reviewerId, setReviewerId] = useState<string>('')
  const [sector, setSector] = useState<string>('')
  const [skillInput, setSkillInput] = useState('')
  const [requiredSkills, setRequiredSkills] = useState<string[]>([])

  const resetForm = () => {
    setGateType('expert_review')
    setTitle('')
    setDescription('')
    setReviewerId('')
    setSector('')
    setSkillInput('')
    setRequiredSkills([])
  }

  const addSkill = () => {
    const trimmed = skillInput.trim()
    if (trimmed && !requiredSkills.includes(trimmed)) {
      setRequiredSkills([...requiredSkills, trimmed])
      setSkillInput('')
    }
  }

  const removeSkill = (skill: string) => {
    setRequiredSkills(requiredSkills.filter((s) => s !== skill))
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title for the review gate')
      return
    }

    setIsSubmitting(true)
    const { data, error } = await createReviewGate({
      task_id: taskId,
      objective_id: objectiveId,
      gate_type: gateType,
      title: title.trim(),
      description: description.trim() || undefined,
      required_skills: requiredSkills.length > 0 ? requiredSkills : undefined,
      sector: sector || undefined,
      reviewer_id: reviewerId || undefined,
    })
    setIsSubmitting(false)

    if (error) {
      toast.error('Failed to create review gate', { description: error })
    } else {
      toast.success('Review gate added', {
        description: `${REVIEW_GATE_TYPES.find((t) => t.value === gateType)?.label} gate created`,
      })
      resetForm()
      setOpen(false)
      onCreated?.()
    }
  }

  // Auto-generate title from gate type when empty
  const handleGateTypeChange = (value: ReviewGateType) => {
    setGateType(value)
    if (!title) {
      const typeConfig = REVIEW_GATE_TYPES.find((t) => t.value === value)
      if (typeConfig) setTitle(typeConfig.label)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Plus className="h-3 w-3" />
            Add Review Gate
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-status-info" />
            Add Review Gate
          </DialogTitle>
          <DialogDescription>
            Add a human review checkpoint. Work cannot proceed until the gate is approved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Gate Type */}
          <div className="space-y-1.5">
            <Label htmlFor="gate-type">Gate Type</Label>
            <Select value={gateType} onValueChange={(v) => handleGateTypeChange(v as ReviewGateType)}>
              <SelectTrigger id="gate-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVIEW_GATE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span>{type.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {type.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="gate-title">Title</Label>
            <Input
              id="gate-title"
              placeholder="e.g. DFM Expert Review"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="gate-description">Description (optional)</Label>
            <Textarea
              id="gate-description"
              placeholder="What should the reviewer check?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[60px]"
            />
          </div>

          {/* Sector */}
          <div className="space-y-1.5">
            <Label htmlFor="gate-sector">Sector (optional)</Label>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger id="gate-sector">
                <SelectValue placeholder="Select sector..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {SECTORS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SECTOR_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Required Skills */}
          <div className="space-y-1.5">
            <Label>Required Skills (optional)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. DFM Review"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSkill()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addSkill}
                className="shrink-0"
              >
                Add
              </Button>
            </div>
            {requiredSkills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {requiredSkills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-xs gap-1">
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      className="hover:text-destructive"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Reviewer Assignment */}
          <div className="space-y-1.5">
            <Label htmlFor="gate-reviewer">Assign Reviewer (optional)</Label>
            {teamMembers.length > 0 ? (
              <Select value={reviewerId} onValueChange={setReviewerId}>
                <SelectTrigger id="gate-reviewer">
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name || 'Unnamed'} ({m.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground flex-1">
                  No team members available
                </p>
                <Link href="/marketplace?tab=People">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <ExternalLink className="h-3 w-3" />
                    Hire Expert
                  </Button>
                </Link>
              </div>
            )}
            {!reviewerId && teamMembers.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                No internal expert?{' '}
                <Link href="/marketplace?tab=People" className="underline">
                  Find one on the Marketplace
                </Link>
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !title.trim()}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2" />
            )}
            Add Review Gate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
