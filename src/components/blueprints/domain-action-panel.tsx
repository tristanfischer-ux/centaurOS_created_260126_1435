'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { 
  DomainTreeNode, 
  DomainCategory, 
  FamiliarityLevel,
  DomainFamiliarity,
} from '@/types/blueprints'
import { 
  DOMAIN_CATEGORY_COLORS, 
  FAMILIARITY_LEVELS,
  getFamiliarityConfig,
} from '@/types/blueprints'
import {
  Target,
  CheckSquare,
  Users,
  Truck,
  Lightbulb,
  BookOpen,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Star,
  CheckCircle2,
  HelpCircle,
  GraduationCap,
  Sparkles,
  ExternalLink,
  FileText,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { setDomainFamiliarity, getDomainFamiliarity } from '@/actions/blueprints'
import { toast } from 'sonner'

interface DomainActionPanelProps {
  domain: DomainTreeNode | null
  templateName: string
  path: string
  open: boolean
  onOpenChange: (open: boolean) => void
  foundryId?: string
  onExpertReviewClick?: (domain: DomainTreeNode) => void
}

export function DomainActionPanel({
  domain,
  templateName,
  path,
  open,
  onOpenChange,
  foundryId,
  onExpertReviewClick,
}: DomainActionPanelProps) {
  const [familiarity, setFamiliarity] = useState<FamiliarityLevel>('unknown')
  const [familiarityData, setFamiliarityData] = useState<DomainFamiliarity | null>(null)
  const [isPending, startTransition] = useTransition()
  const [showPrimer, setShowPrimer] = useState(false)
  const [showQuestions, setShowQuestions] = useState(false)

  // Load familiarity when domain changes
  useEffect(() => {
    if (domain && open) {
      // Reset state
      setShowPrimer(false)
      setShowQuestions(false)
      
      // Load familiarity
      getDomainFamiliarity(domain.id).then(({ data }) => {
        if (data) {
          setFamiliarity(data.familiarity)
          setFamiliarityData(data)
        } else {
          setFamiliarity('unknown')
          setFamiliarityData(null)
        }
      })
    }
  }, [domain?.id, open])

  if (!domain) return null

  const categoryColors = domain.category 
    ? DOMAIN_CATEGORY_COLORS[domain.category as DomainCategory]
    : null

  const familiarityConfig = getFamiliarityConfig(familiarity)

  // Build marketplace query params
  const expertSearchParams = domain.marketplace_categories?.length > 0
    ? `?category=${encodeURIComponent(domain.marketplace_categories[0])}&type=advice`
    : '?type=advice'
  
  const supplierSearchParams = domain.supplier_categories?.length > 0
    ? `?category=${encodeURIComponent(domain.supplier_categories[0])}&type=supplier`
    : '?type=supplier'

  // Get primer content
  const primer = domain.primer
  const overview = primer?.overview || domain.description || null
  const keyConceptsList = primer?.key_concepts || []
  const decisionPoints = primer?.decision_points || []

  // Handle familiarity change with optimistic update and rollback
  const handleFamiliarityChange = (value: FamiliarityLevel) => {
    if (!foundryId) {
      toast.error('Please sign in to track familiarity')
      return
    }

    // Store previous value for rollback
    const previousValue = familiarity
    
    // Optimistic update
    setFamiliarity(value)
    
    startTransition(async () => {
      const { data, error } = await setDomainFamiliarity({
        domain_id: domain.id,
        foundry_id: foundryId,
        familiarity: value,
      })

      if (error) {
        // Revert to previous value on error
        setFamiliarity(previousValue)
        toast.error('Failed to save familiarity. Please try again.')
        return
      }

      if (data) {
        setFamiliarityData(data)
        toast.success('Familiarity updated')
      }
    })
  }

  // Get recommended action based on familiarity
  const getRecommendedAction = () => {
    switch (familiarity) {
      case 'expert':
        return {
          label: 'Document Decisions',
          description: 'Record your decisions for this domain',
          href: `/objectives?prefill=${encodeURIComponent(domain.name)}&type=document`,
          icon: FileText,
          color: 'text-status-success',
        }
      case 'familiar':
        return {
          label: 'Track as Objective',
          description: 'You understand the basics - start tracking progress',
          href: `/objectives?prefill=${encodeURIComponent(domain.name)}`,
          icon: Target,
          color: 'text-international-orange',
        }
      case 'learning':
        return {
          label: 'Study Materials',
          description: 'Build foundational knowledge with these resources',
          href: '#resources',
          icon: BookOpen,
          color: 'text-electric-blue',
          scrollTo: 'resources',
        }
      case 'unknown':
      default:
        return {
          label: 'Get Expert Review',
          description: 'Your team is unfamiliar - get guidance before committing',
          onClick: () => onExpertReviewClick?.(domain),
          icon: GraduationCap,
          color: 'text-chart-5',
        }
    }
  }

  const recommendedAction = getRecommendedAction()

  // Familiarity icon mapping
  const getFamiliarityIcon = (level: FamiliarityLevel) => {
    switch (level) {
      case 'expert': return Star
      case 'familiar': return CheckCircle2
      case 'learning': return BookOpen
      case 'unknown': return HelpCircle
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>{templateName}</span>
            {path !== domain.name && (
              <>
                <ChevronRight className="h-3 w-3" />
                <span className="truncate">{path.replace(` > ${domain.name}`, '')}</span>
              </>
            )}
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
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
        <div className="mt-6 space-y-6">
          {/* Section 1: Quick Overview - Show key info upfront */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-international-orange" />
              Quick Overview
            </h3>
            
            {/* Main overview text */}
            {overview ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {overview}
              </p>
            ) : (
              <div className="rounded-md border border-dashed border-muted-foreground/30 p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  No detailed overview available yet for this domain.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Consider getting an expert review to learn more about this area.
                </p>
              </div>
            )}

            {/* Key Decisions - Show upfront, these are most actionable */}
            {decisionPoints.length > 0 && (
              <div className="rounded-md border bg-status-warning-light/30 border-status-warning/20 p-3">
                <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
                  Key Decisions You&apos;ll Need to Make
                </p>
                <ul className="space-y-1.5">
                  {decisionPoints.slice(0, 4).map((point, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-status-warning font-bold shrink-0">{i + 1}.</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key Concepts - Compact display */}
            {keyConceptsList.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Related Concepts</p>
                <div className="flex flex-wrap gap-1.5">
                  {keyConceptsList.slice(0, 6).map((concept, i) => (
                    <Badge key={i} variant="secondary" className="text-xs font-normal">
                      {concept}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* AI generated indicator */}
            {primer?.ai_generated && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Overview generated from domain data
              </p>
            )}
          </section>

          <Separator />

          {/* Section 2: Team Familiarity */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-electric-blue" />
              Team Familiarity
            </h3>
            
            <p className="text-xs text-muted-foreground">
              How well does your team know this domain?
            </p>

            <RadioGroup
              value={familiarity}
              onValueChange={(value) => handleFamiliarityChange(value as FamiliarityLevel)}
              className="grid grid-cols-2 gap-2"
              disabled={isPending || !foundryId}
            >
              {FAMILIARITY_LEVELS.map((level) => {
                const Icon = getFamiliarityIcon(level.value)
                const isSelected = familiarity === level.value
                return (
                  <div key={level.value}>
                    <RadioGroupItem
                      value={level.value}
                      id={`familiarity-${level.value}`}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={`familiarity-${level.value}`}
                      className={cn(
                        "flex items-center gap-2 rounded-md border-2 p-3 cursor-pointer transition-all",
                        "hover:border-muted-foreground/50",
                        isSelected
                          ? cn("border-primary", level.bg)
                          : "border-muted bg-background"
                      )}
                    >
                      <Icon className={cn("h-4 w-4", isSelected ? level.text : "text-muted-foreground")} />
                      <div>
                        <p className={cn("text-sm font-medium", isSelected ? level.text : "text-foreground")}>
                          {level.label}
                        </p>
                      </div>
                    </Label>
                  </div>
                )
              })}
            </RadioGroup>

            {familiarityData?.updater && (
              <p className="text-xs text-muted-foreground">
                Last updated by {familiarityData.updater.full_name}
              </p>
            )}

            {/* Expandable Key Questions */}
            {domain.key_questions && domain.key_questions.length > 0 && (
              <Collapsible open={showQuestions} onOpenChange={setShowQuestions}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 text-xs h-8 px-2">
                    {showQuestions ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    See {domain.key_questions.length} Key Questions
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-medium text-foreground">
                      Questions your team should be able to answer:
                    </p>
                    <ul className="space-y-2">
                      {domain.key_questions.slice(0, 7).map((q, i) => (
                        <li key={q.id || i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="text-electric-blue font-medium shrink-0">{i + 1}.</span>
                          <span>{q.question}</span>
                        </li>
                      ))}
                      {domain.key_questions.length > 7 && (
                        <li className="text-xs text-muted-foreground italic pl-4">
                          +{domain.key_questions.length - 7} more questions
                        </li>
                      )}
                    </ul>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </section>

          <Separator />

          {/* Section 3: Take Action */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-international-orange" />
              Take Action
            </h3>

            {/* Recommended Action - Highlighted */}
            <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded-md", familiarityConfig.bg)}>
                  <recommendedAction.icon className={cn("h-5 w-5", recommendedAction.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                      Recommended
                    </Badge>
                  </div>
                  <p className="font-medium text-foreground">{recommendedAction.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {recommendedAction.description}
                  </p>
                </div>
              </div>
              {'href' in recommendedAction && recommendedAction.href ? (
                <Button asChild className="w-full mt-3" size="sm">
                  <Link href={recommendedAction.href}>
                    {recommendedAction.label}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              ) : 'onClick' in recommendedAction && recommendedAction.onClick ? (
                <Button onClick={recommendedAction.onClick} className="w-full mt-3" size="sm">
                  {recommendedAction.label}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : null}
            </div>

            {/* Action Grid - All actions always visible */}
            <div className="grid grid-cols-2 gap-2">
              <ActionButton
                href={`/objectives?prefill=${encodeURIComponent(domain.name)}`}
                icon={Target}
                iconColor="text-international-orange"
                label="Track Objective"
              />
              <ActionButton
                onClick={() => onExpertReviewClick?.(domain)}
                icon={MessageSquare}
                iconColor="text-chart-5"
                label="Expert Review"
              />
              <ActionButton
                href={`/new-tasks?prefill=${encodeURIComponent(`Research: ${domain.name}`)}`}
                icon={CheckSquare}
                iconColor="text-electric-blue"
                label="Add Task"
              />
              <ActionButton
                href={`/marketplace${supplierSearchParams}`}
                icon={Truck}
                iconColor="text-status-success"
                label="Find Supplier"
              />
            </div>

            {/* Secondary Links */}
            <div className="flex items-center gap-4 pt-2">
              <Link 
                href={`/marketplace${expertSearchParams}`}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <Users className="h-3 w-3" />
                Browse Experts
                <ExternalLink className="h-3 w-3" />
              </Link>
              {domain.learning_resources && Object.keys(domain.learning_resources).length > 0 && (
                <button
                  onClick={() => {
                    const el = document.getElementById('resources-section')
                    el?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <BookOpen className="h-3 w-3" />
                  Study Materials
                </button>
              )}
            </div>
          </section>

          {/* Learning Resources */}
          {domain.learning_resources && Object.keys(domain.learning_resources).length > 0 && (
            <>
              <Separator />
              <section id="resources-section">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  Learning Resources
                </h3>
                <div className="space-y-2">
                  {domain.learning_resources.courses?.slice(0, 3).map((resource, i) => (
                    <ResourceItem key={`course-${i}`} type="Course" resource={resource} />
                  ))}
                  {domain.learning_resources.books?.slice(0, 3).map((resource, i) => (
                    <ResourceItem key={`book-${i}`} type="Book" resource={resource} />
                  ))}
                  {domain.learning_resources.articles?.slice(0, 3).map((resource, i) => (
                    <ResourceItem key={`article-${i}`} type="Article" resource={resource} />
                  ))}
                  {domain.learning_resources.communities?.slice(0, 2).map((resource, i) => (
                    <ResourceItem key={`community-${i}`} type="Community" resource={resource} />
                  ))}
                  {domain.learning_resources.tools?.slice(0, 2).map((resource, i) => (
                    <ResourceItem key={`tool-${i}`} type="Tool" resource={resource} />
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Typical Roles - Collapsed at bottom */}
          {domain.typical_roles && domain.typical_roles.length > 0 && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  Who Typically Handles This
                </h3>
                <div className="flex flex-wrap gap-2">
                  {domain.typical_roles.map((role, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {role}
                    </Badge>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

// Action button component for the grid
function ActionButton({
  href,
  onClick,
  icon: Icon,
  iconColor,
  label,
}: {
  href?: string
  onClick?: () => void
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  label: string
}) {
  const content = (
    <div className="flex flex-col items-center gap-1.5 py-3">
      <Icon className={cn("h-5 w-5", iconColor)} />
      <span className="text-xs font-medium text-foreground">{label}</span>
    </div>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-md border bg-background hover:bg-muted transition-colors"
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      onClick={onClick}
      className="rounded-md border bg-background hover:bg-muted transition-colors w-full"
    >
      {content}
    </button>
  )
}

// Resource item component
function ResourceItem({ 
  type, 
  resource 
}: { 
  type: string
  resource: { title: string; url?: string; description?: string } 
}) {
  const content = (
    <div className="flex items-start gap-2 text-sm">
      <Badge variant="outline" className="text-[10px] shrink-0">{type}</Badge>
      <div className="min-w-0">
        <span className={cn(
          "text-foreground",
          resource.url && "hover:underline"
        )}>
          {resource.title}
        </span>
        {resource.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {resource.description}
          </p>
        )}
      </div>
    </div>
  )

  if (resource.url) {
    return (
      <a 
        href={resource.url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="block p-2 rounded hover:bg-muted transition-colors"
      >
        {content}
      </a>
    )
  }

  return <div className="p-2">{content}</div>
}
