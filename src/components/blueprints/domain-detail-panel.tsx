'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserAvatar } from '@/components/ui/user-avatar'
import { CoverageIndicator } from './coverage-indicator'
import type { DomainCoverageWithDetails, CoverageStatus, Expertise } from '@/types/blueprints'
import { DOMAIN_CATEGORY_COLORS, DomainCategory } from '@/types/blueprints'
import {
  Users,
  Building2,
  BookOpen,
  ExternalLink,
  Plus,
  Check,
  HelpCircle,
  ShoppingBag,
  Clock,
  AlertTriangle,
  X,
} from 'lucide-react'
import { sanitizeHref } from '@/lib/security/url-validation'

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
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <DialogHeader className="space-y-1 pb-4 border-b">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <CoverageIndicator status={coverage.status} showIcon size="lg" showLabel={false} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg leading-tight">{domain.name}</DialogTitle>
              {coverage.domain_path && coverage.domain_path !== domain.name && (
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {coverage.domain_path}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Category & metadata badges */}
        <div className="flex items-center gap-2 flex-wrap pt-2">
          {category && categoryColors && (
            <Badge variant="info" className="text-xs">
              {category}
            </Badge>
          )}
          {domain.learning_time_estimate && (
            <Badge variant="secondary" className="text-xs">
              <Clock className="mr-1 h-3 w-3" />
              ~{domain.learning_time_estimate}
            </Badge>
          )}
          {coverage.is_critical && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Critical
            </Badge>
          )}
        </div>
      </DialogHeader>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-6 py-6">
        {/* Description */}
        {domain.description && (
          <p className="text-muted-foreground leading-relaxed">{domain.description}</p>
        )}

        {/* Actions for gaps - shown prominently at top */}
        {coverage.status === 'gap' && (
          <Card className="border-l-4 border-l-destructive bg-status-error-light/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Fill This Gap
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button asChild>
                  <a href={`/marketplace?q=${encodeURIComponent(domain.name)}`}>
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    Marketplace
                  </a>
                </Button>
                <Button variant="secondary" asChild>
                  <a href={`/advisory/new?topic=${encodeURIComponent(domain.name)}`}>
                    <HelpCircle className="mr-2 h-4 w-4" />
                    Ask Advisory
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status & Notes Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Coverage Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={status} onValueChange={(v) => handleStatusChange(v as CoverageStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="covered">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-status-success" />
                    Covered
                  </div>
                </SelectItem>
                <SelectItem value="partial">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-status-warning" />
                    Partial
                  </div>
                </SelectItem>
                <SelectItem value="gap">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-destructive" />
                    Gap
                  </div>
                </SelectItem>
                <SelectItem value="not_needed">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                    Not Needed
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="space-y-2">
              <Label htmlFor="domain-notes" className="text-sm font-medium">Notes</Label>
              <Textarea
                id="domain-notes"
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Add notes about this domain..."
                rows={3}
              />
            </div>

            {hasChanges && (
              <Button
                onClick={handleSave}
                disabled={isUpdating}
                className="w-full"
              >
                <Check className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Expertise / Who Covers This */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Who Covers This</CardTitle>
              <Button variant="secondary" size="sm" onClick={onAddExpertise}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
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
              <p className="text-sm text-muted-foreground py-6 text-center">
                No one assigned yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Key Questions */}
        {domain.key_questions && domain.key_questions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Key Questions</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        )}

        {/* Learning Resources */}
        {/* SECURITY: Sanitize resource URLs before rendering */}
        {domain.learning_resources && Object.keys(domain.learning_resources).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Learning Resources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {Object.entries(domain.learning_resources).map(([type, resources]) => (
                  <div key={type}>
                    {Array.isArray(resources) && resources.map((resource, idx) => {
                      const sanitizedUrl = sanitizeHref(resource.url)
                      if (sanitizedUrl === '#') return null
                      return (
                        <a
                          key={idx}
                          href={sanitizedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 rounded-md hover:bg-muted text-sm transition-colors"
                        >
                          <BookOpen className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1">{resource.title}</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )
                    })}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
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
    if (expertise.expertise_level === 'expert') return 'text-status-success'
    if (expertise.expertise_level === 'competent') return 'text-status-info'
    return 'text-status-warning'
  }

  return (
    <div className="flex items-center gap-3 p-2 rounded-md bg-muted">
      {expertise.profile ? (
        <UserAvatar
          name={expertise.profile.full_name}
          avatarUrl={expertise.profile.avatar_url}
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
        aria-label="Remove expertise"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
