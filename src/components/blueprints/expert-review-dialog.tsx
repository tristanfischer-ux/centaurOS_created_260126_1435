'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { DomainTreeNode, ExpertReviewPacket } from '@/types/blueprints'
import { DOMAIN_CATEGORY_COLORS, getFamiliarityConfig, DomainCategory } from '@/types/blueprints'
import {
  Copy,
  Check,
  Send,
  FileText,
  ExternalLink,
  AlertTriangle,
  Users,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { generateExpertReviewPacket } from '@/actions/blueprints'
import { toast } from 'sonner'

interface ExpertReviewDialogProps {
  domain: DomainTreeNode | null
  open: boolean
  onOpenChange: (open: boolean) => void
  blueprintId?: string
}

export function ExpertReviewDialog({
  domain,
  open,
  onOpenChange,
  blueprintId,
}: ExpertReviewDialogProps) {
  const [packet, setPacket] = useState<ExpertReviewPacket | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [additionalContext, setAdditionalContext] = useState('')
  const [isPending, startTransition] = useTransition()

  // Generate packet when dialog opens
  useEffect(() => {
    if (open && domain) {
      setIsLoading(true)
      setCopied(false)
      setAdditionalContext('')
      
      generateExpertReviewPacket(domain.id, { blueprintId }).then(({ data, error }) => {
        setIsLoading(false)
        if (error) {
          toast.error('Failed to generate expert review packet')
          return
        }
        setPacket(data)
      })
    }
  }, [open, domain, blueprintId])

  if (!domain) return null

  const categoryColors = domain.category 
    ? DOMAIN_CATEGORY_COLORS[domain.category as DomainCategory]
    : null

  // Format packet as text for copying
  const formatPacketAsText = () => {
    if (!packet) return ''
    
    let text = `# Expert Review Request: ${packet.domain.name}\n\n`
    
    if (packet.domain.path !== packet.domain.name) {
      text += `**Domain Path:** ${packet.domain.path}\n`
    }
    text += `**Category:** ${packet.domain.category || 'General'}\n`
    text += `**Criticality:** ${packet.domain.criticality}\n`
    text += `**Team Familiarity:** ${getFamiliarityConfig(packet.team_familiarity).label}\n\n`
    
    if (packet.project_context) {
      text += `## Project Context\n`
      if (packet.project_context.blueprint_name) {
        text += `- Project: ${packet.project_context.blueprint_name}\n`
      }
      if (packet.project_context.project_stage) {
        text += `- Stage: ${packet.project_context.project_stage}\n`
      }
      text += '\n'
    }
    
    if (packet.primer_overview) {
      text += `## Domain Overview\n${packet.primer_overview}\n\n`
    }
    
    if (packet.unanswered_questions.length > 0) {
      text += `## Key Questions We Need Help With\n\n`
      for (let i = 0; i < packet.unanswered_questions.length; i++) {
        const q = packet.unanswered_questions[i]
        text += `${i + 1}. ${q.question}\n`
        if (q.context) {
          text += `   _Context: ${q.context}_\n`
        }
        text += '\n'
      }
    }
    
    if (additionalContext) {
      text += `## Additional Context\n${additionalContext}\n\n`
    }
    
    text += `---\n`
    text += `Requested by: ${packet.requested_by.name} at ${packet.requested_by.foundry_name}\n`
    text += `Generated: ${new Date(packet.generated_at).toLocaleDateString()}\n`
    
    return text
  }

  const handleCopy = async () => {
    const text = formatPacketAsText()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Question packet copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  // Build marketplace search params for finding experts
  const expertSearchParams = domain.marketplace_categories?.length > 0
    ? `?category=${encodeURIComponent(domain.marketplace_categories[0])}&type=advice&domain=${encodeURIComponent(domain.name)}`
    : `?type=advice&search=${encodeURIComponent(domain.name)}`

  // Build RFQ params
  const rfqParams = `?title=${encodeURIComponent(`Expert guidance needed: ${domain.name}`)}&description=${encodeURIComponent(formatPacketAsText())}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <FileText className="h-3 w-3" />
            Expert Review Request
          </div>
          <DialogTitle className="text-xl flex items-center gap-2">
            {domain.name}
            {domain.criticality === 'critical' && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Critical
              </Badge>
            )}
          </DialogTitle>
          {categoryColors && (
            <Badge 
              variant="secondary" 
              className={cn("w-fit", categoryColors.bg, categoryColors.text)}
            >
              {domain.category}
            </Badge>
          )}
          <DialogDescription>
            Generate a question packet to share with experts for guidance on this domain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : packet ? (
            <>
              {/* Domain Overview */}
              {packet.primer_overview && (
                <section>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-international-orange" />
                    Domain Overview
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed bg-muted/50 p-3 rounded-md">
                    {packet.primer_overview}
                  </p>
                </section>
              )}

              {/* Team Familiarity */}
              <section>
                <h4 className="text-sm font-semibold text-foreground mb-2">
                  Team Familiarity
                </h4>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="secondary"
                    className={cn(
                      "text-xs",
                      getFamiliarityConfig(packet.team_familiarity).bg,
                      getFamiliarityConfig(packet.team_familiarity).text
                    )}
                  >
                    {getFamiliarityConfig(packet.team_familiarity).label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {getFamiliarityConfig(packet.team_familiarity).description}
                  </span>
                </div>
              </section>

              <Separator />

              {/* Key Questions */}
              <section>
                <h4 className="text-sm font-semibold text-foreground mb-3">
                  Key Questions ({packet.unanswered_questions.length})
                </h4>
                {packet.unanswered_questions.length > 0 ? (
                  <div className="space-y-3">
                    {packet.unanswered_questions.map((q, i) => (
                      <div 
                        key={q.id || i} 
                        className="p-3 rounded-md border bg-background"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {i + 1}. {q.question}
                        </p>
                        {q.context && (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            Context: {q.context}
                          </p>
                        )}
                        {q.difficulty && (
                          <Badge variant="outline" className="text-[10px] mt-2">
                            {q.difficulty}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No specific questions defined for this domain yet.
                  </p>
                )}
              </section>

              <Separator />

              {/* Additional Context */}
              <section>
                <Label htmlFor="additional-context" className="text-sm font-semibold">
                  Additional Context (Optional)
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Add any specific details about your project or questions for the expert.
                </p>
                <Textarea
                  id="additional-context"
                  placeholder="E.g., We're building a small satellite launcher and need guidance on propellant selection for our specific mission profile..."
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  rows={3}
                />
              </section>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Unable to generate question packet.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={handleCopy}
              disabled={!packet || isLoading}
              className="flex-1 sm:flex-none"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-status-success" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </>
              )}
            </Button>
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <Button asChild variant="outline" className="flex-1 sm:flex-none">
              <Link href={`/marketplace${expertSearchParams}`}>
                <Users className="h-4 w-4 mr-2" />
                Find Expert
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
            
            <Button asChild className="flex-1 sm:flex-none bg-international-orange hover:bg-international-orange/90">
              <Link href={`/rfqs/new${rfqParams}`}>
                <Send className="h-4 w-4 mr-2" />
                Post RFQ
              </Link>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
