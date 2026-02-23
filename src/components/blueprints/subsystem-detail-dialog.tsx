'use client'

/**
 * SubsystemDetailDialog - Full detail view of a universal subsystem
 * 
 * @description Shows comprehensive information about a subsystem including
 * its primer, key questions, learning resources, and action buttons for
 * creating objectives and finding marketplace experts.
 * 
 * @component
 */

import { useState } from 'react'
import Link from 'next/link'
import * as LucideIcons from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Target,
  Users,
  ShoppingCart,
  BookOpen,
  HelpCircle,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UniversalSubsystem, SubsystemObjectivePack } from '@/types/blueprints'
import { DOMAIN_CATEGORY_COLORS } from '@/types/blueprints'

interface SubsystemDetailDialogProps {
  /** The subsystem to display */
  subsystem: UniversalSubsystem | null
  /** The default objective pack for this subsystem */
  objectivePack: SubsystemObjectivePack | null
  /** Whether the dialog is open */
  open: boolean
  /** Called when dialog is closed */
  onOpenChange: (open: boolean) => void
  /** Called when user wants to create an objective */
  onCreateObjective: (subsystem: UniversalSubsystem, pack: SubsystemObjectivePack) => void
}

/**
 * Gets a Lucide icon component by name
 */
function getIconComponent(iconName: string): React.ComponentType<{ className?: string }> {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>
  return icons[iconName] || icons.Box
}

/**
 * Difficulty badge with appropriate styling
 */
function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const config = {
    beginner: { bg: 'bg-status-success-light', text: 'text-status-success' },
    intermediate: { bg: 'bg-status-warning-light', text: 'text-status-warning' },
    advanced: { bg: 'bg-status-error-light', text: 'text-destructive' },
  }[difficulty] || { bg: 'bg-muted', text: 'text-muted-foreground' }
  
  return (
    <Badge variant="outline" className={cn(config.bg, config.text, 'border-0')}>
      {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
    </Badge>
  )
}

