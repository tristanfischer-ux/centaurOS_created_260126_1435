'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { UserAvatar } from '@/components/ui/user-avatar'
import { CoverageIndicator } from './coverage-indicator'
import type { DomainCoverageWithDetails, CoverageStatus, Expertise } from '@/types/blueprints'
import { DOMAIN_CATEGORY_COLORS, DomainCategory } from '@/types/blueprints'
import {
  X,
  Users,
  Building2,
  BookOpen,
  ExternalLink,
  Plus,
  Check,
  HelpCircle,
  ShoppingBag,
} from 'lucide-react'

interface DomainDetailPanelProps {
  coverage: DomainCoverageWithDetails
  onClose: () => void
  onUpdateStatus: (status: CoverageStatus, notes?: string) => void
  onAddExpertise: () => void
  onRemoveExpertise: (id: string) => void
  isUpdating?: boolean
  className?: string
}

export function DomainDetailPanel({
  coverage,
  onClose,
  onUpdateStatus,
  onAddExpertise,
  onRemoveExpertise,
  isUpdating = false,
  className,
}: DomainDetailPanelProps) {
  const [status, setStatus] = useState<CoverageStatus>(coverage.status)
  const [notes, setNotes] = useState(coverage.notes || '')
  const [hasChanges, setHasChanges] = useState(false)

  const domain = coverage.domain!
  const category = domain.category as DomainCategory | null
  const categoryColors = category ? DOMAIN_CATEGORY_COLORS[category] : null

  const handleStatusChange = (newStatus: CoverageStatus) => {
    setStatus(newStatus)
    setHasChanges(true)
  }

  const handleNotesChange = (value: string) => {
    setNotes(value)
    setHasChanges(true)
  }

  const handleSave = () => {
    onUpdateStatus(status, notes)
    setHasChanges(false)
  }

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <CoverageIndicator status={coverage.status} showIcon size="lg" showLabel={false} />
          <div>
            <h2 className="font-semibold text-lg">{domain.name}</h2>
            {coverage.domain_path && coverage.domain_path !== domain.name && (
              <p className="text-sm text-muted-foreground">{coverage.domain_path}</p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Category & Criticality */}
        <div className="flex items-center gap-2 flex-wrap">
          {category && categoryColors && (
            <Badge
              variant="outline"
              className={cn(categoryColors.text, categoryColors.bg, categoryColors.border)}
            >
              {category}
            </Badge>
          )}
          {coverage.is_critical && (
            <Badge variant="destructive">Critical</Badge>
          )}
          {domain.learning_time_estimate && (
            <Badge variant="secondary">~{domain.learning_time_estimate} to learn</Badge>
          )}
        </div>

        {/* Description */}
        {domain.description && (
          <div>
            <p className="text-muted-foreground">{domain.description}</p>
          </div>
        )}

        <Separator />

        {/* Status Update */}
        <div className="space-y-3">
          <Label>Coverage Status</Label>
          <Select value={status} onValueChange={(v) => handleStatusChange(v as CoverageStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="covered">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  Covered
                </div>
              </SelectItem>
              <SelectItem value="partial">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  Partial
                </div>
              </SelectItem>
              <SelectItem value="gap">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-rose-500" />
                  Gap
                </div>
              </SelectItem>
              <SelectItem value="not_needed">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-slate-400" />
                  Not Needed
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Notes */}
        <div className="space-y-3">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Add notes about this domain..."
            rows={3}
          />
        </div>

        {/* Save button if changes */}
        {hasChanges && (
          <Button
            onClick={handleSave}
            disabled={isUpdating}
            className="w-full bg-international-orange hover:bg-international-orange/90"
          >
            <Check className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        )}

        <Separator />

        {/* Expertise / Who Covers This */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base">Who Covers This</Label>
            <Button variant="outline" size="sm" onClick={onAddExpertise}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>

          {coverage.expertise && coverage.expertise.length > 0 ? (
            <div className="space-y-2">
              {coverage.expertise.map((exp) => (
                <ExpertiseItem
                  key={exp.id}
                  expertise={exp}
                  onRemove={() => onRemoveExpertise(exp.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No one assigned yet
            </p>
          )}
        </div>

        <Separator />

        {/* Key Questions */}
        {domain.key_questions && domain.key_questions.length > 0 && (
          <div className="space-y-3">
            <Label className="text-base">Key Questions</Label>
            <div className="space-y-2">
              {domain.key_questions.map((q, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-md bg-muted text-sm"
                >
                  <p>{typeof q === 'string' ? q : q.question}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Learning Resources */}
        {domain.learning_resources && Object.keys(domain.learning_resources).length > 0 && (
          <div className="space-y-3">
            <Label className="text-base">Learning Resources</Label>
            <div className="space-y-2">
              {Object.entries(domain.learning_resources).map(([type, resources]) => (
                <div key={type}>
                  {Array.isArray(resources) && resources.map((resource, idx) => (
                    <a
                      key={idx}
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted text-sm"
                    >
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{resource.title}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {coverage.status === 'gap' && (
          <div className="space-y-3">
            <Label className="text-base">Fill This Gap</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={`/marketplace?q=${encodeURIComponent(domain.name)}`}>
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  Marketplace
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`/advisory/new?topic=${encodeURIComponent(domain.name)}`}>
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Ask Advisory
                </a>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Expertise item component
function ExpertiseItem({
  expertise,
  onRemove,
}: {
  expertise: Expertise
  onRemove: () => void
}) {
  const getPersonName = () => {
    if (expertise.profile) return expertise.profile.full_name
    if (expertise.external_contact) return expertise.external_contact.name
    if (expertise.marketplace_listing_id) return 'Marketplace Provider'
    return 'Unknown'
  }

  const getPersonType = () => {
    const types = {
      team: 'Team',
      advisor: 'Advisor',
      marketplace: 'Marketplace',
      external: 'External',
      ai_agent: 'AI Agent',
    }
    return types[expertise.person_type]
  }

  const getLevelColor = () => {
    if (expertise.expertise_level === 'expert') return 'text-emerald-600'
    if (expertise.expertise_level === 'competent') return 'text-blue-600'
    return 'text-amber-600'
  }

  return (
    <div className="flex items-center gap-3 p-2 rounded-md bg-muted">
      {expertise.profile ? (
        <UserAvatar
          name={expertise.profile.full_name}
          imageUrl={expertise.profile.avatar_url}
          size="sm"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
          {expertise.person_type === 'external' ? (
            <Building2 className="h-4 w-4" />
          ) : (
            <Users className="h-4 w-4" />
          )}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{getPersonName()}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{getPersonType()}</span>
          {expertise.expertise_level && (
            <>
              <span>•</span>
              <span className={getLevelColor()}>
                {expertise.expertise_level.charAt(0).toUpperCase() + expertise.expertise_level.slice(1)}
              </span>
            </>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