export function SubsystemDetailDialog({
  subsystem,
  objectivePack,
  open,
  onOpenChange,
  onCreateObjective,
}: SubsystemDetailDialogProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>(['overview', 'questions'])
  
  if (!subsystem) return null
  
  const Icon = getIconComponent(subsystem.icon_name)
  const categoryColors = DOMAIN_CATEGORY_COLORS[subsystem.category]
  const primer = subsystem.primer
  
  // Build marketplace links
  const expertMarketplaceUrl = `/marketplace?category=${subsystem.marketplace_categories[0] || 'general'}&type=advice`
  const supplierMarketplaceUrl = `/marketplace?category=${subsystem.marketplace_categories[0] || 'general'}&type=supplier`
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] p-0 overflow-hidden">
        <div className="overflow-y-auto max-h-[85vh] p-6">
            <DialogHeader className="mb-6">
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center',
                    categoryColors.bg
                  )}
                >
                  <Icon className={cn('h-6 w-6', categoryColors.text)} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-xl font-bold text-foreground">
                    {subsystem.name}
                  </DialogTitle>
                  <p className="text-muted-foreground mt-1">{subsystem.tagline}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary">{subsystem.category}</Badge>
                    {objectivePack && (
                      <DifficultyBadge difficulty={objectivePack.difficulty} />
                    )}
                  </div>
                </div>
              </div>
            </DialogHeader>
            
            {/* Quick Actions */}
            <Card className="mb-6 bg-muted/30 border-dashed">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {objectivePack && (
                    <Button
                      onClick={() => onCreateObjective(subsystem, objectivePack)}
                      className="gap-2"
                    >
                      <Target className="h-4 w-4" />
                      Create Objective
                    </Button>
                  )}
                  <Button variant="outline" className="gap-2" asChild>
                    <Link href={expertMarketplaceUrl}>
                      <Users className="h-4 w-4" />
                      Find Experts
                    </Link>
                  </Button>
                  <Button variant="outline" className="gap-2" asChild>
                    <Link href={supplierMarketplaceUrl}>
                      <ShoppingCart className="h-4 w-4" />
                      Find Suppliers
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            {/* Objective Pack Preview */}
            {objectivePack && (
              <Card className="mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4 text-international-orange" />
                    {objectivePack.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground mb-3">
                    {objectivePack.summary}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {objectivePack.estimated_duration && (
                      <span>{objectivePack.estimated_duration}</span>
                    )}
                    <span>{objectivePack.tasks.length} tasks</span>
                    {objectivePack.tasks.filter(t => t.is_marketplace_task).length > 0 && (
                      <span className="text-international-orange">
                        Includes marketplace discovery
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Main Content Accordion */}
            <Accordion
              type="multiple"
              value={expandedSections}
              onValueChange={setExpandedSections}
              className="space-y-4"
            >
              {/* Overview Section */}
              {primer?.overview && (
                <AccordionItem value="overview" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">Overview</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="prose prose-sm max-w-none text-muted-foreground">
                      {primer.overview.split('\n\n').map((paragraph, i) => (
                        <p key={i} className="mb-3 last:mb-0">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                    
                    {primer.why_it_matters && (
                      <div className="mt-4 p-3 bg-status-warning-light rounded-lg">
                        <p className="text-sm font-medium text-status-warning-dark mb-1">
                          Why It Matters
                        </p>
                        <p className="text-sm text-foreground">{primer.why_it_matters}</p>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              )}
              
              {/* Key Questions Section */}
              {subsystem.key_questions.length > 0 && (
                <AccordionItem value="questions" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">
                        Key Questions ({subsystem.key_questions.length})
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      {subsystem.key_questions.map((q, index) => (
                        <div
                          key={q.id}
                          className="p-3 bg-muted/50 rounded-lg"
                        >
                          <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-background border text-xs font-medium flex items-center justify-center">
                              {index + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground">
                                {q.question}
                              </p>
                              {q.context && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {q.context}
                                </p>
                              )}
                              {q.difficulty && (
                                <Badge
                                  variant="outline"
                                  className="mt-2 text-xs capitalize"
                                >
                                  {q.difficulty}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
              
              {/* Key Concepts Section */}
              {primer?.key_concepts && primer.key_concepts.length > 0 && (
                <AccordionItem value="concepts" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">
                        Key Concepts ({primer.key_concepts.length})
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2">
                      {primer.key_concepts.map((concept, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <ArrowRight className="h-4 w-4 text-international-orange flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-muted-foreground">
                            {concept}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              )}
              
              {/* Decision Points Section */}
              {primer?.decision_points && primer.decision_points.length > 0 && (
                <AccordionItem value="decisions" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">
                        Decision Points ({primer.decision_points.length})
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2">
                      {primer.decision_points.map((point, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <div className="flex-shrink-0 w-5 h-5 rounded bg-status-info-light flex items-center justify-center">
                            <span className="text-xs font-medium text-status-info">
                              {index + 1}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {point}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              )}
              
              {/* Common Mistakes Section */}
              {primer?.common_mistakes && primer.common_mistakes.length > 0 && (
                <AccordionItem value="mistakes" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">
                        Common Mistakes ({primer.common_mistakes.length})
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2">
                      {primer.common_mistakes.map((mistake, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-muted-foreground">
                            {mistake}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              )}
              
              {/* Success Indicators Section */}
              {primer?.success_indicators && primer.success_indicators.length > 0 && (
                <AccordionItem value="success" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">
                        Success Indicators ({primer.success_indicators.length})
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2">
                      {primer.success_indicators.map((indicator, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-muted-foreground">
                            {indicator}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              )}
              
              {/* Terminology Section */}
              {primer?.terminology && Object.keys(primer.terminology).length > 0 && (
                <AccordionItem value="terminology" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">
                        Terminology ({Object.keys(primer.terminology).length})
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <dl className="space-y-3">
                      {Object.entries(primer.terminology).map(([term, definition]) => (
                        <div key={term} className="flex flex-col">
                          <dt className="font-medium text-foreground">{term}</dt>
                          <dd className="text-sm text-muted-foreground mt-0.5">
                            {definition}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </AccordionContent>
                </AccordionItem>
              )}
              
              {/* Learning Resources Section */}
              {subsystem.learning_resources && (
                <AccordionItem value="resources" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">Learning Resources</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      {subsystem.learning_resources.courses &&
                        subsystem.learning_resources.courses.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-foreground mb-2">
                              Courses
                            </h4>
                            <ul className="space-y-2">
                              {subsystem.learning_resources.courses.map((course, i) => (
                                <li key={i}>
                                  {course.url ? (
                                    <a
                                      href={course.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-electric-blue hover:underline"
                                    >
                                      {course.title}
                                    </a>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">
                                      {course.title}
                                    </span>
                                  )}
                                  {course.provider && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      — {course.provider}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      
                      {subsystem.learning_resources.books &&
                        subsystem.learning_resources.books.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-foreground mb-2">
                              Books
                            </h4>
                            <ul className="space-y-2">
                              {subsystem.learning_resources.books.map((book, i) => (
                                <li key={i}>
                                  <span className="text-sm text-foreground">
                                    {book.title}
                                  </span>
                                  {book.author && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      by {book.author}
                                    </span>
                                  )}
                                  {book.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {book.description}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      
                      {subsystem.learning_resources.communities &&
                        subsystem.learning_resources.communities.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-foreground mb-2">
                              Communities
                            </h4>
                            <ul className="space-y-2">
                              {subsystem.learning_resources.communities.map((community, i) => (
                                <li key={i}>
                                  {community.url ? (
                                    <a
                                      href={community.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-electric-blue hover:underline"
                                    >
                                      {community.title}
                                    </a>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">
                                      {community.title}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
            
            {/* Footer Actions */}
            <Separator className="my-6" />
            
            <div className="flex flex-col sm:flex-row gap-3">
              {objectivePack && (
                <Button
                  onClick={() => onCreateObjective(subsystem, objectivePack)}
                  className="flex-1 gap-2"
                >
                  <Target className="h-4 w-4" />
                  Create Objective with {objectivePack.tasks.length} Tasks
                </Button>
              )}
              <Button variant="outline" className="flex-1 gap-2" asChild>
                <Link href={expertMarketplaceUrl}>
                  <Users className="h-4 w-4" />
                  Browse {subsystem.name} Experts
                </Link>
              </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
